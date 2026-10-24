/**
 * Star stats (T★ / R★ / M★ with source badges and ± uncertainties) and, in real
 * mode, the remaining catalog values. Null → "unknown", never blank.
 */
import type { CatalogEntry, Measured, SimulationOutput, Star } from '../../physics/types';
import { L_SUN } from '../../physics/constants';
import { h, replace } from '../dom';
import { measured, num, plural } from '../format';
import { icon } from '../icons';
import type { SourceTag } from '../state';
import { badge } from './badge';

function pm(m?: Measured | null): string | null {
  const up = m?.errPlus, dn = m?.errMinus;
  if (up == null && dn == null) return null;
  const a = Math.abs(up ?? dn ?? 0), b = Math.abs(dn ?? up ?? 0);
  return Math.abs(a - b) <= 1e-12 * Math.max(a, b, 1) ? `± ${num(a, 2)}` : `+${num(a, 2)} / −${num(b, 2)}`;
}

export function renderStarStats(container: HTMLElement, star: Star, tag: SourceTag, out: SimulationOutput | null, real: boolean): void {
  const u = star.uncertainties ?? {};
  const col = (label: string, value: string, err: string | null) =>
    h('div', { class: 'stat' },
      h('span', { class: 'stat__label' }, icon('sun', 12), label),
      h('span', { class: 'stat__value' }, value),
      err ? h('span', { class: 'stat__err' }, err) : null,
      badge(tag));
  const L = out ? out.star.luminosity.value / L_SUN : star.luminosity_Lsun;
  const how = star.luminosity_Lsun != null ? (real ? 'catalog' : 'preset table') : 'from 4πR²σT⁴';
  replace(container,
    h('div', { class: 'stats' },
      col('T★', `${Math.round(star.teff_K).toLocaleString('en-US')} K`, real ? pm(u.teff_K) : null),
      col('R★', `${num(star.radius_Rsun)} R☉`, real ? pm(u.radius_Rsun) : null),
      col('M★', `${num(star.mass_Msun)} M☉`, real ? pm(u.mass_Msun) : null)),
    h('p', { class: 'mono-note' }, `L★ ≈ ${num(L)} L☉${real && star.luminosity_Lsun != null && pm(u.luminosity_Lsun) ? ' ' + pm(u.luminosity_Lsun) : ''} (${how})`));
}

const row = (k: string, v: string) => [h('dt', {}, k), h('dd', { class: v === 'unknown' ? 'is-unknown' : '' }, v)];

/** Real mode: the other catalog values, with ± and "unknown". */
export function renderCatalogDetails(container: HTMLElement, e: CatalogEntry | null): void {
  if (!e) { replace(container); return; }
  const pu = e.planet.uncertainties ?? {};
  const derived = new Set(e.planet.derivedFields ?? []);
  replace(container,
    h('h3', { class: 'micro' }, 'Catalog values'),
    h('dl', { class: 'kv' },
      ...row('Host star', `${e.star.name} (${e.star.spectralType || 'class unknown'})`),
      ...row('Star age', measured(e.star.age_Gyr ?? null, 'Gyr')),
      ...row('Planet radius', measured(e.planet.radius_Rearth, 'R⊕', pu.radius_Rearth)),
      ...row('Planet mass', measured(e.planet.mass_Mearth, 'M⊕', pu.mass_Mearth)),
      ...row('Semi-major axis', measured(e.planet.a_AU, 'AU', pu.a_AU, 4) + (derived.has('a_AU') ? ' (derived)' : '')),
      ...row('Eccentricity', measured(e.planet.ecc, '', pu.ecc) + (e.missing.includes('pl_orbeccen') ? ' (not measured, 0 used)' : '')),
      ...row('Period', e.planet.orbitalPeriod_days == null ? 'unknown' : plural(e.planet.orbitalPeriod_days, 'day', 'days', 4)),
      ...row('Moon', e.planet.moon.kind === 'custom' ? e.planet.moon.label : e.planet.moon.kind)),
    e.missing.length ? h('p', { class: 'muted small' }, `Missing from catalog (not guessed): ${e.missing.join(', ')}`) : null,
    h('p', { class: 'muted small' }, `Source: ${e.planet.reference ?? e.planet.source}`));
}
