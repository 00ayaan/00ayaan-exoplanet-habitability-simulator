/**
 * App shell: owns the single AppState, builds the layout once, and funnels
 * every change through scheduleUpdate() → update() (one rAF per frame, so
 * slider drags stay smooth on phones). Also owns URL sync (query = shareable
 * state, hash = phone section) and the phone section tabs.
 */
import type { SimulationOutput, StarType } from '../physics/types';
import { h, replace } from './dom';
import { kelvin, celsius, num } from './format';
import { icon } from './icons';
import { EARTH_GREENHOUSE, loadCatalog, simulate, starPresets, hypotheticalPlanet } from './engine';
import { FEATURED_PLANETS, PRESETS, presetById } from './presets';
import {
  type AppState, type ControlKey, type ScenarioTab, type TabId, FIELD_LABELS, TABS,
  buildInput, controlsFor, hypoBaseline, hypoDirty, initialState, presetControls, realBaseline,
  recomputeModified, scenarioName, selectedEntry, sourceTag,
} from './state';
import { LIMITS, decodeQuery, encodeState, quantizeGreenhouse } from './urlState';
import { blackbodyColor } from './starColor';
import { Segmented } from './components/segmented';
import { Slider } from './components/slider';
import { Help } from './components/help';
import { badge, setBadge } from './components/badge';
import { PlanetPicker } from './components/planetPicker';
import { renderCatalogDetails, renderStarStats } from './components/measured';
import { OrbitView } from './components/orbitView';
import { MetricGrid } from './components/metrics';
import { VerdictCard } from './components/verdict';
import { renderAssumptions } from './components/assumptions';
import { renderDataBanner } from './components/dataBanner';
import { renderProvenanceLine } from './components/provenance';
import { ResultBar } from './components/resultBar';

const REPO_README = 'https://github.com/00ayaan/00ayaan-exoplanet-habitability-simulator#readme';
const DESKTOP_MQ = '(min-width: 1024px)';
const STAR_OPTIONS: readonly [StarType, string][] = [
  ['O', 'O — Blue giant'], ['B', 'B — Blue-white'], ['A', 'A — White'], ['F', 'F — Yellow-white'],
  ['G', 'G — Yellow (Sun-like)'], ['K', 'K — Orange dwarf'], ['M', 'M — Red dwarf'], ['WD', 'White dwarf'],
];
const box = (sig: number) => (d: number) => String(Number(d.toPrecision(sig)));

const WATER_TEXT: Record<string, string> = {
  liquid: 'liquid water', ice: 'water frozen', vapor: 'water boils off as vapor',
  'no-liquid-below-triple-point': 'air too thin for liquid water',
};

export function mountApp(root: HTMLElement): void {
  const state: AppState = initialState();
  const desktop = typeof matchMedia === 'function' ? matchMedia(DESKTOP_MQ) : null;
  const isDesktop = () => !!desktop?.matches;

  // ---- restore from URL ---------------------------------------------------
  const decoded = decodeQuery(location.search);
  if (decoded) {
    state.scenario = decoded.scenario;
    state.compare = decoded.compare;
    state.preset = decoded.preset;
    state.starType = decoded.starType;
    state.hypo = decoded.hypo;
    state.mode = decoded.mode;
    if (decoded.mode === 'real') state.pendingReal = { planetId: decoded.planetId, overrides: decoded.realOverrides, scenario: decoded.scenario };
  }
  const tabFromHash = (): TabId => {
    const t = location.hash.replace('#', '');
    return (TABS.some((x) => x.id === t) ? t : 'setup') as TabId;
  };
  state.tab = tabFromHash();

  // ---- update scheduling + URL sync --------------------------------------
  let pending = 0;
  let needsSim = true;
  const scheduleUpdate = (sim = true) => {
    needsSim ||= sim;
    if (!pending) pending = requestAnimationFrame(() => { pending = 0; update(); });
  };
  let urlTimer = 0;
  const writeUrl = () => {
    window.clearTimeout(urlTimer);
    if (state.pendingReal) return; // not resolved yet: keep the incoming URL as is
    const url = `?${encodeState(state)}${location.hash}`;
    if (url !== location.search + location.hash) {
      try { history.replaceState(history.state, '', url); } catch { /* sandboxed: ignore */ }
    }
  };
  const scheduleUrl = () => { window.clearTimeout(urlTimer); urlTimer = window.setTimeout(writeUrl, 300); };

  let earthRef: SimulationOutput | null = null;
  const earthOutput = () => {
    if (!earthRef) {
      const e = presetById('earth')!;
      const c = presetControls(e);
      earthRef = simulate({
        star: starPresets.G,
        planet: { ...hypotheticalPlanet(1), name: 'Earth', mass_Mearth: 1, radius_Rearth: 1 },
        atmosphere: { surfacePressure_bar: c.pressure_bar, greenhouse: c.greenhouse, albedo: c.albedo },
        mode: 'hypothetical', modifiedFields: [],
      });
    }
    return earthRef;
  };

  // ---- actions --------------------------------------------------------------
  const setControl = (key: ControlKey, v: number) => {
    controlsFor(state)[key] = v;
    if (state.mode === 'real') recomputeModified(state);
    scheduleUpdate();
  };
  const selectPlanet = (id: string, scenario: ScenarioTab) => {
    state.mode = 'real';
    state.scenario = scenario;
    state.selectedId = id;
    const entry = selectedEntry(state);
    if (entry) state.real = realBaseline(entry);
    state.modified.clear();
    scheduleUpdate();
  };
  const selectPreset = (id: string) => {
    const p = presetById(id);
    if (!p) return;
    state.mode = 'hypothetical';
    state.scenario = 'preset';
    state.preset = p.id;
    state.starType = p.starType;
    state.hypo = presetControls(p);
    scheduleUpdate();
  };
  const catalogUsable = () => state.catalogStatus === 'ok' && !!state.catalog?.entries.length;
  const featured = () => FEATURED_PLANETS
    .map((n) => state.catalog?.entries.find((e) => e.planet.name === n))
    .filter((e): e is NonNullable<typeof e> => !!e);
  const setScenario = (t: ScenarioTab) => {
    state.scenario = t;
    if (t === 'hypothetical') state.mode = 'hypothetical';
    else if (t === 'preset') {
      const cur = selectedEntry(state);
      if (!(state.mode === 'real' && cur && featured().includes(cur))) state.mode = 'hypothetical';
    } else if (catalogUsable() || state.catalogStatus === 'loading') state.mode = 'real';
    scheduleUpdate();
  };
  const reset = () => {
    if (state.mode === 'real') {
      const entry = selectedEntry(state);
      if (entry) { state.real = realBaseline(entry); state.modified.clear(); }
    } else {
      const b = hypoBaseline(state);
      state.starType = b.starType;
      state.hypo = { ...b.values };
    }
    scheduleUpdate();
  };

  // ---- header ---------------------------------------------------------------
  const toast = h('p', { class: 'toast', role: 'status', 'aria-live': 'polite' });
  let toastTimer = 0;
  const flash = (...nodes: (Node | string)[]) => {
    replace(toast, ...nodes);
    toast.classList.add('is-on');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove('is-on'), 3000);
  };
  const share = async () => {
    writeUrl();
    // Shared links carry the scenario only; the phone tab (#hash) stays local.
    const u = new URL(location.href);
    u.hash = '';
    const url = u.href;
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    if (typeof nav.share === 'function') {
      try { await nav.share({ title: document.title, text: `${scenarioName(state)} in the Exoplanet Habitability Simulator`, url }); return; }
      catch (e) { if (e instanceof DOMException && e.name === 'AbortError') return; }
    }
    try {
      await navigator.clipboard.writeText(url);
      flash('Link copied');
    } catch {
      const field = h('input', { type: 'text', readonly: true, value: url, class: 'toast__field', 'aria-label': 'Link to this scenario' });
      flash('Copy this link: ', field);
      field.focus(); field.select();
    }
  };
  const shareBtn = h('button', { type: 'button', class: 'btn btn--primary', 'aria-label': 'Share a link to this scenario' }, icon('link', 15), h('span', { class: 'btn__text' }, 'Share'));
  shareBtn.addEventListener('click', () => { void share(); });
  const resetBtn = h('button', { type: 'button', class: 'btn btn--outline' }, icon('reset', 15), h('span', { class: 'btn__text' }, 'Reset'));
  resetBtn.addEventListener('click', reset);

  // ---- scenario card -------------------------------------------------------
  const nameEl = h('h2', { class: 'scenario__name' });
  const scenarioTabs = new Segmented<ScenarioTab>('Scenario type', 'segments', [
    { value: 'hypothetical', label: 'Hypothetical' }, { value: 'preset', label: 'Known planet' }, { value: 'nasa', label: 'NASA search' },
  ], setScenario);
  const bannerEl = h('div', { class: 'banner-slot' });
  let notice: string | null = null;
  const noticeEl = h('div', { class: 'banner-slot' });
  const renderNotice = () => {
    if (!notice) { replace(noticeEl); return; }
    const dismiss = h('button', { type: 'button', class: 'btn btn--outline banner__x', 'aria-label': 'Dismiss notice' }, 'Dismiss');
    dismiss.addEventListener('click', () => { notice = null; renderNotice(); });
    replace(noticeEl, h('div', { class: 'banner banner--sky banner--action', role: 'status' }, icon('info', 16), h('span', {}, notice), dismiss));
  };

  const hypoBody = h('p', { class: 'muted small' }, 'Build a world from scratch: pick a star class below and drag the sliders.');
  const knownSelect = h('select', { class: 'select', id: 'known-select' });
  knownSelect.addEventListener('change', () => {
    const v = knownSelect.value;
    if (v.startsWith('preset:')) selectPreset(v.slice(7));
    else if (v.startsWith('planet:')) selectPlanet(v.slice(7), 'preset');
  });
  const knownDesc = h('p', { class: 'muted small' });
  const knownBody = h('div', { class: 'stack-sm' }, h('label', { for: 'known-select', class: 'visually-hidden' }, 'Known planet'), h('div', { class: 'select-wrap' }, knownSelect, icon('chevron', 16)), knownDesc);
  let knownKey = '';

  const picker = new PlanetPicker((q) => { state.filter = q; scheduleUpdate(false); }, (id) => selectPlanet(id, 'nasa'));

  const modChip = h('div', { class: 'modchip-slot' });

  const starSelect = h('select', { class: 'select select--star', id: 'star-select' });
  for (const [v, t] of STAR_OPTIONS) starSelect.append(h('option', { value: v }, t));
  const catalogOpt = h('option', { value: 'catalog', hidden: true });
  starSelect.append(catalogOpt);
  starSelect.addEventListener('change', () => {
    const v = starSelect.value as StarType;
    if (STAR_OPTIONS.some(([t]) => t === v)) { state.starType = v; if (state.scenario === 'preset' && !presetById(state.preset)) state.scenario = 'hypothetical'; scheduleUpdate(); }
  });
  const starDot = h('span', { class: 'star-dot', 'aria-hidden': 'true' });
  const starBadge = badge('assumed');
  const starStats = h('div', { class: 'inset' });

  const aSlider = new Slider({
    label: 'Orbital distance a', unit: 'AU', scale: 'log', min: LIMITS.a_AU[0], max: LIMITS.a_AU[1], format: box(4),
    ticks: [{ value: 0.05, label: '0.05' }, { value: 1, label: '1 AU' }, { value: 5.2, label: 'Jupiter' }],
    help: 'How far the planet orbits from its star, on average (the semi-major axis). 1 AU is the Earth–Sun distance. Closer means more starlight.',
    onInput: (v) => setControl('a_AU', v),
  });
  const pSlider = new Slider({
    label: 'Surface pressure Pₛ', unit: 'bar', scale: 'log', min: LIMITS.pressure_bar[0], max: LIMITS.pressure_bar[1], format: box(4),
    ticks: [{ value: 0.006, label: 'Mars' }, { value: 1, label: 'Earth' }, { value: 92, label: 'Venus' }],
    help: 'How hard the air presses on the ground. Earth is about 1 bar. Below 0.006 bar water cannot stay liquid. In this model pressure does not change the temperature (DESIGN §12).',
    onInput: (v) => setControl('pressure_bar', v),
  });
  const gSlider = new Slider({
    label: 'Greenhouse strength', unit: '%', scale: 'linear', min: 0, max: 1, steps: 100, fill: 'amber', format: (d) => String(Math.round(d)),
    toDisplay: (v) => v * 100, fromDisplay: (d) => d / 100, quantize: quantizeGreenhouse, extra: (v) => `ε=${num(v, 2)}`,
    ticks: [{ value: 0, label: '0 Airless, Mars' }, { value: EARTH_GREENHOUSE, label: 'Earth' }, { value: 1, label: '100 Venus' }],
    help: 'How strongly the atmosphere traps heat. 0% = no greenhouse effect, 100% = the strongest this simple one-layer model allows.',
    onInput: (v) => setControl('greenhouse', v),
  });
  const albSlider = new Slider({
    label: 'Bond albedo A', unit: '', scale: 'linear', min: 0, max: 1, steps: 100, fill: 'slate', entry: 'readout', format: (d) => d.toFixed(2),
    quantize: (v) => Math.round(v * 100) / 100, ticks: [{ value: 0.3, label: 'Earth' }, { value: 0.76, label: 'Venus' }],
    help: 'How much starlight the planet reflects instead of absorbing. 0 = absorbs everything, 1 = reflects everything. Never measured for exoplanets, so it is always an assumption there.',
    onInput: (v) => setControl('albedo', v),
  });
  const mSlider = new Slider({
    label: 'Planet mass', unit: 'M⊕', scale: 'log', steps: 530, min: LIMITS.mass_Mearth[0], max: LIMITS.mass_Mearth[1], format: box(3),
    ticks: [{ value: 1, label: 'Earth' }],
    help: 'Planet mass compared with Earth. With the radius it sets surface gravity; it barely changes the orbital period and does not change temperature here.',
    onInput: (v) => setControl('mass_Mearth', v),
  });
  const rSlider = new Slider({
    label: 'Planet radius', unit: 'R⊕', scale: 'log', steps: 260, min: LIMITS.radius_Rearth[0], max: LIMITS.radius_Rearth[1], format: box(3),
    ticks: [{ value: 1, label: 'Earth' }],
    help: 'Planet size compared with Earth. Bigger planets feel stronger tides; with the mass it sets surface gravity.',
    onInput: (v) => setControl('radius_Rearth', v),
  });
  const eccLine = h('p', { class: 'ecc' });
  const eccBadge = badge('assumed');
  const advSummaryVals = h('span', { class: 'adv__vals' });
  const advanced = h('details', { class: 'adv' },
    h('summary', { class: 'adv__sum' }, icon('sliders', 16), h('span', {}, 'Advanced: albedo, mass, radius'), advSummaryVals, icon('chevron', 16)),
    h('div', { class: 'adv__body' }, albSlider.el, mSlider.el, rSlider.el, h('div', { class: 'ecc-row' }, eccLine, eccBadge)));
  const catalogEl = h('div', { class: 'inset' });

  const scenarioCard = h('section', { class: 'panel scenario', 'aria-labelledby': 'scn-label' },
    h('p', { id: 'scn-label', class: 'micro' }, 'Scenario'),
    nameEl,
    scenarioTabs.el,
    bannerEl,
    noticeEl,
    hypoBody, knownBody, picker.el,
    modChip,
    h('div', { class: 'group' },
      h('div', { class: 'group__head' }, h('label', { for: 'star-select', class: 'micro' }, 'Host star'),
        new Help('the host star', 'The kind of star the planet orbits. Hotter stars (O, B, A) are bluer and far brighter; cooler ones (K, M) are redder and dimmer. Real planets keep their measured star.').el, starBadge),
      h('div', { class: 'select-wrap select-wrap--star' }, starDot, starSelect, icon('chevron', 16)),
      starStats),
    h('div', { class: 'group' },
      h('p', { class: 'micro' }, 'Orbit & atmosphere'),
      aSlider.el, pSlider.el, gSlider.el),
    advanced,
    catalogEl);

  // ---- results column -----------------------------------------------------------
  const verdict = new VerdictCard();
  const provEl = h('div', { class: 'prov', 'aria-label': 'Data provenance' });
  const errorEl = h('div', { role: 'alert' });
  const orbit = new OrbitView((on) => { state.compare = on; scheduleUpdate(); });
  const metrics = new MetricGrid();
  const assumptionsEl = h('div');
  const resultBar = new ResultBar(() => { location.hash = 'results'; });
  const footerText = h('span');

  // ---- nav (phones) ---------------------------------------------------------------
  const navLinks = TABS.map((t) => h('a', { href: `#${t.id}`, class: 'secnav__link' }, t.label));
  const secnav = h('nav', { class: 'secnav', 'aria-label': 'Sections' }, ...navLinks);
  const main = h('main', { class: 'layout', id: 'main' },
    h('div', { class: 'col-left', 'data-sec': 'setup' }, scenarioCard),
    h('div', { class: 'col-right' },
      h('div', { 'data-sec': 'results', class: 'stack' }, errorEl, verdict.el, provEl),
      h('div', { 'data-sec': 'orbit' }, orbit.el),
      h('section', { 'data-sec': 'results', 'aria-labelledby': 'metrics-h' }, h('h2', { id: 'metrics-h', class: 'visually-hidden' }, 'Model outputs'), metrics.el),
      h('div', { 'data-sec': 'model' }, assumptionsEl)));

  root.replaceChildren(
    h('header', { class: 'topbar' },
      h('div', { class: 'topbar__in' },
        h('div', { class: 'brand' },
          h('span', { class: 'brand__tile' }, icon('orbit', 20)),
          h('div', {},
            h('h1', { class: 'brand__title' }, 'Exoplanet Habitability Simulator'),
            h('p', { class: 'brand__sub' }, 'Thermal · Orbital · Water-phase model'))),
        h('div', { class: 'topbar__actions' }, shareBtn, resetBtn)),
      secnav,
      toast),
    h('div', { class: 'notice' },
      h('p', { class: 'notice__in' }, icon('info', 16), h('span', {}, 'This is a simplified educational model. It does not determine the existence of life.'))),
    main,
    h('footer', { class: 'footer' },
      h('p', {}, footerText, ' ', h('a', { href: REPO_README, rel: 'noopener' }, 'How the model works (README)'))),
    resultBar.el,
  );

  // ---- tabs (phones) ----------------------------------------------------------------
  const applyTab = (scroll: boolean) => {
    root.dataset.tab = state.tab;
    navLinks.forEach((a, i) => {
      if (TABS[i]!.id === state.tab) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    orbit.setActive(isDesktop() || state.tab === 'orbit');
    if (scroll && !isDesktop()) {
      const stick = root.querySelector('.topbar')?.getBoundingClientRect().height ?? 0;
      const top = main.getBoundingClientRect().top + window.scrollY - stick;
      if (window.scrollY > top) window.scrollTo(0, top);
    }
  };
  window.addEventListener('hashchange', () => { state.tab = tabFromHash(); applyTab(true); });
  desktop?.addEventListener?.('change', () => applyTab(false));
  applyTab(false);

  // ---- the one update path -------------------------------------------------------------
  function update(): void {
    const usable = catalogUsable();
    if (state.mode === 'real' && !usable && state.catalogStatus !== 'loading') {
      state.mode = 'hypothetical';
      state.scenario = state.scenario === 'nasa' ? 'hypothetical' : state.scenario;
    }
    if (state.mode === 'real' && usable && !state.selectedId && !state.pendingReal) {
      const first = (state.scenario === 'preset' ? featured()[0] : undefined) ?? state.catalog!.entries[0]!;
      state.selectedId = first.id;
      state.real = realBaseline(first);
      state.modified.clear();
    }
    const real = state.mode === 'real';
    const entry = selectedEntry(state);

    // Scenario header + tabs
    nameEl.textContent = scenarioName(state);
    scenarioTabs.update({ value: state.scenario, options: [
      { value: 'hypothetical', label: 'Hypothetical' }, { value: 'preset', label: 'Known planet' },
      { value: 'nasa', label: 'NASA search', disabled: !usable && state.catalogStatus !== 'loading' },
    ] });
    renderDataBanner(bannerEl, { real: real || state.scenario === 'nasa', status: state.catalogStatus, isFixture: !!state.catalog?.isFixture });
    hypoBody.hidden = state.scenario !== 'hypothetical';
    knownBody.hidden = state.scenario !== 'preset';
    picker.el.hidden = state.scenario !== 'nasa';

    // Known planet select
    const feats = featured();
    const key = feats.map((e) => e.id).join(',');
    if (key !== knownKey || !knownSelect.options.length) {
      knownKey = key;
      replace(knownSelect,
        h('option', { value: '', disabled: true }, 'Choose a planet…'),
        h('optgroup', { label: 'Solar System (NASA fact sheets)' }, ...PRESETS.map((p) => h('option', { value: `preset:${p.id}` }, `${p.name} (Sun)`))),
        feats.length ? h('optgroup', { label: 'Exoplanets (NASA Exoplanet Archive)' }, ...feats.map((e) => h('option', { value: `planet:${e.id}` }, `${e.planet.name} (${e.star.name})`))) : null);
    }
    const kv = real ? (entry && feats.includes(entry) ? `planet:${entry.id}` : '') : (presetById(state.preset) ? `preset:${state.preset}` : '');
    knownSelect.value = kv;
    const p = presetById(state.preset);
    knownDesc.textContent = real
      ? (entry ? `${entry.star.name} (${entry.star.spectralType || 'class unknown'}), a = ${num(entry.planet.a_AU)} AU, radius ${entry.planet.radius_Rearth == null ? 'unknown' : num(entry.planet.radius_Rearth) + ' R⊕'}. Measured values stay fixed.` : '')
      : p ? (hypoDirty(state) ? `Started from ${p.name}; you have changed some values.` : p.note) : 'Pick Earth, Venus or Mars, or a well-known exoplanet.';
    picker.update({ catalog: state.catalog, status: state.catalogStatus, filter: state.filter, selectedId: state.selectedId });

    // Modified chip (real)
    if (real && state.modified.size) {
      const btn = h('button', { type: 'button', class: 'btn btn--pill' }, icon('reset', 14), 'Reset to measured');
      btn.addEventListener('click', reset);
      replace(modChip, h('div', { class: 'modchip', role: 'status' },
        h('span', {}, `Modified from real data: ${[...state.modified].map((f) => FIELD_LABELS[f]).join(', ')}`), btn));
    } else if (real) {
      replace(modChip, h('p', { class: 'muted small' }, 'Distance is the measured value. Pressure, greenhouse strength and albedo are assumed: they are not measured for exoplanets.'));
    } else replace(modChip);

    // Host star
    const star = real && entry ? entry.star : starPresets[state.starType];
    starSelect.disabled = real;
    catalogOpt.hidden = !real;
    if (real) { catalogOpt.textContent = `${entry?.star.spectralType || 'Unknown class'} (catalog)`; starSelect.value = 'catalog'; }
    else starSelect.value = state.starType;
    starDot.style.background = blackbodyColor(star.teff_K);
    setBadge(starBadge, sourceTag(state, 'star'));

    // Sliders
    const c = controlsFor(state);
    aSlider.update(c.a_AU, sourceTag(state, 'a_AU'));
    pSlider.update(c.pressure_bar, sourceTag(state, 'pressure_bar'));
    gSlider.update(c.greenhouse, sourceTag(state, 'greenhouse'));
    albSlider.update(c.albedo, sourceTag(state, 'albedo'));
    mSlider.update(real ? entry?.planet.mass_Mearth ?? null : c.mass_Mearth, sourceTag(state, 'mass_Mearth'), real);
    rSlider.update(real ? entry?.planet.radius_Rearth ?? null : c.radius_Rearth, sourceTag(state, 'radius_Rearth'), real);
    const ecc = real ? entry?.planet.ecc : 0;
    eccLine.textContent = real
      ? `Eccentricity e = ${ecc == null ? 'unknown' : num(ecc, 3)} (read-only${entry?.missing.includes('pl_orbeccen') ? '; not measured, 0 used' : ''})`
      : 'Eccentricity e = 0 (hypothetical planets use circular orbits, DESIGN §8)';
    setBadge(eccBadge, sourceTag(state, 'ecc'));
    const mass = real ? entry?.planet.mass_Mearth : c.mass_Mearth;
    const rad = real ? entry?.planet.radius_Rearth : c.radius_Rearth;
    advSummaryVals.textContent = `A ${c.albedo.toFixed(2)}, ${mass == null ? '? ' : num(mass)} M⊕, ${rad == null ? '? ' : num(rad)} R⊕`;
    resetBtn.disabled = real ? state.modified.size === 0 : !hypoDirty(state);
    resetBtn.setAttribute('aria-label', real ? 'Reset to measured values' : `Reset to ${presetById(state.preset)?.name ?? 'defaults'}`);

    renderCatalogDetails(catalogEl, real ? entry : null);
    catalogEl.hidden = !real || !entry;

    const snap = state.catalog ? (state.catalog.isFixture ? 'dev sample' : `snapshot ${state.catalog.generatedAt.slice(0, 10)}`) : 'not loaded';
    footerText.textContent = `Deterministic model · constants CODATA 2018 / IAU 2015 · planet data: NASA Exoplanet Archive ${snap}.`;

    if (needsSim) {
      needsSim = false;
      const input = buildInput(state);
      try {
        state.output = input ? simulate(input) : null;
        state.error = null;
      } catch (err) {
        state.output = null;
        state.error = err instanceof Error ? err.message : String(err);
      }
      if (state.error) replace(errorEl, h('p', { class: 'banner banner--rose' }, icon('info', 16), h('span', {}, `Model error: ${state.error}`)));
      else replace(errorEl);
      const out = state.output;
      renderStarStats(starStats, star, sourceTag(state, 'star'), out, real);
      const summary = out
        ? `Surface ${kelvin(out.surfaceTemp.value)} (${celsius(out.surfaceTemp.value)}), ${WATER_TEXT[out.waterPhase.value] ?? out.waterPhase.value}, ${num(out.input.atmosphere.surfacePressure_bar)} bar.`
        : '';
      verdict.update(out?.habitability ?? null, summary);
      renderProvenanceLine(provEl, out);
      let earth: SimulationOutput | null = null;
      if (state.compare) { try { earth = earthOutput(); } catch { earth = null; } }
      orbit.update(out, state.compare);
      metrics.update(out, earth);
      renderAssumptions(assumptionsEl, out, true);
      resultBar.update(out);
    }
    scheduleUrl();
  }

  update();

  loadCatalog().then(
    (cat) => {
      state.catalog = cat;
      state.catalogStatus = cat.entries.length ? 'ok' : 'empty';
      const pr = state.pendingReal;
      if (pr) {
        state.pendingReal = null;
        const entry = cat.entries.find((e) => e.id === pr.planetId) ?? null;
        if (entry) {
          state.selectedId = entry.id;
          state.real = { ...realBaseline(entry), ...pr.overrides };
          recomputeModified(state);
        } else if (pr.planetId && cat.entries.length) {
          const fallback = (pr.scenario === 'preset' ? featured()[0] : undefined) ?? cat.entries[0]!;
          state.selectedId = fallback.id;
          state.real = realBaseline(fallback);
          state.modified.clear();
          const shown = pr.planetId.length > 60 ? `${pr.planetId.slice(0, 57)}…` : pr.planetId;
          notice = `Planet ‘${shown}’ was not found in this snapshot — showing ${fallback.planet.name} instead.`;
          renderNotice();
        }
      }
      scheduleUpdate();
    },
    () => { state.catalogStatus = 'error'; state.pendingReal = null; scheduleUpdate(); },
  );
}
