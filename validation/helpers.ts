/** Shared helpers for validation/ tests — Agent 9. Builds simulate() inputs via the public API only. */
import { defaultAtmosphere, hypotheticalPlanet, simulate } from '../src/pipeline/simulate';
import { STAR_PRESETS } from '../src/physics/starPresets';
import type { Atmosphere, Planet, SimulationOutput, Star, StarType } from '../src/physics/types';

export function run(
  a_AU: number,
  atm: Partial<Atmosphere> = {},
  star: Star | StarType = 'G',
  planet: Partial<Planet> = {},
  orbitSamples?: number,
): SimulationOutput {
  const s = typeof star === 'string' ? STAR_PRESETS[star] : star;
  return simulate({
    star: s,
    planet: { ...hypotheticalPlanet(a_AU), ...planet },
    atmosphere: { ...defaultAtmosphere(), ...atm },
    mode: 'hypothetical',
    modifiedFields: [],
    ...(orbitSamples !== undefined ? { orbitSamples } : {}),
  });
}

/** Recursively collect every number/null leaf in a SimulationOutput (skipping the echoed input). */
export function numericLeaves(o: unknown, path = '', out: Array<[string, number | null]> = []): Array<[string, number | null]> {
  if (o === null) {
    out.push([path, null]);
  } else if (typeof o === 'number') {
    out.push([path, o]);
  } else if (Array.isArray(o)) {
    o.forEach((v, i) => numericLeaves(v, `${path}[${i}]`, out));
  } else if (typeof o === 'object') {
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
      if (path === '' && k === 'input') continue;
      numericLeaves(v, path ? `${path}.${k}` : k, out);
    }
  }
  return out;
}

export const AU_KM = 1.495978707e8;
