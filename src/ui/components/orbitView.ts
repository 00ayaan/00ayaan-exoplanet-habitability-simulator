/**
 * Orbit view (DESIGN §8): SVG with the star at a FOCUS, circle for e = 0,
 * ellipse for e > 0, periapsis/apoapsis markers, and a planet animated through
 * output.orbit.samples (uniform in time → it speeds up near periapsis).
 * Scales to container width via viewBox. Pauses when the tab is hidden and
 * starts paused under prefers-reduced-motion.
 */
import type { OrbitSample, SimulationOutput } from '../../physics/types';
import { h, s } from '../dom';
import { auFromM, num, sEarth } from '../format';
import { blackbodyColor } from '../starColor';

const W = 400, H = 260, PAD = 34;
/** Seconds of wall-clock time per animated orbit (visual only). */
const SECONDS_PER_ORBIT = 8;

export class OrbitView {
  readonly el: HTMLElement;
  private svg: SVGSVGElement;
  private path: SVGPathElement;
  private star: SVGCircleElement;
  private glow: SVGCircleElement;
  private planet: SVGCircleElement;
  private periG: SVGGElement;
  private apoG: SVGGElement;
  private caption: HTMLParagraphElement;
  private rDist: HTMLElement;
  private rFlux: HTMLElement;
  private rTeq: HTMLElement;
  private playBtn: HTMLButtonElement;

  private samples: OrbitSample[] = [];
  private scale = 1;
  private cx = W / 2;
  private cy = H / 2;
  private phase = 0; // 0..1 of an orbit
  private playing: boolean;
  private raf = 0;
  private lastT = 0;
  private lastIdx = -1;

  constructor() {
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.playing = !reduce;

    this.path = s('path', { class: 'orbit__path', fill: 'none' });
    this.glow = s('circle', { class: 'orbit__glow' });
    this.star = s('circle', { class: 'orbit__star' });
    this.planet = s('circle', { class: 'orbit__planet', r: 6 });
    this.periG = s('g', { class: 'orbit__apsis' });
    this.apoG = s('g', { class: 'orbit__apsis' });
    this.svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'orbit__svg', role: 'img', 'aria-labelledby': 'orbit-cap' },
      s('defs', {}, s('radialGradient', { id: 'starglow' },
        s('stop', { offset: '0%', 'stop-color': 'currentColor', 'stop-opacity': '0.55' }),
        s('stop', { offset: '100%', 'stop-color': 'currentColor', 'stop-opacity': '0' }))),
      this.path, this.periG, this.apoG, this.glow, this.star, this.planet);
    this.caption = h('p', { id: 'orbit-cap', class: 'visually-hidden' });

    const cell = (label: string) => {
      const v = h('span', { class: 'readout__v' }, '—');
      return [v, h('div', { class: 'readout__cell' }, h('span', { class: 'readout__k' }, label), v)] as const;
    };
    const [d, dc] = cell('Distance');
    const [f, fc] = cell('Flux');
    const [t, tc] = cell('T_eq (instant.)');
    this.rDist = d; this.rFlux = f; this.rTeq = t;

    this.playBtn = h('button', { type: 'button', class: 'btn btn--ghost' });
    this.playBtn.addEventListener('click', () => this.setPlaying(!this.playing));

    this.el = h('section', { class: 'card orbit', 'aria-labelledby': 'orbit-h' },
      h('div', { class: 'card__head' }, h('h2', { id: 'orbit-h', class: 'card__title' }, 'Orbit'), this.playBtn),
      h('div', { class: 'orbit__frame' }, this.svg), this.caption,
      h('div', { class: 'readout' }, dc, fc, tc),
      h('p', { class: 'hint' }, 'Instantaneous T_eq; real climates lag behind (DESIGN §8). Not to scale: star size is exaggerated; animation speed is not real time.'));

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.stop(); else if (this.playing) this.start();
    });
    this.syncButton();
  }

  update(out: SimulationOutput | null): void {
    if (!out || out.orbit.samples.length === 0) {
      this.samples = [];
      this.path.setAttribute('d', '');
      this.caption.textContent = 'No orbit to display.';
      this.stop();
      return;
    }
    this.samples = out.orbit.samples;
    const e = out.input.planet.ecc;
    const peri = out.orbit.periapsis.value, apo = out.orbit.apoapsis.value;
    const a = (peri + apo) / 2;
    const b = a * Math.sqrt(1 - e * e);
    // Bounding box in orbital-plane metres (star at origin, periapsis on +x).
    const minX = -apo, maxX = peri, minY = -b, maxY = b;
    this.scale = Math.min((W - 2 * PAD) / (maxX - minX), (H - 2 * PAD) / (maxY - minY));
    this.cx = W / 2 - ((minX + maxX) / 2) * this.scale;
    this.cy = H / 2;

    // Path from samples (true ellipse); fallback to analytic ellipse for tiny n.
    const pts = this.samples.map((p) => this.xy(p.x_m, p.y_m));
    this.path.setAttribute('d', pts.length > 8
      ? `M${pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join('L')}Z`
      : this.ellipsePath(a, b, e));

    // Star: color from Teff, size from log radius (not to scale).
    const teff = out.input.star.teff_K;
    const rs = Math.min(16, Math.max(5, 9 + 3 * Math.log10(Math.max(1e-3, out.input.star.radius_Rsun))));
    const color = blackbodyColor(teff);
    for (const c of [this.star, this.glow]) { c.setAttribute('cx', String(this.cx)); c.setAttribute('cy', String(this.cy)); }
    this.star.setAttribute('r', String(rs));
    this.star.setAttribute('fill', color);
    this.glow.setAttribute('r', String(rs * 2.6));
    this.glow.setAttribute('fill', 'url(#starglow)');
    this.glow.style.color = color;

    this.drawApsis(this.periG, peri, 0, 'Periapsis', e > 1e-4);
    this.drawApsis(this.apoG, -apo, Math.PI, 'Apoapsis', e > 1e-4);

    this.caption.textContent = e > 1e-4
      ? `Elliptical orbit, eccentricity ${num(e, 2)}, periapsis ${num(auFromM(peri))} AU, apoapsis ${num(auFromM(apo))} AU, star at one focus.`
      : `Circular orbit of radius ${num(auFromM(a))} AU.`;

    this.lastIdx = -1;
    this.renderFrame();
    if (this.playing && !document.hidden) this.start();
  }

  private ellipsePath(a: number, b: number, e: number): string {
    const c = a * e;
    const [x1, y] = this.xy(-c - a, 0);
    const [x2] = this.xy(-c + a, 0);
    const rx = a * this.scale, ry = b * this.scale;
    return `M${x1},${y}A${rx},${ry} 0 1 0 ${x2},${y}A${rx},${ry} 0 1 0 ${x1},${y}Z`;
  }

  private drawApsis(g: SVGGElement, x_m: number, _ang: number, label: string, show: boolean): void {
    g.replaceChildren();
    if (!show) return;
    const [x, y] = this.xy(x_m, 0);
    const right = x_m > 0;
    const d = Math.abs(x_m);
    g.append(
      s('line', { x1: this.cx, y1: y, x2: x, y2: y, class: 'orbit__axis' }),
      s('circle', { cx: x, cy: y, r: 3.5, class: 'orbit__apsis-dot' }),
      s('text', { x: right ? Math.min(x, W - 4) : Math.max(x, 4), y: y - 12, 'text-anchor': right ? 'end' : 'start', class: 'orbit__label' }, label),
      s('text', { x: right ? Math.min(x, W - 4) : Math.max(x, 4), y: y + 20, 'text-anchor': right ? 'end' : 'start', class: 'orbit__label orbit__label--v' }, `${num(auFromM(d))} AU`),
    );
  }

  private xy(x_m: number, y_m: number): [number, number] {
    // SVG y grows downward; flip so the orbit runs counter-clockwise.
    return [this.cx + x_m * this.scale, this.cy - y_m * this.scale];
  }

  private renderFrame(): void {
    const n = this.samples.length;
    if (!n) return;
    const idx = Math.floor(this.phase * n) % n;
    if (idx === this.lastIdx) return;
    this.lastIdx = idx;
    const p = this.samples[idx]!;
    const [x, y] = this.xy(p.x_m, p.y_m);
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

  private start(): void {
    if (this.raf || !this.samples.length) return;
    this.lastT = 0;
    this.raf = requestAnimationFrame(this.tick);
  }

  private stop(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private setPlaying(p: boolean): void {
    this.playing = p;
    if (p) this.start(); else this.stop();
    this.syncButton();
  }

  private syncButton(): void {
    this.playBtn.textContent = this.playing ? '❚❚ Pause' : '▶ Play';
    this.playBtn.setAttribute('aria-label', this.playing ? 'Pause orbit animation' : 'Play orbit animation');
  }
}
