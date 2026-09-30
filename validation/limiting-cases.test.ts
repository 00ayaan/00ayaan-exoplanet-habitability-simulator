/**
 * Limiting-case and property-style validation — Agent 9 (independent).
 *
 * Expected behaviour is derived from the governing equations (inverse-square law,
 * Kepler III, one-layer grey atmosphere, water triple point) in validation/reference.ts.
 */
import { describe, expect, it } from 'vitest';
import { numericLeaves, run } from './helpers';
import { REF, refFlux, refTeq } from './reference';
import { defaultAtmosphere, hypotheticalPlanet, simulate } from '../src/pipeline/simulate';
import { EARTH_GREENHOUSE } from '../src/physics/atmosphere';
import { STAR_PRESETS } from '../src/physics/starPresets';
import { STAR_TYPES } from '../src/physics/types';
import type { SimulationOutput, StarType } from '../src/physics/types';

const AU = REF.AU_m;

function expectAllFiniteOrNull(o: SimulationOutput, label: string): void {
  for (const [path, v] of numericLeaves(o)) {
    if (v === null) continue;
    expect(Number.isFinite(v), `${label}: ${path} = ${v}`).toBe(true);
  }
}

describe('eccentricity limits', () => {
  it('e → 0: e = 1e-9 agrees with e = 0 everywhere', () => {
    const a = run(1, {}, 'G', { ecc: 0 });
    const b = run(1, {}, 'G', { ecc: 1e-9 });
    expect(b.orbit.period.value).toBe(a.orbit.period.value);
    expect(b.orbit.periapsis.value / a.orbit.periapsis.value).toBeCloseTo(1, 8);
    expect(b.orbit.apoapsis.value / a.orbit.apoapsis.value).toBeCloseTo(1, 8);
    expect(b.surfaceTemp.value).toBe(a.surfaceTemp.value);
    expect(b.habitability.status).toBe(a.habitability.status);
    for (let i = 0; i < a.orbit.samples.length; i++) {
      const sa = a.orbit.samples[i]!;
      const sb = b.orbit.samples[i]!;
      expect(sb.distance_m / sa.distance_m).toBeCloseTo(1, 8);
      expect(sb.equilibriumTemp_K / sa.equilibriumTemp_K).toBeCloseTo(1, 8);
      expect(Math.hypot(sb.x_m - sa.x_m, sb.y_m - sa.y_m) / AU).toBeLessThan(1e-8);
    }
  });

  it('e = 0: every sample is on a circle of radius a', () => {
    const o = run(2, {}, 'G', { ecc: 0 });
    for (const s of o.orbit.samples) {
      expect(s.distance_m).toBe(2 * AU);
      expect(Math.hypot(s.x_m, s.y_m) / (2 * AU)).toBeCloseTo(1, 12);
    }
  });

  it('e → 0.99: no NaN, periapsis = a(1−e), apoapsis = a(1+e), period independent of e', () => {
    const e0 = run(1, {}, 'G', { ecc: 0 });
    const o = run(1, {}, 'G', { ecc: 0.99 });
    expectAllFiniteOrNull(o, 'e=0.99');
    expect(o.orbit.periapsis.value / AU).toBeCloseTo(0.01, 12);
    expect(o.orbit.apoapsis.value / AU).toBeCloseTo(1.99, 12);
    expect(o.orbit.period.value).toBe(e0.orbit.period.value);
    const rs = o.orbit.samples.map((s) => s.distance_m / AU);
    expect(Math.min(...rs)).toBeGreaterThanOrEqual(0.01 - 1e-12);
    expect(Math.max(...rs)).toBeLessThanOrEqual(1.99 + 1e-12);
    expect(rs[0]).toBeCloseTo(0.01, 10); // t = 0 is periapsis
  });

  it('samples satisfy Kepler’s equation, the orbit equation and the focus geometry (e = 0.99, 0.5)', () => {
    for (const e of [0.5, 0.99]) {
      const o = run(1, {}, 'G', { ecc: e });
      for (const s of o.orbit.samples) {
        const r = s.distance_m / AU;
        // Orbit equation r(θ) = a(1−e²)/(1+e cosθ) — independent of the sampler's E-based r.
        expect(r).toBeCloseTo((1 - e * e) / (1 + e * Math.cos(s.trueAnomaly_rad)), 9);
        // Star at the focus: |(x, y)| = r.
        expect(Math.hypot(s.x_m, s.y_m) / AU).toBeCloseTo(r, 9);
        // Recover E from x = a(cosE − e), y = b sinE and check M = E − e sinE = 2π t.
        const E = Math.atan2(s.y_m / (AU * Math.sqrt(1 - e * e)), s.x_m / AU + e);
        let M = E - e * Math.sin(E);
        if (M < 0) M += 2 * Math.PI;
        const target = 2 * Math.PI * s.timeFraction;
        const diff = Math.abs(((M - target + Math.PI) % (2 * Math.PI)) - Math.PI);
        expect(diff).toBeLessThan(1e-8);
      }
    }
  });

  it('time-averaged flux over the samples = F(a)/√(1−e²) (analytic result)', () => {
    const e = 0.5;
    const o = simulate({
      star: STAR_PRESETS.G,
      planet: { ...hypotheticalPlanet(1), ecc: e },
      atmosphere: defaultAtmosphere(),
      mode: 'hypothetical',
      modifiedFields: [],
      orbitSamples: 3600,
    });
    const mean = o.orbit.samples.reduce((s, x) => s + x.flux_W_m2, 0) / o.orbit.samples.length;
    expect(mean / (refFlux(1, 1) / Math.sqrt(1 - e * e))).toBeCloseTo(1, 6);
  });

  it('KNOWN LIMITATION: headline flux, T and habitability use a (not the orbit average), so e does not change the verdict', () => {
    // At e = 0.99 the orbit-averaged flux is 1/√(1−0.99²) ≈ 7.1× F(a) and periapsis flux is 10⁴× F(a),
    // yet the classification is identical to the circular orbit.
    const circ = run(1, {}, 'G', { ecc: 0 });
    const ecc = run(1, {}, 'G', { ecc: 0.99 });
    expect(ecc.stellarFlux.value).toBe(circ.stellarFlux.value);
    expect(ecc.habitability.status).toBe(circ.habitability.status);
    const maxFlux = Math.max(...ecc.orbit.samples.map((s) => s.flux_W_m2));
    expect(maxFlux / ecc.stellarFlux.value).toBeGreaterThan(9000);
  });
});

describe('distance limits', () => {
  it('a = 1000 AU: flux ~1e-6 S⊕, T finite and tiny, water is ice, Uninhabitable', () => {
    const o = run(1000);
    expectAllFiniteOrNull(o, '1000 AU');
    expect(o.insolation.value).toBeCloseTo(1e-6, 12);
    expect(o.stellarFlux.value / refFlux(1, 1000)).toBeCloseTo(1, 9);
    // T_eq ∝ a^(−½): 254.6 K / √1000 ≈ 8.05 K.
    expect(o.equilibriumTemp.value).toBeCloseTo(refTeq(refFlux(1, 1), 0.3) / Math.sqrt(1000), 6);
    expect(o.surfaceTemp.value).toBeGreaterThan(0);
    expect(o.waterPhase.value).toBe('ice');
    expect(o.habitability.status).toBe('Uninhabitable');
  });

  it('very small a but outside the star (0.005 AU > R☉ = 0.00465 AU): finite, vapor, Uninhabitable, no inside-star note', () => {
    const o = run(0.005);
    expectAllFiniteOrNull(o, '0.005 AU');
    expect(o.insolation.value).toBeCloseTo(40000, 6);
    expect(o.waterPhase.value).toBe('vapor');
    expect(o.habitability.status).toBe('Uninhabitable');
    expect(o.tides.locking.value).toBe('likely');
    expect(o.assumptions.some((s) => s.startsWith('Unphysical configuration'))).toBe(false);
  });

  it('a inside the star (0.004 AU < R☉): still finite, and flagged as unphysical', () => {
    const o = run(0.004);
    expectAllFiniteOrNull(o, '0.004 AU');
    expect(o.assumptions.some((s) => s.startsWith('Unphysical configuration'))).toBe(true);
  });
});

describe('greenhouse limits (one-layer model)', () => {
  it('greenhouse = 0 → T_s = T_eq exactly', () => {
    for (const a of [0.5, 1, 3]) {
      const o = run(a, { greenhouse: 0 });
      expect(o.surfaceTemp.value).toBeCloseTo(o.equilibriumTemp.value, 10);
      expect(o.surfaceTemp.value / refTeq(refFlux(1, a), 0.3)).toBeCloseTo(1, 4);
    }
  });

  it('greenhouse = 1 → T_s = 2^¼ · T_eq (the model maximum)', () => {
    const o = run(1, { greenhouse: 1 });
    expect(o.surfaceTemp.value / o.equilibriumTemp.value).toBeCloseTo(2 ** 0.25, 12);
    expect(o.epsilon.value).toBe(1);
  });
});

describe('albedo limits', () => {
  it('A = 0: black-body Earth T_eq ≈ 278.3 K (literature ~278–279 K)', () => {
    const o = run(1, { albedo: 0 });
    expect(o.equilibriumTemp.value).toBeCloseTo(refTeq(REF.TSI_KoppLean2011, 0) , 0);
    expect(o.equilibriumTemp.value).toBeGreaterThan(278);
    expect(o.equilibriumTemp.value).toBeLessThan(279);
  });

  it('A = 0.999999: T_eq → ~9 K, finite, ice', () => {
    const o = run(1, { albedo: 0.999999 });
    expectAllFiniteOrNull(o, 'A≈1');
    expect(o.equilibriumTemp.value).toBeCloseTo(refTeq(refFlux(1, 1), 0.999999), 6);
    expect(o.waterPhase.value).toBe('ice');
  });

  // FIXED BUG (found by Agent 9; fixed by owners, Sept 2026 — waterPhase and classifyHabitability now accept 0 K).
  // Original report — BUG (Agent 8 pipeline / Agent 4 water.ts / Agent 5 habitability.ts): albedo = 1 is a VALID input
  // (AGENTS.md rule 9 only rejects albedo OUTSIDE [0, 1]; simulate()'s docs promise RangeError only for
  // invalid input), and equilibriumTemperature correctly returns 0 K. But simulate() then throws
  // "waterPhase: surfaceTemp_K must be a finite number > 0 K (got 0)" (and classifyHabitability would
  // throw on T ≤ 0 too). Repro: simulate({star: G, planet: hypotheticalPlanet(1),
  // atmosphere: {surfacePressure_bar: 1, greenhouse: EARTH_GREENHOUSE, albedo: 1}, mode: 'hypothetical',
  // modifiedFields: []}). Expected: T = 0 K, water 'ice', Uninhabitable — no throw.
  it('A = 1: T_eq = 0 K, no throw (ice, Uninhabitable) [regression test for fixed bug]', () => {
    const o = run(1, { albedo: 1 });
    expect(o.equilibriumTemp.value).toBe(0);
    expect(o.waterPhase.value).toBe('ice');
    expect(o.habitability.status).toBe('Uninhabitable');
  });
});

describe('extreme stars', () => {
  it('O5V at 1 AU: finite, S = L/L☉, vapor, Uninhabitable, HZ fit clamped', () => {
    const o = run(1, {}, 'O');
    expectAllFiniteOrNull(o, 'O');
    expect(o.insolation.value / (STAR_PRESETS.O.luminosity_Lsun as number)).toBeCloseTo(1, 9);
    expect(o.waterPhase.value).toBe('vapor');
    expect(o.habitability.status).toBe('Uninhabitable');
    expect(o.habitability.checks.find((c) => c.id === 'irradiation')!.reason).toMatch(/outside the range/);
  });

  it('O5V at its Earth-equivalent distance (√L ≈ 589 AU): Earth-like temperature, period ≈ 2170 yr', () => {
    const L = STAR_PRESETS.O.luminosity_Lsun as number;
    const a = Math.sqrt(L);
    const o = run(a, {}, 'O');
    expect(o.insolation.value).toBeCloseTo(1, 9);
    expect(o.surfaceTemp.value).toBeCloseTo(288, 0);
    const P_yr = o.orbit.period.value / REF.day_s / REF.julianYear_d;
    expect(P_yr / Math.sqrt(a ** 3 / STAR_PRESETS.O.mass_Msun)).toBeCloseTo(1, 4);
  });

  it('white dwarf: Earth-equivalent distance ≈ 0.0375 AU, finite, liquid, tidally locked', () => {
    const L = STAR_PRESETS.WD.luminosity_Lsun as number;
    const a = Math.sqrt(L);
    const o = run(a, {}, 'WD');
    expectAllFiniteOrNull(o, 'WD');
    expect(o.insolation.value).toBeCloseTo(1, 9);
    expect(o.surfaceTemp.value).toBeCloseTo(288, 0);
    expect(o.waterPhase.value).toBe('liquid');
    expect(o.tides.locking.value).toBe('likely');
    // P = √(a³/M) yr ≈ 0.0375^1.5/√0.6 yr ≈ 3.4 d
    const P_d = o.orbit.period.value / REF.day_s;
    expect(P_d).toBeGreaterThan(3);
    expect(P_d).toBeLessThan(4);
  });
});

describe('pressure limits', () => {
  it('pressure just below the triple point (0.006 bar): no liquid at an Earth-like 288 K, Uninhabitable', () => {
    const o = run(1, { surfacePressure_bar: 0.006 });
    expect(o.surfaceTemp.value).toBeCloseTo(288, 0);
    expect(o.waterPhase.value).toBe('no-liquid-below-triple-point');
    expect(o.habitability.status).toBe('Uninhabitable');
  });

  it('pressure exactly 0 (vacuum): no liquid', () => {
    expect(run(1, { surfacePressure_bar: 0 }).waterPhase.value).toBe('no-liquid-below-triple-point');
  });

  it('pressure at/above the triple point (0.00612 bar): liquid allowed at 288 K', () => {
    expect(run(1, { surfacePressure_bar: 0.00612 }).waterPhase.value).toBe('liquid');
  });

  it('KNOWN LIMITATION: fixed 373.15 K boiling threshold ignores pressure', () => {
    // IAPWS saturation temperature at 100 bar ≈ 584 K, so water at ~400 K and 100 bar is LIQUID.
    // At 0.01 bar the saturation temperature is ≈ 280 K, so water at ~300 K would BOIL.
    const hot = run(0.6, { surfacePressure_bar: 100, greenhouse: 1 });
    expect(hot.surfaceTemp.value).toBeGreaterThan(373.15);
    expect(hot.surfaceTemp.value).toBeLessThan(584);
    expect(hot.waterPhase.value).toBe('vapor'); // real phase diagram: liquid
    const thin = run(0.9, { surfacePressure_bar: 0.01 });
    expect(thin.surfaceTemp.value).toBeGreaterThan(290);
    expect(thin.waterPhase.value).toBe('liquid'); // real phase diagram: vapor (boils above ~280 K)
    // …and the model does say its threshold is uncertain away from 1 bar:
    expect(hot.waterPhase.assumptions.join(' ')).toMatch(/far from ~1 bar/);
  });

  it('KNOWN LIMITATION: surface pressure does not affect surface temperature', () => {
    const t = [0.01, 1, 92].map((p) => run(1, { surfacePressure_bar: p }).surfaceTemp.value);
    expect(t[0]).toBe(t[1]);
    expect(t[2]).toBe(t[1]);
  });
});

describe('unknown mass / radius (missing data)', () => {
  it('mass and radius unknown: no throw; gravity, stellar tide null; locking unknown; confidence low', () => {
    const o = run(1, {}, 'G', { mass_Mearth: null, radius_Rearth: null, moon: { kind: 'unknown' } });
    expectAllFiniteOrNull(o, 'unknown M,R');
    expect(o.surfaceGravity.value).toBeNull();
    expect(o.tides.stellarAcceleration.value).toBeNull();
    expect(o.tides.stellarRelativeToEarth.value).toBeNull();
    expect(o.tides.moon.value).toBeNull();
    expect(o.tides.locking.value).toBe('unknown');
    expect(o.habitability.confidence).toBe('low');
    // Period falls back to the test-particle limit (stellar mass only).
    expect(o.orbit.period.value / REF.day_s / (2 * Math.PI * Math.sqrt(AU ** 3 / REF.GM_sun) / REF.day_s)).toBeCloseTo(1, 5);
  });

  it('only radius unknown: gravity null, tides null, a custom moon tide is null (not guessed)', () => {
    const o = run(1, {}, 'G', {
      radius_Rearth: null,
      moon: { kind: 'custom', mass_kg: 7.346e22, distance_m: 3.844e8, label: 'Moon' },
    });
    expect(o.surfaceGravity.value).toBeNull();
    expect(o.tides.moon.value).toBeNull();
  });

  it('only mass unknown: gravity null but stellar tide still computed (depends on R only)', () => {
    const o = run(1, {}, 'G', { mass_Mearth: null });
    expect(o.surfaceGravity.value).toBeNull();
    expect(o.tides.stellarRelativeToEarth.value).toBeCloseTo(1, 9);
  });
});

describe('invalid inputs throw RangeError (AGENTS.md rule 9)', () => {
  const cases: Array<[string, () => unknown]> = [
    ['e = 1', () => run(1, {}, 'G', { ecc: 1 })],
    ['e < 0', () => run(1, {}, 'G', { ecc: -0.1 })],
    ['a = 0', () => run(0)],
    ['a < 0', () => run(-1)],
    ['albedo > 1', () => run(1, { albedo: 1.1 })],
    ['albedo < 0', () => run(1, { albedo: -0.1 })],
    ['greenhouse > 1', () => run(1, { greenhouse: 1.1 })],
    ['pressure < 0', () => run(1, { surfacePressure_bar: -1 })],
    ['a = NaN', () => run(Number.NaN)],
  ];
  for (const [name, fn] of cases) {
    it(name, () => expect(fn).toThrow(RangeError));
  }
});

describe('property sweeps over (star, a, P, greenhouse)', () => {
  const A_GRID = [0.003, 0.02, 0.1, 0.4, 0.8, 1, 1.3, 2, 5, 30, 300];
  const P_GRID = [0, 0.005, 0.1, 1, 10, 100];
  const GH_GRID = [0, 0.25, 0.5, EARTH_GREENHOUSE, 1];

  it('every numeric output is finite or explicitly null; phase/status are valid enums', () => {
    let n = 0;
    for (const t of STAR_TYPES) {
      for (const a of A_GRID) {
        for (const P of P_GRID) {
          for (const gh of GH_GRID) {
            const o = run(a, { surfacePressure_bar: P, greenhouse: gh }, t, {}, 24);
            expectAllFiniteOrNull(o, `${t} a=${a} P=${P} gh=${gh}`);
            expect(['ice', 'liquid', 'vapor', 'no-liquid-below-triple-point']).toContain(o.waterPhase.value);
            expect(['Uninhabitable', 'Marginally Habitable', 'Highly Habitable']).toContain(o.habitability.status);
            expect(o.habitability.disclaimer).toMatch(/not evidence/);
            n++;
          }
        }
      }
    }
    expect(n).toBe(STAR_TYPES.length * A_GRID.length * P_GRID.length * GH_GRID.length);
  }, 120_000);

  it('flux ∝ 1/a² and T_s ∝ a^(−½) exactly; T_s strictly decreases with a', () => {
    for (const t of STAR_TYPES as readonly StarType[]) {
      const ref = run(1, {}, t);
      let prevT = Infinity;
      for (const a of A_GRID) {
        const o = run(a, {}, t);
        expect(o.stellarFlux.value * a * a / ref.stellarFlux.value).toBeCloseTo(1, 10);
        expect(o.surfaceTemp.value * Math.sqrt(a) / ref.surfaceTemp.value).toBeCloseTo(1, 10);
        expect(o.surfaceTemp.value).toBeLessThan(prevT);
        prevT = o.surfaceTemp.value;
      }
    }
  });

  it('T_s strictly increases with greenhouse; T_eq unaffected', () => {
    for (const t of STAR_TYPES) {
      for (const a of [0.1, 1, 10]) {
        let prev = -Infinity;
        const teq = run(a, { greenhouse: 0 }, t).equilibriumTemp.value;
        for (const gh of [0, 0.1, 0.3, 0.5, 0.7, EARTH_GREENHOUSE, 0.9, 1]) {
          const o = run(a, { greenhouse: gh }, t);
          expect(o.surfaceTemp.value).toBeGreaterThan(prev);
          expect(o.equilibriumTemp.value).toBe(teq);
          prev = o.surfaceTemp.value;
        }
      }
    }
  });

  it('T_s decreases with albedo', () => {
    let prev = Infinity;
    for (const A of [0, 0.1, 0.3, 0.5, 0.77, 0.9, 0.99]) {
      const T = run(1, { albedo: A }).surfaceTemp.value;
      expect(T).toBeLessThan(prev);
      prev = T;
    }
  });

  it('stellar tide ∝ M★/a³', () => {
    for (const t of STAR_TYPES) {
      const o1 = run(1, {}, t);
      const o2 = run(2, {}, t);
      const r = (o1.tides.stellarRelativeToEarth.value as number) / (o2.tides.stellarRelativeToEarth.value as number);
      expect(r).toBeCloseTo(8, 9);
      expect(o1.tides.stellarRelativeToEarth.value as number).toBeCloseTo(STAR_PRESETS[t].mass_Msun, 6);
    }
  });
});
