/**
 * Read-only panel of measured star/planet values (real mode) or the preset
 * star + hypothetical planet (hypothetical mode). Null → "unknown", never blank.
 */
import type { CatalogEntry, Star } from '../../physics/types';
import { h, replace } from '../dom';
import { measured, plural } from '../format';

export interface MeasuredProps {
  mode: 'hypothetical' | 'real';
  entry: CatalogEntry | null;
  presetStar: Star;
}

const row = (k: string, v: string) => [h('dt', {}, k), h('dd', { class: v === 'unknown' ? 'is-unknown' : '' }, v)];

export function renderMeasured(container: HTMLElement, p: MeasuredProps): void {
  if (p.mode === 'hypothetical') {
    const st = p.presetStar;
    replace(container,
      h('h3', { class: 'panel-title' }, 'Star & planet (preset)'),
      h('dl', { class: 'kv' },
        ...row('Star', st.name),
        ...row('T_eff', measured(st.teff_K, 'K')),
        ...row('Radius', measured(st.radius_Rsun, 'R☉')),
        ...row('Mass', measured(st.mass_Msun, 'M☉')),
        ...row('Luminosity', measured(st.luminosity_Lsun, 'L☉')),
        ...row('Planet', 'Earth mass & radius (assumed)'),
        ...row('Eccentricity', '0 (circular, DESIGN §8)')),
    );
    return;
  }
  const e = p.entry;
  if (!e) { replace(container, h('p', { class: 'hint' }, 'Select a planet to see its measured values.')); return; }
  const su = e.star.uncertainties ?? {};
  const pu = e.planet.uncertainties ?? {};
  const derived = new Set(e.planet.derivedFields ?? []);
  replace(container,
    h('h3', { class: 'panel-title' }, 'Measured values (read-only)'),
    h('dl', { class: 'kv' },
      ...row('Host star', e.star.name),
      ...row('Spectral type', e.star.spectralType || 'unknown'),
      ...row('T_eff', measured(e.star.teff_K, 'K', su.teff_K)),
      ...row('Star radius', measured(e.star.radius_Rsun, 'R☉', su.radius_Rsun)),
      ...row('Star mass', measured(e.star.mass_Msun, 'M☉', su.mass_Msun)),
      ...row('Luminosity', e.star.luminosity_Lsun == null ? 'unknown (computed from R, T_eff)' : measured(e.star.luminosity_Lsun, 'L☉', su.luminosity_Lsun)),
      ...row('Star age', measured(e.star.age_Gyr ?? null, 'Gyr')),
      ...row('Planet radius', measured(e.planet.radius_Rearth, 'R⊕', pu.radius_Rearth)),
      ...row('Planet mass', measured(e.planet.mass_Mearth, 'M⊕', pu.mass_Mearth)),
      ...row('Semi-major axis', measured(e.planet.a_AU, 'AU', pu.a_AU, 4) + (derived.has('a_AU') ? ' (derived)' : '')),
      ...row('Eccentricity', measured(e.planet.ecc, '', pu.ecc) + (e.missing.includes('pl_orbeccen') ? ' (not measured — 0 used)' : '')),
      ...row('Period', e.planet.orbitalPeriod_days == null ? 'unknown' : plural(e.planet.orbitalPeriod_days, 'day', 'days', 4)),
      ...row('Moon', e.planet.moon.kind === 'custom' ? e.planet.moon.label : e.planet.moon.kind)),
    e.missing.length ? h('p', { class: 'hint' }, `Missing from catalog (not guessed): ${e.missing.join(', ')}`) : null,
    h('p', { class: 'hint' }, `Source: ${e.planet.reference ?? e.planet.source}`),
  );
}
