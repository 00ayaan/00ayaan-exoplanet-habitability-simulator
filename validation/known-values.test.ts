/**
 * Known-value validation — Agent 9 (independent).
 *
 * Every expected number below comes from validation/reference.ts (independent constants +
 * first-principles formulas) or directly from a published value, never from src/physics.
 * The model is exercised only through its public API (simulate, physics exports).
 */
import { describe, expect, it } from 'vitest';
import { run } from './helpers';
import { REF, pctDiff, refFlux, refOneLayerTs, refPeriod_d, refTeq, refTide } from './reference';
import { EARTH_GREENHOUSE } from '../src/physics/atmosphere';
import { STAR_PRESETS } from '../src/physics/starPresets';
import type { Star } from '../src/physics/types';

/** |model/reference − 1| ≤ tol. */
function expectRel(model: number | null, reference: number, tol: number): void {
  expect(model).not.toBeNull();
  const d = Math.abs((model as number) / reference - 1);
  expect(d, `model ${model} vs reference ${reference} (rel diff ${d})`).toBeLessThanOrEqual(tol);
}

describe('Earth around the Sun (G preset, 1 AU, A = 0.30)', () => {
  const earth = run(1);

  it('solar constant ≈ 1361 W m^-2 (Kopp & Lean 2011: 1360.8 ± 0.5)', () => {
    // Model S⊕ is derived from IAU nominal L☉ / (4π AU²) — must land within the TSI uncertainty band ×2.
    expect(Math.abs(earth.stellarFlux.value - REF.TSI_KoppLean2011)).toBeLessThan(1.0);
    expectRel(earth.stellarFlux.value, refFlux(1, 1), 1e-9);
    expectRel(earth.insolation.value, 1, 1e-9);
  });

  it('equilibrium temperature ≈ 255 K at A = 0.30', () => {
    // Hand calc: [1361 × 0.7 / (4 × 5.670374e-8)]^¼ = 254.6 K. Textbook value "255 K".
    expect(earth.equilibriumTemp.value).toBeGreaterThan(254);
    expect(earth.equilibriumTemp.value).toBeLessThan(256);
    expectRel(earth.equilibriumTemp.value, refTeq(REF.TSI_KoppLean2011, 0.3), 1e-3);
  });

  it('T_eq with NASA Bond albedo 0.294 is within 1.5 K of the NASA fact-sheet black-body temperature 254.0 K', () => {
    // Independent hand calc with A = 0.294: 255.1 K. NASA's 254.0 K reproduces with A ≈ 0.306 (older
    // albedo); the 1.1 K gap is a reference-data inconsistency on the fact sheet, not a model error.
    const o = run(1, { albedo: 0.294 });
    expect(o.equilibriumTemp.value).toBeCloseTo(refTeq(refFlux(1, 1), 0.294), 6);
    expect(Math.abs(o.equilibriumTemp.value - 254.0)).toBeLessThan(1.5);
  });

  it('orbital period = 1 sidereal year (365.256 d) at 1 AU / 1 M☉', () => {
    const P_d = earth.orbit.period.value / REF.day_s;
    // Julian year 365.25 d and sidereal year 365.256 d; model includes Earth mass.
    expect(Math.abs(P_d - REF.julianYear_d)).toBeLessThan(0.02);
    expect(Math.abs(P_d - REF.siderealYear_d)).toBeLessThan(0.01);
    expectRel(P_d, refPeriod_d(1, 1, REF.GM_earth), 1e-5);
  });

  it('surface gravity ≈ 9.80 m s^-2', () => {
    // GM⊕ / R⊕,eq² = 3.986004e14 / 6.3781e6² = 9.798 m s^-2 (no rotation term).
    expectRel(earth.surfaceGravity.value, REF.GM_earth / REF.R_earth_eq_m ** 2, 1e-4);
    expect(Math.abs((earth.surfaceGravity.value as number) - REF.standardGravity)).toBeLessThan(0.02);
    // NASA mean 9.82 uses the volumetric-mean radius 6371 km; equatorial radius gives ~0.2 % less.
    expect(Math.abs(pctDiff(earth.surfaceGravity.value as number, REF.nasaEarthMeanGravity))).toBeLessThan(0.5);
  });

  it('surface temperature = 288 K with the Earth greenhouse setting', () => {
    expect(Math.abs(earth.surfaceTemp.value - 288)).toBeLessThan(0.5);
    // Independent check of the calibration: one-layer ε that turns 254.6 K into 288 K is ≈ 0.78.
    const teq = refTeq(refFlux(1, 1), 0.3);
    const epsNeeded = 2 * (1 - (teq / 288) ** 4);
    expect(EARTH_GREENHOUSE).toBeCloseTo(epsNeeded, 3);
    expect(EARTH_GREENHOUSE).toBeGreaterThan(0.75);
    expect(EARTH_GREENHOUSE).toBeLessThan(0.8);
    expectRel(earth.surfaceTemp.value, refOneLayerTs(teq, EARTH_GREENHOUSE), 1e-9);
  });

  it('water is liquid, stellar tide is exactly Earth’s own, rotation not tidally locked', () => {
    expect(earth.waterPhase.value).toBe('liquid');
    expectRel(earth.tides.stellarRelativeToEarth.value, 1, 1e-9);
    expect(earth.tides.locking.value).not.toBe('likely');
  });

  it('Earth is classified Highly Habitable (confidence medium: atmosphere assumed)', () => {
    expect(earth.habitability.status).toBe('Highly Habitable');
    expect(earth.habitability.confidence).toBe('medium');
    expect(earth.habitability.checks.every((c) => c.passed === true)).toBe(true);
  });
});

describe('tides on Earth', () => {
  const sunTide = refTide(REF.GM_sun, REF.R_earth_eq_m, REF.AU_m); // ≈ 5.06e-7
  const moonTideRef = refTide(REF.GM_moon, REF.R_earth_eq_m, REF.moonDistance_m); // ≈ 1.10e-6

  it('Sun’s tide on Earth ≈ 5.05e-7 m s^-2', () => {
    const o = run(1);
    expectRel(o.tides.stellarAcceleration.value, sunTide, 1e-4);
    expect(sunTide).toBeGreaterThan(5.0e-7);
    expect(sunTide).toBeLessThan(5.1e-7);
  });

  it('Moon’s tide on Earth ≈ 1.1e-6 m s^-2 and Sun/Moon ≈ 0.46', () => {
    const o = run(1, {}, 'G', {
      moon: { kind: 'custom', mass_kg: REF.GM_moon / REF.G, distance_m: REF.moonDistance_m, label: 'Moon' },
    });
    const m = o.tides.moon.value as number;
    expectRel(m, moonTideRef, 1e-3);
    expect(m).toBeGreaterThan(1.05e-6);
    expect(m).toBeLessThan(1.15e-6);
    const ratio = (o.tides.stellarAcceleration.value as number) / m;
    // Classical value 0.46 (e.g. NOAA "Tides and Water Levels"; NASA Moon fact sheet).
    expect(ratio).toBeGreaterThan(0.44);
    expect(ratio).toBeLessThan(0.47);
  });
});

describe('star presets are consistent with Stefan–Boltzmann (L = R² (T/T☉)⁴)', () => {
  for (const [type, s] of Object.entries(STAR_PRESETS) as Array<[string, Star]>) {
    it(`${type}: tabulated L within 5 % of R²(T/T☉)⁴`, () => {
      const lSB = s.radius_Rsun ** 2 * (s.teff_K / REF.T_sun_K) ** 4;
      expect(s.luminosity_Lsun).not.toBeNull();
      expectRel(s.luminosity_Lsun as number, lSB, 0.05);
    });
  }

  it('luminosity computed from R and Teff when the catalog value is missing (Sun → 3.828e26 W)', () => {
    const o = run(1, {}, { ...STAR_PRESETS.G, luminosity_Lsun: null });
    expectRel(o.star.luminosity.value, 4 * Math.PI * REF.R_sun_m ** 2 * REF.sigma * REF.T_sun_K ** 4, 1e-9);
    expectRel(o.star.luminosity.value, REF.L_sun_W, 1e-4);
  });
});

describe('Kepler III sanity across other stars', () => {
  it('M-dwarf preset, 0.1 AU: period matches √(a³/M)', () => {
    const o = run(0.1, {}, 'M', { mass_Mearth: null });
    const P_yr = Math.sqrt(0.1 ** 3 / STAR_PRESETS.M.mass_Msun);
    // Test particle (mass unknown): only the stellar mass. Year = 2π√(AU³/GM☉).
    expectRel(o.orbit.period.value / REF.day_s, P_yr * refPeriod_d(1, 1), 1e-9);
  });

  it('Jupiter-distance around the Sun: ≈ 11.86 yr at 5.2026 AU', () => {
    const o = run(5.2026, {}, 'G', { mass_Mearth: null });
    const P_yr = o.orbit.period.value / REF.day_s / REF.julianYear_d;
    expect(Math.abs(P_yr - 11.862)).toBeLessThan(0.02); // NASA Jupiter fact sheet 4332.589 d (Jupiter mass omitted here)
  });
});
