/**
 * App shell: owns the single AppState, builds the layout once, and funnels
 * every change through setState() → scheduleUpdate() → update().
 * Engine runs are rAF-throttled so dragging a slider stays smooth on phones.
 */
import type { StarType } from '../physics/types';
import { STAR_TYPES } from '../physics/types';
import { h, replace } from './dom';
import { num } from './format';
import { EARTH_GREENHOUSE, loadCatalog, simulate, starPresets, starTypeLabels } from './engine';
import {
  type AppState, type ModifiableField, FIELD_LABELS, buildInput, controlsFor, initialState, realBaseline, selectedEntry,
} from './state';
import { Segmented } from './components/segmented';
import { Slider } from './components/slider';
import { PlanetPicker } from './components/planetPicker';
import { renderMeasured } from './components/measured';
import { OrbitView } from './components/orbitView';
import { renderResults } from './components/results';
import { HabitabilityPanel } from './components/habitability';
import { renderAssumptions } from './components/assumptions';
import { renderDataBanner } from './components/dataBanner';
import { renderProvenanceLine } from './components/provenance';
import { ResultBar } from './components/resultBar';

const A_MIN = 0.01, A_MAX = 100, P_MIN = 0.001, P_MAX = 100;

export function mountApp(root: HTMLElement): void {
  const state: AppState = initialState();

  // ---- state mutation -----------------------------------------------------
  let pending = 0;
  let needsSim = true;
  const scheduleUpdate = (sim = true) => {
    needsSim ||= sim;
    if (!pending) pending = requestAnimationFrame(() => { pending = 0; update(); });
  };

  const setControl = (field: ModifiableField, key: 'a_AU' | 'pressure_bar' | 'greenhouse', v: number) => {
    const c = controlsFor(state);
    c[key] = v;
    if (state.mode === 'real') {
      const entry = selectedEntry(state);
      if (entry) {
        const base = realBaseline(entry);
        if (Math.abs(base[key] - v) <= 1e-9 * Math.max(1, Math.abs(base[key]))) state.modified.delete(field);
        else state.modified.add(field);
      }
    }
    scheduleUpdate();
  };

  const selectPlanet = (id: string) => {
    state.selectedId = id;
    const entry = selectedEntry(state);
    if (entry) state.real = realBaseline(entry);
    state.modified.clear();
    scheduleUpdate();
  };

  // ---- components ---------------------------------------------------------
  const modeSwitch = new Segmented<'hypothetical' | 'real'>('Mode', 'segments', [
    { value: 'hypothetical', label: 'Hypothetical' },
    { value: 'real', label: 'Real exoplanet' },
  ], (m) => { state.mode = m; scheduleUpdate(); });

  const starOptions = () => STAR_TYPES.map((t) => {
    const [cls, desc] = (starTypeLabels[t] ?? t).split(' — ');
    return { value: t, label: cls ?? t, sub: desc };
  });
  const starPicker = new Segmented<StarType>('Star type', 'chips', starOptions(), (t) => { state.starType = t; scheduleUpdate(); });

  const aSlider = new Slider({
    label: 'Orbital distance (semi-major axis a)', scale: 'log', min: A_MIN, max: A_MAX,
    format: (v) => `${num(v)} AU`, markers: [{ value: 1, label: 'Earth' }],
    onInput: (v) => setControl('a_AU', 'a_AU', v),
  });
  const pSlider = new Slider({
    label: 'Surface pressure', scale: 'log', min: P_MIN, max: P_MAX,
    format: (v) => `${num(v)} bar`, markers: [{ value: 1, label: 'Earth' }],
    hint: 'Pressure affects the water phase only; it does not change temperature in this model (DESIGN §12).',
    onInput: (v) => setControl('surfacePressure_bar', 'pressure_bar', v),
  });
  const gSlider = new Slider({
    label: 'Greenhouse strength', scale: 'linear', min: 0, max: 1,
    format: (v) => num(v, 2), markers: [{ value: EARTH_GREENHOUSE, label: 'Earth' }],
    hint: 'Simplified one-layer greenhouse model (0 = none, 1 = strongest).',
    onInput: (v) => setControl('greenhouse', 'greenhouse', v),
  });
  const eccEl = h('p', { class: 'readonly-field' });

  const picker = new PlanetPicker((q) => { state.filter = q; scheduleUpdate(false); }, selectPlanet);
  const measuredEl = h('div', { class: 'measured' });
  const modChip = h('div', { class: 'modchip-wrap' });
  const orbit = new OrbitView();
  const resultsEl = h('div', { class: 'results-grid' });
  const hab = new HabitabilityPanel();
  const assumptionsEl = h('div');
  const errorEl = h('div', { role: 'alert' });

  const bannerEl = h('div', { class: 'data-banner' });
  const provEl = h('div', { class: 'prov', 'aria-label': 'Data provenance' });
  const resultBar = new ResultBar(() => hab.el);
  const realOnly = h('div', { class: 'stack' }, picker.el);
  const starBlock = h('div', {}, starPicker.el);

  // ---- layout -------------------------------------------------------------
  root.replaceChildren(
    h('header', { class: 'app-header' },
      h('h1', { class: 'app-title' }, 'Exoplanet Habitability Simulator'),
      h('p', { class: 'app-subtitle' }, 'A simplified physics model — not a life detector')),
    h('main', { class: 'layout' },
      h('section', { class: 'col col--controls', 'aria-label': 'Inputs' },
        h('div', { class: 'card stack' }, modeSwitch.el, bannerEl, realOnly, starBlock),
        h('div', { class: 'card stack' },
          h('h2', { class: 'card__title' }, 'Controls'), modChip, aSlider.el, pSlider.el, gSlider.el, eccEl),
        h('div', { class: 'card' }, measuredEl)),
      h('section', { class: 'col col--results', 'aria-label': 'Results' },
        errorEl, hab.el, provEl, orbit.el,
        h('section', { class: 'card', 'aria-labelledby': 'res-h' }, h('h2', { id: 'res-h', class: 'card__title' }, 'Model outputs'), resultsEl),
        assumptionsEl)),
    h('footer', { class: 'app-footer' },
      h('p', {}, 'Educational prototype. Data: NASA Exoplanet Archive (when available). Every number is a model output with stated assumptions.')),
    resultBar.el,
  );

  // ---- the one update path -------------------------------------------------
  function update(): void {
    const catalogUsable = state.catalogStatus === 'ok' && !!state.catalog?.entries.length;
    if (state.mode === 'real' && !catalogUsable && state.catalogStatus !== 'loading') state.mode = 'hypothetical';
    if (state.mode === 'real' && catalogUsable && !state.selectedId) {
      const first = state.catalog!.entries[0]!;
      state.selectedId = first.id;
      state.real = realBaseline(first);
    }

    const real = state.mode === 'real';
    modeSwitch.update({ value: state.mode, options: [
      { value: 'hypothetical', label: 'Hypothetical' },
      { value: 'real', label: 'Real exoplanet', disabled: !catalogUsable && state.catalogStatus !== 'loading' },
    ] });
    renderDataBanner(bannerEl, { mode: state.mode, status: state.catalogStatus, isFixture: !!state.catalog?.isFixture });
    realOnly.hidden = !real;
    picker.update({ catalog: state.catalog, status: state.catalogStatus, filter: state.filter, selectedId: state.selectedId });
    starBlock.hidden = real;
    starPicker.update({ value: state.starType, options: starOptions() });

    const c = controlsFor(state);
    aSlider.update(c.a_AU);
    pSlider.update(c.pressure_bar);
    gSlider.update(c.greenhouse);

    const entry = selectedEntry(state);
    eccEl.textContent = real
      ? `Eccentricity (measured, read-only): ${entry ? num(entry.planet.ecc, 3) : 'unknown'}`
      : 'Eccentricity: 0 (hypothetical planets use circular orbits, DESIGN §8)';

    if (real && state.modified.size) {
      const btn = h('button', { type: 'button', class: 'btn btn--small' }, 'Reset to measured');
      btn.addEventListener('click', () => { if (entry) { state.real = realBaseline(entry); state.modified.clear(); scheduleUpdate(); } });
      replace(modChip, h('div', { class: 'modchip', role: 'status' },
        h('span', {}, `⚑ Modified from real data: ${[...state.modified].map((f) => FIELD_LABELS[f]).join(', ')}`), btn));
    } else if (real) {
      replace(modChip, h('p', { class: 'hint' }, 'Distance uses the measured value. Pressure and greenhouse are assumed (not measured for exoplanets).'));
    } else replace(modChip);

    renderMeasured(measuredEl, { mode: state.mode, entry, presetStar: starPresets[state.starType] });

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
      if (state.error) replace(errorEl, h('p', { class: 'banner banner--warn' }, `Model error: ${state.error}`));
      else replace(errorEl);
      orbit.update(state.output);
      renderResults(resultsEl, state.output);
      hab.update(state.output?.habitability ?? null);
      renderAssumptions(assumptionsEl, state.output);
      renderProvenanceLine(provEl, state.output);
      resultBar.update(state.output);
    }
  }

  update();

  loadCatalog().then(
    (cat) => { state.catalog = cat; state.catalogStatus = cat.entries.length ? 'ok' : 'empty'; scheduleUpdate(false); },
    () => { state.catalogStatus = 'error'; scheduleUpdate(false); },
  );
}
