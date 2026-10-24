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
import { h, s, replace } from '../dom';
import { auFromM, num, sEarth } from '../format';
import { blackbodyColor } from '../starColor';
import { habitableZoneLimits } from '../engine';
import { icon } from '../icons';
import { Help } from './help';

const W = 400, H = 300, PL = 34, PR = 10, PT = 10, PB = 28;
const SECONDS_PER_ORBIT = 8;
/** Fit the HZ only while it is at most this many times the orbit's extent. */
const MAX_FIT_RATIO = 6;

function niceStep(x: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(x)));
  const m = x / p;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
}

export class OrbitView {
  readonly el: HTMLElement;
  private plot: SVGGElement;
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

    this.plot = s('g');
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
      replace(this.plot);
      replace(this.legend);
      this.caption.textContent = 'No orbit to display.';
      this.sync();
      return;
    }
    this.samples = out.orbit.samples;
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

    const nodes: SVGElement[] = [s('rect', { x: PL, y: PT, width: pw, height: ph, class: 'ov__bg' })];
    // Grid + ticks
    const step = niceStep(Math.max(xr, yr) / 2.5);
    const grid = s('g', { class: 'ov__grid' });
    const labels = s('g', { class: 'ov__tick' });
    for (let k = -Math.floor(xr / step); k <= Math.floor(xr / step); k++) {
      const x = this.cx + k * step * this.scale;
      grid.append(s('line', { x1: x, y1: PT, x2: x, y2: PT + ph }));
      labels.append(s('text', { x, y: H - PB + 14, 'text-anchor': 'middle' }, num(k * step, 2)));
    }
    for (let k = -Math.floor(yr / step); k <= Math.floor(yr / step); k++) {
      const y = this.cy - k * step * this.scale;
      grid.append(s('line', { x1: PL, y1: y, x2: PL + pw, y2: y }));
      labels.append(s('text', { x: PL - 5, y: y + 3.5, 'text-anchor': 'end' }, num(k * step, 2)));
    }
    labels.append(s('text', { x: W - PR, y: H - 4, 'text-anchor': 'end', class: 'ov__axis' }, 'AU'));
    nodes.push(grid, labels);

    const clipped = s('g', { 'clip-path': 'url(#ov-clip)' });
    const edge: string[] = [];
    const circ = (r: number) => `M${this.cx - r * this.scale},${this.cy}a${r * this.scale},${r * this.scale} 0 1 0 ${2 * r * this.scale},0a${r * this.scale},${r * this.scale} 0 1 0 ${-2 * r * this.scale},0`;
    if (hzIn != null && hzOut != null) {
      clipped.append(s('path', { d: `${circ(hzOut)}${circ(hzIn)}`, 'fill-rule': 'evenodd', class: 'ov__hz' }));
      if (hzIn > R) edge.push(`Habitable zone (${num(hzIn)}–${num(hzOut)} AU) →`);
    }
    if (compare) {
      if (1 <= R * 1.25) clipped.append(s('path', { d: circ(1), class: 'ov__earth' }));
      if (1 > R) edge.push('Earth orbit (1 AU) →');
    }
    // Planet orbit: true ellipse from samples, star at the focus (origin).
    const pts = this.samples.map((p) => this.xy(auFromM(p.x_m), auFromM(p.y_m)));
    clipped.append(s('path', { d: `M${pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join('L')}Z`, class: 'ov__orbit' }));
    if (e > 1e-4) {
      const [px, py] = this.xy(peri, 0), [ax] = this.xy(-apo, 0);
      clipped.append(
        s('line', { x1: ax, y1: py, x2: px, y2: py, class: 'ov__apsis-line' }),
        s('circle', { cx: px, cy: py, r: 3, class: 'ov__apsis' }),
        s('circle', { cx: ax, cy: py, r: 3, class: 'ov__apsis' }),
        s('text', { x: Math.min(px + 4, PL + pw - 2), y: py - 8, 'text-anchor': px + 60 > PL + pw ? 'end' : 'start', class: 'ov__lbl' }, `Periapsis ${num(peri)} AU`),
        s('text', { x: Math.max(ax - 4, PL + 2), y: py + 16, 'text-anchor': ax - 60 < PL ? 'start' : 'end', class: 'ov__lbl' }, `Apoapsis ${num(apo)} AU`));
    }
    const color = blackbodyColor(out.input.star.teff_K);
    clipped.append(
      s('circle', { cx: this.cx, cy: this.cy, r: 11, fill: color, class: 'ov__ring' }),
      s('circle', { cx: this.cx, cy: this.cy, r: 6.5, fill: color, class: 'ov__star' }));
    nodes.push(clipped);
    edge.forEach((t, i) => nodes.push(s('text', { x: PL + pw - 6, y: PT + 14 + i * 14, 'text-anchor': 'end', class: 'ov__edge' }, t)));
    replace(this.plot, ...nodes);

    const sw = (cls: string) => h('span', { class: `ov__sw ${cls}`, 'aria-hidden': 'true' });
    replace(this.legend,
      hzIn != null && hzOut != null ? h('li', {}, sw('sw--hz'), `Habitable zone (${num(hzIn)}–${num(hzOut)} AU)`) : h('li', {}, 'Habitable zone unavailable for this star'),
      h('li', {}, sw('sw--orbit'), `Planet orbit (${num(a)} AU)`),
      compare ? h('li', {}, sw('sw--earth'), 'Earth orbit (1 AU)') : null,
      h('li', {}, h('span', { class: 'ov__sw sw--star', style: `background:${color}`, 'aria-hidden': 'true' }), 'Star'),
      h('li', {}, sw('sw--planet'), 'Planet'));

    this.caption.textContent = `${e > 1e-4 ? `Elliptical orbit, eccentricity ${num(e, 2)}, periapsis ${num(peri)} AU, apoapsis ${num(apo)} AU, star at one focus.` : `Circular orbit of radius ${num(a)} AU.`}${hzIn != null && hzOut != null ? ` Habitable zone ${num(hzIn)} to ${num(hzOut)} AU.` : ''}`;

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
