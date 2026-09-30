/**
 * Results card grid. Each card shows a value (with secondary units) and a
 * native <details> "i" disclosure listing the Result's assumptions — tap to
 * open, works without hover and with screen readers.
 */
import type { Result, SimulationOutput } from '../../physics/types';
import { h, replace } from '../dom';
import { celsius, days, gEarth, kelvin, num, waterPhaseLabel, years } from '../format';

interface CardSpec {
  title: string;
  primary: string;
  secondary?: string;
  assumptions: string[];
}

function card(c: CardSpec): HTMLElement {
  return h('article', { class: 'result' },
    h('h3', { class: 'result__title' }, c.title),
    h('p', { class: `result__primary${c.primary === 'unknown' ? ' is-unknown' : ''}` }, c.primary),
    c.secondary ? h('p', { class: 'result__secondary' }, c.secondary) : null,
    h('details', { class: 'info' },
      h('summary', { 'aria-label': `Assumptions for ${c.title}` }, h('span', { class: 'info__i', 'aria-hidden': 'true' }, 'i'), h('span', { class: 'info__text' }, 'Assumptions')),
      c.assumptions.length
        ? h('ul', {}, ...c.assumptions.map((a) => h('li', {}, a)))
        : h('p', { class: 'hint' }, 'No run-specific assumptions reported.')));
}

const uniq = (...rs: Result<unknown>[]) => [...new Set(rs.flatMap((r) => r.assumptions))];

const LOCK_TEXT: Record<string, string> = {
  likely: 'Likely tidally locked',
  possible: 'Possibly tidally locked',
  unlikely: 'Unlikely to be locked',
  unknown: 'unknown',
};

export function renderResults(container: HTMLElement, out: SimulationOutput | null): void {
  if (!out) { replace(container, h('p', { class: 'hint' }, 'Select a planet or adjust the controls to run the model.')); return; }
  const P = out.orbit.period.value;
  const g = out.surfaceGravity.value;
  const tRel = out.tides.stellarRelativeToEarth.value;
  const moon = out.input.planet.moon;
  const moonText = moon.kind === 'custom'
    ? `Moon tide: ${num(out.tides.moon.value)} m/s²`
    : `Moon: ${moon.kind}`;
  const pDays = days(P);

  const cards: CardSpec[] = [
    { title: 'Stellar flux', primary: `${num(out.insolation.value)} S⊕`, secondary: `${num(out.stellarFlux.value)} W/m²`, assumptions: uniq(out.stellarFlux, out.insolation, out.star.luminosity) },
    { title: 'Orbital period', primary: pDays < 1000 ? `${num(pDays)} days` : `${num(years(P))} years`, secondary: pDays < 1000 ? `${num(years(P))} years` : `${num(pDays)} days`, assumptions: out.orbit.period.assumptions },
    { title: 'Surface gravity', primary: g == null ? 'unknown' : `${num(g)} m/s²`, secondary: g == null ? 'Needs planet mass and radius' : `${num(gEarth(g))} g⊕`, assumptions: out.surfaceGravity.assumptions },
    { title: 'Equilibrium temp.', primary: kelvin(out.equilibriumTemp.value), secondary: celsius(out.equilibriumTemp.value), assumptions: out.equilibriumTemp.assumptions },
    { title: 'Est. surface temp.', primary: kelvin(out.surfaceTemp.value), secondary: celsius(out.surfaceTemp.value), assumptions: uniq(out.surfaceTemp, out.epsilon) },
    { title: 'Water phase', primary: waterPhaseLabel(out.waterPhase.value), secondary: `at ${num(out.input.atmosphere.surfacePressure_bar)} bar`, assumptions: out.waterPhase.assumptions },
    { title: 'Tidal environment', primary: tRel == null ? 'unknown' : `${num(tRel)} × Earth’s`, secondary: `Stellar tide · ${moonText}`, assumptions: uniq(out.tides.stellarAcceleration, out.tides.stellarRelativeToEarth, out.tides.moon) },
    { title: 'Tidal locking', primary: LOCK_TEXT[out.tides.locking.value] ?? out.tides.locking.value, secondary: 'Qualitative indicator', assumptions: out.tides.locking.assumptions },
  ];
  replace(container, ...cards.map(card));
}
