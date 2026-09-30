/**
 * Solar System comparison — Agent 9 (independent).
 *
 * Venus, Earth and Mars run through the public simulate() API with published Bond albedos and
 * surface pressures, compared with real mean surface temperatures (NASA GSFC Planetary Fact Sheets).
 * Where the simplified model is EXPECTED to fail (DESIGN.md §11, atmosphere.ts header) the test
 * asserts the failure explicitly ("KNOWN LIMITATION") rather than pretending the model matches.
 */
import { describe, expect, it } from 'vitest';
import { run } from './helpers';
import { EARTH, MARS, REF, VENUS, pctDiff, refFlux, refOneLayerTs, refRecentVenusSeff, refTeq } from './reference';
import { EARTH_GREENHOUSE } from '../src/physics/atmosphere';
import { classifyHabitability } from '../src/physics/habitability';
import { STAR_PRESETS } from '../src/physics/starPresets';

describe('Venus (0.723 AU, A = 0.76, 92 bar)', () => {
  const vMax = run(VENUS.a_AU, { albedo: VENUS.bondAlbedo, surfacePressure_bar: 92, greenhouse: 1 });
  const vEarthGH = run(VENUS.a_AU, { albedo: VENUS.bondAlbedo, surfacePressure_bar: 92 });

  it('insolation ≈ 1.911 S⊕ and flux ≈ 2601 W m^-2 (NASA: 2601.3)', () => {
    expect(vMax.insolation.value).toBeCloseTo(1 / VENUS.a_AU ** 2, 9);
    expect(Math.abs(vMax.stellarFlux.value - 2601.3)).toBeLessThan(2);
  });

  it('T_eq with NASA albedo 0.77 matches NASA black-body temperature 226.6 K', () => {
    const o = run(VENUS.a_AU, { albedo: VENUS.nasaBondAlbedo, surfacePressure_bar: 92 });
    expect(Math.abs(o.equilibriumTemp.value - VENUS.nasaBlackBodyTemp_K)).toBeLessThan(1);
    expect(o.equilibriumTemp.value).toBeCloseTo(refTeq(refFlux(1, VENUS.a_AU), 0.77), 6);
  });

  it('KNOWN LIMITATION: surface temperature massively underestimated (one-layer cap 2^¼ · T_eq)', () => {
    // Real: 737 K. Best the model can do is ε = 1: 229 K × 1.189 ≈ 272 K (−63 %).
    const cap = refOneLayerTs(refTeq(refFlux(1, VENUS.a_AU), VENUS.bondAlbedo), 1);
    expect(vMax.surfaceTemp.value).toBeCloseTo(cap, 6);
    expect(vMax.surfaceTemp.value).toBeLessThan(280);
    expect(pctDiff(vMax.surfaceTemp.value, VENUS.meanSurfaceTemp_K)).toBeLessThan(-60);
    // No greenhouse setting can reach even the boiling point, let alone 737 K.
    expect(vMax.surfaceTemp.value).toBeLessThan(373.15);
  });

  // KNOWN LIMITATION, recorded as a failing expectation so it cannot silently be forgotten:
  // the model can never reproduce Venus's 737 K surface. Will start passing only if a thick-atmosphere
  // (multi-layer / pressure-dependent) greenhouse model replaces the one-layer model.
  it.fails('LIMITATION: model Venus surface temperature within 10 % of 737 K', () => {
    expect(Math.abs(pctDiff(vMax.surfaceTemp.value, VENUS.meanSurfaceTemp_K))).toBeLessThan(10);
  });

  it('KNOWN LIMITATION: water phase comes out as ice (reality: no surface liquid; far above boiling)', () => {
    expect(vMax.waterPhase.value).toBe('ice');
    expect(vEarthGH.waterPhase.value).toBe('ice');
  });

  it('the supporting checks do flag Venus: pressure (92 bar) and irradiation (1.91 > 1.77 S⊕) fail', () => {
    const byId = Object.fromEntries(vMax.habitability.checks.map((c) => [c.id, c.passed]));
    expect(byId.pressure).toBe(false);
    expect(byId.irradiation).toBe(false);
    expect(byId.temperature).toBe(false);
    expect(byId.liquidWater).toBe(false);
  });

  // FIXED BUG (found by Agent 9; fixed by Agent 5 with a new Uninhabitable rule, Sept 2026).
  // Original report — BUG (classification — Agent 5, src/physics/habitability.ts rule "uninhabitable" in thresholds.json;
  // root cause compounded by the Agent 3 one-layer limitation above):
  // Venus with its real albedo 0.76 and pressure 92 bar is classified "Marginally Habitable" for any
  // greenhouse ≥ ≈ 0.66 (incl. the Earth default 0.78 and the maximum 1.0), even though BOTH critical
  // checks (temperature, liquid water) AND two supporting checks (pressure, irradiation) fail — 4 of 5.
  // Cause: Uninhabitable requires (liquid fails AND T outside 253–373 K); the model's capped T_s
  // (259–272 K) lands inside the extended range, so the rule falls through to "Marginal". This
  // contradicts DESIGN.md §19 ("Marginal: some potentially favorable conditions exist").
  // Repro: simulate({star: STAR_PRESETS.G, planet: hypotheticalPlanet(0.7233),
  //   atmosphere: {albedo: 0.76, surfacePressure_bar: 92, greenhouse: 1}, mode: 'hypothetical',
  //   modifiedFields: []}).habitability.status === 'Marginally Habitable'. Expected: 'Uninhabitable'.
  // Only greenhouse < ≈ 0.66 (T_s < 253 K) gives Uninhabitable.
  it('Venus (A 0.76, 92 bar, greenhouse 1.0) → Uninhabitable [regression test for fixed bug]', () => {
    expect(vMax.habitability.status).toBe('Uninhabitable');
  });
  it('Venus (A 0.76, 92 bar, Earth greenhouse) → Uninhabitable [regression test for fixed bug]', () => {
    expect(vEarthGH.habitability.status).toBe('Uninhabitable');
  });

  it('greenhouse 0: Venus is Uninhabitable (T_s = T_eq ≈ 229 K, below the 253 K extended floor)', () => {
    const o = run(VENUS.a_AU, { albedo: VENUS.bondAlbedo, surfacePressure_bar: 92, greenhouse: 0 });
    expect(o.surfaceTemp.value).toBeLessThan(253.15);
    expect(o.habitability.status).toBe('Uninhabitable');
  });

  it('classifier itself IS correct given Venus’s real conditions (737 K, vapor, 92 bar, 1.91 S⊕)', () => {
    const h = classifyHabitability({
      surfaceTemp_K: 737,
      waterPhase: 'vapor',
      surfacePressure_bar: 92,
      insolation_Searth: 1 / VENUS.a_AU ** 2,
      starTeff_K: 5772,
      tidalLocking: 'unlikely',
      stellarTideRelEarth: 1 / VENUS.a_AU ** 3,
      atmosphereAssumed: false,
      missing: [],
    });
    expect(h.status).toBe('Uninhabitable');
  });
});

describe('Earth (1 AU, A = 0.30, 1 bar, Earth greenhouse)', () => {
  const e = run(1);
  it('surface temperature 288 K (calibrated) and Highly Habitable', () => {
    expect(Math.abs(e.surfaceTemp.value - EARTH.meanSurfaceTemp_K)).toBeLessThan(0.5);
    expect(e.habitability.status).toBe('Highly Habitable');
    expect(e.waterPhase.value).toBe('liquid');
  });

  it('NOTE: the 288 K is a calibration target, not a prediction (EARTH_GREENHOUSE is fitted to it)', () => {
    // Independent re-derivation of the fitted ε from Teq and 288 K:
    const teq = refTeq(refFlux(1, 1), 0.3);
    expect(EARTH_GREENHOUSE).toBeCloseTo(2 * (1 - (teq / 288) ** 4), 9);
  });
});

describe('Mars (1.524 AU, A = 0.25, 0.006 bar)', () => {
  const mNoGH = run(MARS.a_AU, { albedo: MARS.bondAlbedo, surfacePressure_bar: MARS.surfacePressure_bar, greenhouse: 0 });
  const mEarthGH = run(MARS.a_AU, { albedo: MARS.bondAlbedo, surfacePressure_bar: MARS.surfacePressure_bar });

  it('flux ≈ 586 W m^-2 (NASA 586.2) and T_eq ≈ 209.8 K (NASA black-body)', () => {
    expect(Math.abs(mNoGH.stellarFlux.value - 586.2)).toBeLessThan(1);
    expect(Math.abs(mNoGH.equilibriumTemp.value - MARS.nasaBlackBodyTemp_K)).toBeLessThan(0.5);
  });

  it('with a near-zero greenhouse (thin CO₂, real warming only ~5 K) T_s ≈ 210 K matches the real mean', () => {
    expect(Math.abs(pctDiff(mNoGH.surfaceTemp.value, MARS.meanSurfaceTemp_K))).toBeLessThan(3);
    expect(Math.abs(mNoGH.surfaceTemp.value - 214)).toBeLessThan(5); // current NASA sheet ~214 K
  });

  it('KNOWN LIMITATION: the default Earth greenhouse over-warms Mars by ~27 K (greenhouse not tied to pressure)', () => {
    expect(mEarthGH.surfaceTemp.value).toBeGreaterThan(230);
    expect(pctDiff(mEarthGH.surfaceTemp.value, MARS.meanSurfaceTemp_K)).toBeGreaterThan(10);
  });

  it('0.006 bar is below water’s triple point (0.00612 bar): no liquid; classified Uninhabitable', () => {
    expect(MARS.surfacePressure_bar).toBeLessThan(REF.waterTriplePoint_bar);
    for (const o of [mNoGH, mEarthGH]) {
      expect(o.waterPhase.value).toBe('no-liquid-below-triple-point');
      expect(o.habitability.status).toBe('Uninhabitable');
    }
  });

  it('Mars at the NASA mean 6.36 mbar (just ABOVE the triple point) is ice at 210 K — still Uninhabitable', () => {
    const o = run(MARS.a_AU, { albedo: MARS.bondAlbedo, surfacePressure_bar: 0.00636, greenhouse: 0 });
    expect(o.waterPhase.value).toBe('ice');
    expect(o.habitability.status).toBe('Uninhabitable');
  });

  it('Mars is inside the Sun’s optimistic HZ (0.43 S⊕ ≥ Early-Mars 0.32) — irradiation passes', () => {
    expect(mNoGH.insolation.value).toBeCloseTo(1 / MARS.a_AU ** 2, 9);
    expect(mNoGH.habitability.checks.find((c) => c.id === 'irradiation')!.passed).toBe(true);
  });
});

describe('habitable-zone inner edge (Kopparapu 2014 Recent Venus, S_eff⊙ = 1.776)', () => {
  const teff = STAR_PRESETS.G.teff_K; // 5772 K (IAU nominal) — 8 K below the fit's 5780 K pivot
  const sLimit = refRecentVenusSeff(teff); // ≈ 1.7743

  it('the limit for the 5772 K Sun is ≈ 1.774 S⊕ (1.776 is for 5780 K)', () => {
    expect(sLimit).toBeCloseTo(1.7743, 4);
    expect(refRecentVenusSeff(5780)).toBe(1.776);
  });

  it('just inside the edge irradiation passes, just outside it fails', () => {
    const inside = run(1 / Math.sqrt(sLimit * 0.999));
    const outside = run(1 / Math.sqrt(sLimit * 1.001));
    expect(inside.habitability.checks.find((c) => c.id === 'irradiation')!.passed).toBe(true);
    expect(outside.habitability.checks.find((c) => c.id === 'irradiation')!.passed).toBe(false);
  });

  it('at S = 1.776 exactly (a = 0.7504 AU) the Sun preset is JUST outside (because Teff = 5772 K)', () => {
    const o = run(1 / Math.sqrt(1.776));
    expect(o.insolation.value).toBeCloseTo(1.776, 9);
    expect(o.habitability.checks.find((c) => c.id === 'irradiation')!.passed).toBe(false);
  });

  it('at the inner edge with the Earth greenhouse, T_s ≈ 332 K > 323 K preferred max → Marginally Habitable', () => {
    const o = run(1 / Math.sqrt(sLimit * 0.999));
    expect(o.surfaceTemp.value).toBeCloseTo(288 * (sLimit * 0.999) ** 0.25, 0);
    expect(o.waterPhase.value).toBe('liquid');
    expect(o.habitability.status).toBe('Marginally Habitable');
  });
});
