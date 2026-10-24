/**
 * Orbit & habitable zone chart (DESIGN §8). Star at a FOCUS; circle for e = 0,
 * ellipse for e > 0; periapsis/apoapsis markers; the planet animated through
 * output.orbit.samples (uniform in time, so it speeds up near periapsis).
 * The optimistic habitable zone (Kopparapu et al. 2014) is a translucent annulus.
 *
 * Auto-scale: the view always fits the planet's orbit. The HZ is fitted too
 * unless it is far larger than the orbit; then it is clipped and labelled at
 * the edge, and the same goes for Earth's orbit in "Compare to Earth" mode.
 * Starts paused under prefers-reduced-motion; stops when the page or the
 * section is hidden.
 */
import type { OrbitSample, SimulationOutput } from '../../physics/types';
import { L_SUN } from '../../physics/constants';
import { h, s, replace, renderIfChanged, setText } from '../dom';
import { auFromM, num, sEarth } from '../format';
import { blackbodyColor } from '../starColor';
import { habitableZoneLimits } from '../engine';
import { icon } from '../icons';
import { Help } from './help';

const W = 400, H = 300, PL = 34, PR = 10, PT = 10, PB = 28;
const SECONDS_PER_ORBIT = 8;
/** Fit the HZ only while it is at most this many times the orbit's extent. */
const MAX_FIT_RATIO = 6;

function attr(el: Element, a: Record<string, string | number>): void {
  for (const k in a) { const v = String(a[k]); if (el.getAttribute(k) !== v) el.setAttribute(k, v); }
}

function niceStep(x: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(x)));
  const m = x / p;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
}

export class OrbitView {
  readonly el: HTMLElement;
  private plot: SVGGElement;
  private layers: {
    grid: SVGPathElement; ticks: SVGGElement; tickPool: SVGTextElement[]; hz: SVGPathElement; earth: SVGPathElement; orbit: SVGPathElement;
    apsis: SVGGElement; apsisLine: SVGLineElement; periDot: SVGCircleElement; apoDot: SVGCircleElement; ring: SVGCircleElement; star: SVGCircleElement;
    labels: SVGGElement; periLbl: SVGTextElement; apoLbl: SVGTextElement; edge: SVGGElement;
  };
  private legendHz = document.createElement('span');
  private legendOrbit = document.createElement('span');
  private planet: SVGCircleElement;
  private caption: HTMLParagraphElement;
  private legend: HTMLUListElement;
  private rDist: HTMLElement;
  private rFlux: HTMLElement;
  private rTeq: HTMLElement;
  private playBtn: HTMLButtonElement;
  private cmpBtn: HTMLButtonElement;

  private samples: OrbitSample[] = [];
  private scale = 1;
  private cx = 0;
  private cy = 0;
  private phase = 0;
  private playing: boolean;
  private active = true;
  private raf = 0;
  private lastT = 0;
  private lastIdx = -1;

  constructor(onCompare: (on: boolean) => void) {
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.playing = !reduce;

    const pw = W - PL - PR, ph = H - PT - PB;
    const L_ = {
      grid: s('path', { class: 'ov__grid' }), ticks: s('g', { class: 'ov__tick' }), tickPool: [] as SVGTextElement[],
      hz: s('path', { 'fill-rule': 'evenodd', class: 'ov__hz' }), earth: s('path', { class: 'ov__earth' }), orbit: s('path', { class: 'ov__orbit' }),
      apsis: s('g'), apsisLine: s('line', { class: 'ov__apsis-line' }), periDot: s('circle', { r: 3, class: 'ov__apsis' }), apoDot: s('circle', { r: 3, class: 'ov__apsis' }),
      ring: s('circle', { cx: PL + pw / 2, cy: PT + ph / 2, r: 11, class: 'ov__ring' }), star: s('circle', { cx: PL + pw / 2, cy: PT + ph / 2, r: 6.5, class: 'ov__star' }),
      labels: s('g'), periLbl: s('text', { class: 'ov__lbl' }), apoLbl: s('text', { class: 'ov__lbl' }), edge: s('g'),
    };
    L_.apsis.append(L_.apsisLine, L_.periDot, L_.apoDot);
    L_.labels.append(L_.periLbl, L_.apoLbl);
    this.layers = L_;
    this.plot = s('g', {},
      s('rect', { x: PL, y: PT, width: pw, height: ph, class: 'ov__bg' }), L_.grid, L_.ticks,
      s('text', { x: W - PR, y: H - 4, 'text-anchor': 'end', class: 'ov__tick ov__axis' }, 'AU'),
      s('g', { 'clip-path': 'url(#ov-clip)' }, L_.hz, L_.earth, L_.orbit, L_.apsis, L_.ring, L_.star),
      L_.labels, L_.edge);
    this.planet = s('circle', { class: 'ov__planet', r: 5.5 });
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'ov__svg', role: 'img', 'aria-labelledby': 'ov-cap' },
      s('defs', {}, s('clipPath', { id: 'ov-clip' }, s('rect', { x: PL, y: PT, width: W - PL - PR, height: H - PT - PB }))),
      this.plot, this.planet);
    this.caption = h('p', { id: 'ov-cap', class: 'visually-hidden' });
    this.legend = h('ul', { class: 'ov__legend' });

    const cell = (label: string) => {
      const v = h('span', { class: 'ov__rv' }, '—');
      return [v, h('div', { class: 'ov__rc' }, h('span', { class: 'micro' }, label), v)] as const;
    };
    const [d, dc] = cell('Distance');
    const [f, fc] = cell('Flux');
    const [t, tc] = cell('T_eq now');
    this.rDist = d; this.rFlux = f; this.rTeq = t;

    this.playBtn = h('button', { type: 'button', class: 'btn btn--outline btn--sm' });
    this.playBtn.addEventListener('click', () => this.setPlaying(!this.playing));
    this.cmpBtn = h('button', { type: 'button', role: 'switch', class: 'switch', 'aria-checked': 'false' },
      h('span', { class: 'switch__track', 'aria-hidden': 'true' }, h('span', { class: 'switch__thumb' })), 'Compare to Earth');
    this.cmpBtn.addEventListener('click', () => onCompare(this.cmpBtn.getAttribute('aria-checked') !== 'true'));

    this.el = h('section', { class: 'panel ov', 'aria-labelledby': 'ov-h' },
      h('div', { class: 'panel__head' },
        h('h2', { id: 'ov-h', class: 'panel__title' }, 'Orbit & habitable zone',
          new Help('the orbit chart', 'Top-down view of the orbit with the star at one focus. The green ring is the optimistic habitable zone for this star (Kopparapu et al. 2014): where starlight could keep surface water liquid on an Earth-like planet. Not to scale: the star and planet dots are enlarged.').el),
        this.cmpBtn),
      h('div', { class: 'ov__frame' }, svg), this.caption,
      this.legend,
      h('div', { class: 'ov__readout' }, dc, fc, tc, this.playBtn),
      h('p', { class: 'muted small' }, 'Instantaneous T_eq; real climates lag behind (DESIGN §8). Animation speed is not real time.'));

    document.addEventListener('visibilitychange', () => this.sync());
    this.syncButton();
  }

  /** Called by the app when the section is shown/hidden (phone tabs). */
  setActive(active: boolean): void {
    this.active = active;
    this.sync();
  }

  update(out: SimulationOutput | null, compare: boolean): void {
    this.cmpBtn.setAttribute('aria-checked', String(compare));
    if (!out || out.orbit.samples.length === 0) {
      this.samples = [];
      this.plot.style.display = 'none';
      renderIfChanged(this.legend, '∅', () => replace(this.legend));
      this.caption.textContent = 'No orbit to display.';
      this.sync();
      return;
    }
    this.samples = out.orbit.samples;
    this.plot.style.display = '';
    const e = out.input.planet.ecc;
    const peri = auFromM(out.orbit.periapsis.value), apo = auFromM(out.orbit.apoapsis.value);
    const a = (peri + apo) / 2;
    const b = a * Math.sqrt(1 - e * e);

    // Habitable zone (optimistic: recent Venus → early Mars), d = √(L/S) in AU.
    const L = out.star.luminosity.value / L_SUN;
    let hzIn: number | null = null, hzOut: number | null = null;
    try {
      const hz = habitableZoneLimits(out.input.star.teff_K).value;
      hzIn = Math.sqrt(L / hz.recentVenus);
      hzOut = Math.sqrt(L / hz.earlyMars);
      if (!Number.isFinite(hzIn) || !Number.isFinite(hzOut)) hzIn = hzOut = null;
    } catch { hzIn = hzOut = null; }

    // Extent (AU) of the square region around the star.
    let R = apo;
    if (hzOut != null) R = Math.max(R, Math.min(hzOut, MAX_FIT_RATIO * apo));
    R *= 1.08;
    const pw = W - PL - PR, ph = H - PT - PB;
    this.scale = Math.min(pw, ph) / (2 * R);
    this.cx = PL + pw / 2;
    this.cy = PT + ph / 2;
    const xr = pw / 2 / this.scale, yr = ph / 2 / this.scale; // half-extents in AU

    const L_ = this.layers;
    // Grid: one path for all lines; tick labels reuse a pool of <text> nodes.
    const step = niceStep(Math.max(xr, yr) / 2.5);
    let d = '';
    const ticks: [number, number, 'middle' | 'end', string][] = [];
    for (let k = -Math.floor(xr / step); k <= Math.floor(xr / step); k++) {
      const x = this.cx + k * step * this.scale;
      d += `M${x.toFixed(1)},${PT}V${PT + ph}`;
      ticks.push([x, H - PB + 14, 'middle', num(k * step, 2)]);
    }
    for (let k = -Math.floor(yr / step); k <= Math.floor(yr / step); k++) {
      const y = this.cy - k * step * this.scale;
      d += `M${PL},${y.toFixed(1)}H${PL + pw}`;
      ticks.push([PL - 5, y + 3.5, 'end', num(k * step, 2)]);
    }
    attr(L_.grid, { d });
    while (L_.tickPool.length < ticks.length) { const t = s('text'); L_.tickPool.push(t); L_.ticks.append(t); }
    L_.tickPool.forEach((t, i) => {
      const tk = ticks[i];
      t.style.display = tk ? '' : 'none';
      if (!tk) return;
      attr(t, { x: tk[0].toFixed(1), y: tk[1].toFixed(1), 'text-anchor': tk[2] });
      setText(t, tk[3]);
    });

    const edge: string[] = [];
    const circ = (r: number) => `M${this.cx - r * this.scale},${this.cy}a${r * this.scale},${r * this.scale} 0 1 0 ${2 * r * this.scale},0a${r * this.scale},${r * this.scale} 0 1 0 ${-2 * r * this.scale},0`;
    const hasHz = hzIn != null && hzOut != null;
    attr(L_.hz, { d: hasHz ? `${circ(hzOut!)}${circ(hzIn!)}` : '' });
    if (hasHz && hzIn! > R) edge.push(`Habitable zone (${num(hzIn)}–${num(hzOut)} AU) →`);
    attr(L_.earth, { d: compare && 1 <= R * 1.25 ? circ(1) : '' });
    if (compare && 1 > R) edge.push('Earth orbit (1 AU) →');
    // Planet orbit: true ellipse from samples, star at the focus (origin).
    let od = '';
    for (const p of this.samples) {
      const [x, y] = this.xy(auFromM(p.x_m), auFromM(p.y_m));
      od += `${od ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
    }
    attr(L_.orbit, { d: `${od}Z` });
    const ecc = e > 1e-4;
    L_.apsis.style.display = L_.labels.style.display = ecc ? '' : 'none';
    if (ecc) {
      const [px, py] = this.xy(peri, 0), [ax] = this.xy(-apo, 0);
      attr(L_.apsisLine, { x1: ax, y1: py, x2: px, y2: py });
      attr(L_.periDot, { cx: px, cy: py });
      attr(L_.apoDot, { cx: ax, cy: py });
      // Labels sit outside the clip group and are kept inside the plot: each goes on
      // the outer side of its marker if it fits there, else flips to the inner side.
      const lbl = (t: SVGTextElement, text: string, x: number, outward: 1 | -1, y: number) => {
        const w = text.length * 6.2;
        const left = PL + 3, right = PL + pw - 3;
        let anchor: 'start' | 'end', tx: number;
        if (outward === 1) { if (x + 5 + w <= right) { anchor = 'start'; tx = x + 5; } else { anchor = 'end'; tx = Math.min(x - 5, right); } }
        else if (x - 5 - w >= left) { anchor = 'end'; tx = x - 5; } else { anchor = 'start'; tx = Math.max(x + 5, left); }
        if (anchor === 'end' && tx - w < left) { anchor = 'start'; tx = left; }
        if (anchor === 'start' && tx + w > right) { anchor = 'end'; tx = right; }
        attr(t, { x: tx.toFixed(1), y: Math.min(Math.max(y, PT + 12), PT + ph - 4).toFixed(1), 'text-anchor': anchor });
        setText(t, text);
      };
      lbl(L_.periLbl, `Periapsis ${num(peri)} AU`, px, 1, py - 8);
      lbl(L_.apoLbl, `Apoapsis ${num(apo)} AU`, ax, -1, py + 16);
    }
    const color = blackbodyColor(out.input.star.teff_K);
    attr(L_.ring, { fill: color });
    attr(L_.star, { fill: color });
    renderIfChanged(L_.edge, edge.join('|'), () => replace(L_.edge,
      ...edge.map((t, i) => s('text', { x: PL + pw - 6, y: PT + 14 + i * 14, 'text-anchor': 'end', class: 'ov__edge' }, t))));

    // Legend: rebuilt only when its structure changes; the orbit size updates in place.
    const sw = (cls: string) => h('span', { class: `ov__sw ${cls}`, 'aria-hidden': 'true' });
    const hzText = hasHz ? `Habitable zone (${num(hzIn)}–${num(hzOut)} AU)` : 'Habitable zone unavailable for this star';
    renderIfChanged(this.legend, `${hasHz}|${compare}|${color}`, () => replace(this.legend,
      h('li', {}, hasHz ? sw('sw--hz') : null, this.legendHz),
      h('li', {}, sw('sw--orbit'), this.legendOrbit),
      compare ? h('li', {}, sw('sw--earth'), 'Earth orbit (1 AU)') : null,
      h('li', {}, h('span', { class: 'ov__sw sw--star', style: `background:${color}`, 'aria-hidden': 'true' }), 'Star'),
      h('li', {}, sw('sw--planet'), 'Planet')));
    setText(this.legendHz, hzText);
    setText(this.legendOrbit, `Planet orbit (${num(a)} AU)`);

    setText(this.caption, `${e > 1e-4 ? `Elliptical orbit, eccentricity ${num(e, 2)}, periapsis ${num(peri)} AU, apoapsis ${num(apo)} AU, star at one focus.` : `Circular orbit of radius ${num(a)} AU.`}${hzIn != null && hzOut != null ? ` Habitable zone ${num(hzIn)} to ${num(hzOut)} AU.` : ''}`);

    this.lastIdx = -1;
    this.renderFrame();
    this.sync();
  }

  private xy(x_au: number, y_au: number): [number, number] {
    return [this.cx + x_au * this.scale, this.cy - y_au * this.scale];
  }

  private renderFrame(): void {
    const n = this.samples.length;
    if (!n) return;
    const idx = Math.floor(this.phase * n) % n;
    if (idx === this.lastIdx) return;
    this.lastIdx = idx;
    const p = this.samples[idx]!;
    const [x, y] = this.xy(auFromM(p.x_m), auFromM(p.y_m));
    this.planet.setAttribute('cx', x.toFixed(1));
    this.planet.setAttribute('cy', y.toFixed(1));
    this.rDist.textContent = `${num(auFromM(p.distance_m))} AU`;
    this.rFlux.textContent = `${num(sEarth(p.flux_W_m2))} S⊕`;
    this.rTeq.textContent = `${Math.round(p.equilibriumTemp_K)} K`;
  }

  private tick = (t: number): void => {
    const dt = this.lastT ? Math.min(0.1, (t - this.lastT) / 1000) : 0;
    this.lastT = t;
    this.phase = (this.phase + dt / SECONDS_PER_ORBIT) % 1;
    this.renderFrame();
    this.raf = requestAnimationFrame(this.tick);
  };

  private sync(): void {
    const run = this.playing && this.active && !document.hidden && this.samples.length > 0;
    if (run && !this.raf) { this.lastT = 0; this.raf = requestAnimationFrame(this.tick); }
    else if (!run && this.raf) { cancelAnimationFrame(this.raf); this.raf = 0; }
  }

  private setPlaying(p: boolean): void {
    this.playing = p;
    this.sync();
    this.syncButton();
  }

  private syncButton(): void {
    replace(this.playBtn, icon(this.playing ? 'pause' : 'play', 14), this.playing ? 'Pause' : 'Play');
    this.playBtn.setAttribute('aria-label', this.playing ? 'Pause orbit animation' : 'Play orbit animation');
  }
}
