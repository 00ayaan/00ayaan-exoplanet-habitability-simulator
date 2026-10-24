/**
 * Metric cards: one per model output, each with a "?" popover giving a
 * plain-language line plus that Result's assumptions. With "Compare to Earth"
 * on, each card adds an Earth reference value and a ratio.
 */
import type { Result, SimulationOutput } from '../../physics/types';
import { L_SUN } from '../../physics/constants';
import { h, setText } from '../dom';
import { celsius, days, gEarth, num, plural, waterPhaseLabel, years } from '../format';
import { Help } from './help';

interface Metric {
  key: string;
  label: string;
  help: string;
  results: (o: SimulationOutput) => Result<unknown>[];
  /** [value text, unit] — value 'unknown' when null. */
  value: (o: SimulationOutput) => [string, string];
  sub: (o: SimulationOutput) => string;
  /** Numeric value for the Earth ratio (null = no ratio). */
  ratio?: (o: SimulationOutput) => number | null;
}

const t1 = (k: number) => (Math.round(k * 10) / 10).toFixed(1);
const uniq = (rs: Result<unknown>[]) => [...new Set(rs.flatMap((r) => r.assumptions))];
const LOCK: Record<string, string> = { likely: 'Likely locked', possible: 'Possibly locked', unlikely: 'Unlikely', unknown: 'unknown' };

const METRICS: Metric[] = [
  { key: 'ts', label: 'Surface temp T_s', help: 'Estimated average surface temperature, after the greenhouse effect warms the planet above T_eq.',
    results: (o) => [o.surfaceTemp, o.epsilon], value: (o) => [t1(o.surfaceTemp.value), 'K'],
    sub: (o) => `${celsius(o.surfaceTemp.value)} · ε=${num(o.epsilon.value, 2)}`, ratio: (o) => o.surfaceTemp.value },
  { key: 'teq', label: 'Equilibrium temp T_eq', help: 'The temperature a planet with no atmosphere would settle at, balancing absorbed starlight against emitted heat.',
    results: (o) => [o.equilibriumTemp], value: (o) => [t1(o.equilibriumTemp.value), 'K'],
    sub: (o) => celsius(o.equilibriumTemp.value), ratio: (o) => o.equilibriumTemp.value },
  { key: 's', label: 'Relative insolation S', help: 'Starlight reaching the planet compared with what Earth gets from the Sun (Earth = 1).',
    results: (o) => [o.insolation], value: (o) => [num(o.insolation.value), 'S⊕'],
    sub: () => 'at the semi-major axis', ratio: (o) => o.insolation.value },
  { key: 'f', label: 'Stellar flux F', help: 'Power of starlight arriving on each square metre facing the star, at the average orbital distance.',
    results: (o) => [o.stellarFlux], value: (o) => [num(o.stellarFlux.value), 'W/m²'],
    sub: () => 'F = L / 4πa²', ratio: (o) => o.stellarFlux.value },
  { key: 'l', label: 'Stellar luminosity L', help: 'Total power the star gives off, compared with the Sun.',
    results: (o) => [o.star.luminosity], value: (o) => [num(o.star.luminosity.value / L_SUN), 'L☉'],
    sub: (o) => `${num(o.star.luminosity.value)} W`, ratio: (o) => o.star.luminosity.value },
  { key: 'p', label: 'Orbital period P', help: 'How long one orbit takes, from Kepler’s third law using the star’s (and planet’s) mass.',
    results: (o) => [o.orbit.period], value: (o) => [num(days(o.orbit.period.value)), plural(days(o.orbit.period.value), 'day').replace(/^\S+ /, '')],
    sub: (o) => plural(years(o.orbit.period.value), 'year'), ratio: (o) => o.orbit.period.value },
  { key: 'g', label: 'Surface gravity g', help: 'How strongly you would be pulled down standing on the surface. Needs both mass and radius.',
    results: (o) => [o.surfaceGravity], value: (o) => (o.surfaceGravity.value == null ? ['unknown', ''] : [num(o.surfaceGravity.value), 'm/s²']),
    sub: (o) => (o.surfaceGravity.value == null ? 'needs planet mass and radius' : `${num(gEarth(o.surfaceGravity.value))} g`), ratio: (o) => o.surfaceGravity.value },
  { key: 'w', label: 'Water phase', help: 'Whether surface water would be ice, liquid or vapor at the modeled temperature and pressure.',
    results: (o) => [o.waterPhase], value: (o) => [waterPhaseLabel(o.waterPhase.value), ''],
    sub: (o) => `at ${num(o.input.atmosphere.surfacePressure_bar)} bar` },
  { key: 'tide', label: 'Tidal acceleration', help: 'The stretching force the star’s gravity puts on the planet. Strong tides tend to lock one face toward the star.',
    results: (o) => [o.tides.stellarAcceleration, o.tides.stellarRelativeToEarth, o.tides.moon],
    value: (o) => (o.tides.stellarAcceleration.value == null ? ['unknown', ''] : [num(o.tides.stellarAcceleration.value), 'm/s²']),
    sub: (o) => {
      const rel = o.tides.stellarRelativeToEarth.value;
      const m = o.input.planet.moon;
      const moon = m.kind === 'custom' ? `moon ${num(o.tides.moon.value)} m/s²` : `moon: ${m.kind}`;
      return `${rel == null ? 'unknown' : num(rel) + '×'} Earth’s stellar tide · ${moon}`;
    },
    ratio: (o) => o.tides.stellarAcceleration.value },
  { key: 'lock', label: 'Tidal locking', help: 'Whether one side probably always faces the star. This is a rough, qualitative indicator only.',
    results: (o) => [o.tides.locking], value: (o) => [LOCK[o.tides.locking.value] ?? o.tides.locking.value, ''],
    sub: () => 'qualitative indicator' },
];

interface CardRefs { value: HTMLParagraphElement; text: Text; unit: HTMLSpanElement; sub: HTMLParagraphElement; foot: HTMLParagraphElement; earth: HTMLSpanElement; ratio: HTMLSpanElement }

/** Cards are built once; each run only updates the text that changed. */
export class MetricGrid {
  readonly el: HTMLDivElement;
  private out: SimulationOutput | null = null;
  private cards: CardRefs[] = [];
  private empty: HTMLParagraphElement;

  constructor() {
    this.empty = h('p', { class: 'muted' }, 'Pick a planet or move a slider to run the model.');
    const nodes = METRICS.map((m) => {
      const text = document.createTextNode('');
      const unit = h('span', { class: 'metric__unit' });
      const value = h('p', { class: 'metric__value' }, text, unit);
      const sub = h('p', { class: 'metric__sub' });
      const earth = h('span', { class: 'metric__earth' });
      const ratio = h('span', {});
      const foot = h('p', { class: 'metric__foot', hidden: true }, earth, ratio);
      this.cards.push({ value, text, unit, sub, foot, earth, ratio });
      return h('article', { class: 'metric' },
        h('h3', { class: 'micro metric__label' }, m.label, new Help(m.label, () => this.helpFor(m)).el),
        value, sub, foot);
    });
    this.el = h('div', { class: 'metrics' }, this.empty, ...nodes);
  }

  update(out: SimulationOutput | null, earth: SimulationOutput | null): void {
    this.out = out;
    this.empty.hidden = !!out;
    METRICS.forEach((m, i) => {
      const c = this.cards[i]!;
      const card = c.value.parentElement!;
      card.hidden = !out;
      if (!out) return;
      const [v, unit] = m.value(out);
      if (c.text.data !== v) c.text.data = v;
      c.value.classList.toggle('is-unknown', v === 'unknown');
      setText(c.unit, unit);
      c.unit.hidden = !unit;
      setText(c.sub, m.sub(out));
      c.foot.hidden = !earth;
      if (earth) {
        const [ev, eu] = m.value(earth);
        setText(c.earth, `Earth: ${ev}${eu ? ' ' + eu : ''}`);
        const a = m.ratio?.(out), b = m.ratio?.(earth);
        setText(c.ratio, a != null && b ? `${num(a / b)}× Earth` : '');
      }
    });
  }

  private helpFor(m: Metric): (Node | string)[] {
    const a = this.out ? uniq(m.results(this.out)) : [];
    return [h('p', {}, m.help), a.length ? h('ul', {}, ...a.map((x) => h('li', {}, x))) : h('p', {}, 'No run-specific assumptions.')];
  }
}
