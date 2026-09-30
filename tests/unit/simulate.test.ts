// Owner: Agent 8. End-to-end pipeline tests (src/pipeline/simulate.ts).
import { describe, expect, it } from 'vitest';
import { defaultAtmosphere, hypotheticalPlanet, simulate } from '../../src/pipeline/simulate';
import { STAR_PRESETS } from '../../src/physics/starPresets';
import { EARTH_GREENHOUSE } from '../../src/physics/atmosphere';
import { DEFAULT_ALBEDO, MODEL_ASSUMPTIONS, STAR_TYPES } from '../../src/physics/types';
import type { Planet, SimulationInput, SimulationOutput } from '../../src/physics/types';

const DAY = 86400;

function hypo(type: keyof typeof STAR_PRESETS, a_AU: number, extra: Partial<SimulationInput> = {}): SimulationInput {
  return {
    star: STAR_PRESETS[type],
    planet: hypotheticalPlanet(a_AU),
    atmosphere: defaultAtmosphere(),
    mode: 'hypothetical',
    modifiedFields: [],
    ...extra,
  };
}

/** A real-mode planet record resembling what the catalog loader produces. */
function realPlanet(over: Partial<Planet> = {}): Planet {
  return {
    name: 'Test b',
    mass_Mearth: 1.2,
    radius_Rearth: 1.1,
    a_AU: 0.05,
    ecc: 0.02,
    orbitalPeriod_days: 11.2,
    rotationPeriod_days: null,
    moon: { kind: 'unknown' },
    source: 'nasa-exoplanet-archive',
    reference: 'Test et al. 2020',
    derivedFields: [],
    uncertainties: { a_AU: { value: 0.05 } },
    ...over,
  };
}

function allNumbersFinite(x: unknown): boolean {
  if (typeof x === 'number') return Number.isFinite(x);
  if (Array.isArray(x)) return x.every(allNumbersFinite);
  if (x && typeof x === 'object') return Object.values(x).every(allNumbersFinite);
  return true;
}

describe('helpers', () => {
  it('hypotheticalPlanet is an Earth analogue with no moon', () => {
    const p = hypotheticalPlanet(2.5);
    expect(p).toMatchObject({ mass_Mearth: 1, radius_Rearth: 1, a_AU: 2.5, ecc: 0, moon: { kind: 'none' }, source: 'hypothetical', name: 'Hypothetical planet', rotationPeriod_days: null });
  });
  it('defaultAtmosphere is 1 bar, Earth greenhouse, A = 0.30', () => {
    expect(defaultAtmosphere()).toEqual({ surfacePressure_bar: 1, greenhouse: EARTH_GREENHOUSE, albedo: DEFAULT_ALBEDO });
  });
});

describe('Earth scenario (G preset, 1 AU, default atmosphere)', () => {
  const out = simulate(hypo('G', 1));
  it('orbit and radiation', () => {
    expect(out.orbit.period.value / DAY).toBeCloseTo(365.25, 0);
    expect(out.insolation.value).toBeCloseTo(1, 6);
    expect(out.stellarFlux.value).toBeCloseTo(1361.2, 0);
    expect(out.orbit.periapsis.value).toBeCloseTo(out.orbit.apoapsis.value, 0);
  });
  it('temperatures and water', () => {
    expect(out.equilibriumTemp.value).toBeGreaterThan(254);
    expect(out.equilibriumTemp.value).toBeLessThan(256);
    expect(out.surfaceTemp.value).toBeCloseTo(288, 1);
    expect(out.waterPhase.value).toBe('liquid');
  });
  it('gravity and tides', () => {
    expect(out.surfaceGravity.value).not.toBeNull();
    expect(out.surfaceGravity.value!).toBeCloseTo(9.8, 1);
    expect(out.tides.stellarRelativeToEarth.value!).toBeCloseTo(1, 6);
    expect(out.tides.locking.value).toBe('unlikely');
    expect(out.tides.moon.value).toBeNull();
  });
  it('classification', () => {
    expect(out.habitability.status).toBe('Highly Habitable');
    expect(out.habitability.checks.every((c) => c.passed === true)).toBe(true);
  });
  it('assumptions include the model list; provenance names star and planet', () => {
    for (const a of MODEL_ASSUMPTIONS) expect(out.assumptions).toContain(a);
    expect(new Set(out.assumptions).size).toBe(out.assumptions.length);
    expect(out.provenance[0]).toMatch(/^Star: Sun-like star .* — preset:G, ref IAU 2015/);
    expect(out.provenance[1]).toMatch(/^Planet: Hypothetical planet — hypothetical$/);
  });
});

describe('M dwarf at its habitable-zone distance', () => {
  const a = Math.sqrt(STAR_PRESETS.M.luminosity_Lsun!); // S = 1
  const out = simulate(hypo('M', a));
  it('receives Earth insolation, is temperate, but likely tidally locked → Marginal', () => {
    expect(out.insolation.value).toBeCloseTo(1, 6);
    expect(out.surfaceTemp.value).toBeCloseTo(288, 1);
    expect(out.tides.locking.value).toBe('likely');
    expect(out.habitability.status).toBe('Marginally Habitable');
    expect(out.habitability.checks.find((c) => c.id === 'tidal')!.passed).toBe(false);
  });
});

describe('unknown mass and radius', () => {
  const input: SimulationInput = {
    star: STAR_PRESETS.K,
    planet: realPlanet({ mass_Mearth: null, radius_Rearth: null, a_AU: 0.4 }),
    atmosphere: defaultAtmosphere(),
    mode: 'real',
    modifiedFields: [],
  };
  it('does not throw and leaves dependent values null with notes', () => {
    let out!: SimulationOutput;
    expect(() => (out = simulate(input))).not.toThrow();
    expect(out.surfaceGravity.value).toBeNull();
    expect(out.surfaceGravity.assumptions.join(' ')).toMatch(/unknown/i);
    expect(out.tides.stellarAcceleration.value).toBeNull();
    expect(out.tides.stellarRelativeToEarth.value).toBeNull();
    expect(out.tides.moon.value).toBeNull();
    expect(out.tides.locking.value).toBe('unknown');
    expect(out.habitability.confidence).toBe('low');
    expect(out.assumptions.join(' ')).toMatch(/mass and radius unknown/);
  });
  it('derived eccentricity lowers confidence and is surfaced', () => {
    const out = simulate({
      ...input,
      planet: realPlanet({ ecc: 0, derivedFields: ['ecc', 'ecc: not reported, assumed circular (e = 0)'] }),
    });
    expect(out.habitability.confidence).toBe('low');
    expect(out.assumptions).toContain('Eccentricity not reported: circular orbit (e = 0) assumed.');
    expect(out.assumptions).toContain('Derived value — ecc: not reported, assumed circular (e = 0).');
  });
});

describe('real mode provenance', () => {
  it('lists modified fields with archive → current values', () => {
    const planet = realPlanet({ a_AU: 0.2 }); // archive a = 0.05 (uncertainties.a_AU.value)
    const out = simulate({
      star: { ...STAR_PRESETS.M, source: 'nasa-exoplanet-archive', reference: 'Star ref 2019' },
      planet,
      atmosphere: { ...defaultAtmosphere(), surfacePressure_bar: 2 },
      mode: 'real',
      modifiedFields: ['a_AU', 'surfacePressure_bar'],
    });
    expect(out.provenance).toContain(`Star: ${STAR_PRESETS.M.name} — nasa-exoplanet-archive, ref Star ref 2019`);
    expect(out.provenance).toContain('Planet: Test b — nasa-exoplanet-archive, ref Test et al. 2020');
    const mod = out.provenance.find((p) => p.startsWith('Modified from archive values:'));
    expect(mod).toBe('Modified from archive values: a_AU (0.05 AU → 0.2 AU), surfacePressure_bar (assumed default 1 bar → 2 bar)');
  });
  it('no modified line when nothing was modified', () => {
    const out = simulate({ star: STAR_PRESETS.M, planet: realPlanet(), atmosphere: defaultAtmosphere(), mode: 'real', modifiedFields: [] });
    expect(out.provenance.some((p) => p.startsWith('Modified'))).toBe(false);
  });
  it('ignores requests to modify measured star/planet values', () => {
    const input: SimulationInput = { star: STAR_PRESETS.M, planet: realPlanet(), atmosphere: defaultAtmosphere(), mode: 'real', modifiedFields: ['mass_Mearth', 'teff_K'] };
    const out = simulate(input);
    const base = simulate({ ...input, modifiedFields: [] });
    expect(out.surfaceGravity.value).toBe(base.surfaceGravity.value);
    expect(out.star.luminosity.value).toBe(base.star.luminosity.value);
    expect(out.assumptions.join(' ')).toMatch(/Ignored modification request for mass_Mearth, teff_K/);
  });
});

describe('contract behaviour', () => {
  it('echoes the input', () => {
    const input = hypo('K', 0.4);
    expect(simulate(input).input).toBe(input);
  });
  it('samples length = orbitSamples (default 180)', () => {
    expect(simulate(hypo('G', 1)).orbit.samples).toHaveLength(180);
    expect(simulate(hypo('G', 1, { orbitSamples: 37 })).orbit.samples).toHaveLength(37);
  });
  it('is deterministic', () => {
    const input = { ...hypo('F', 1.7), planet: { ...hypotheticalPlanet(1.7), ecc: 0.4 } };
    expect(simulate(input)).toEqual(simulate(input));
  });
  it('invalid eccentricity and distance throw RangeError', () => {
    expect(() => simulate({ ...hypo('G', 1), planet: { ...hypotheticalPlanet(1), ecc: 1 } })).toThrow(RangeError);
    expect(() => simulate({ ...hypo('G', 1), planet: { ...hypotheticalPlanet(1), ecc: -0.1 } })).toThrow(RangeError);
    expect(() => simulate(hypo('G', 0))).toThrow(RangeError);
  });
  it('every star type at slider extremes yields finite numbers', () => {
    for (const t of STAR_TYPES) {
      for (const a of [0.05, 1, 20]) {
        expect(allNumbersFinite(simulate(hypo(t, a))), `${t} @ ${a} AU`).toBe(true);
      }
    }
  });
  it('flags an orbit inside the star as unphysical', () => {
    const out = simulate(hypo('O', 0.05)); // O5V radius 11.45 R☉ ≈ 0.053 AU
    expect(out.assumptions.join(' ')).toMatch(/inside the star's radius/);
  });
});
