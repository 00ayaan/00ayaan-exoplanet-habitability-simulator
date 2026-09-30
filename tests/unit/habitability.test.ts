import { describe, expect, it } from 'vitest';
import {
  classifyHabitability,
  combineChecks,
  DEFAULT_THRESHOLDS,
  habitableZoneLimits,
  type HabitabilityInputs,
} from '../../src/physics/habitability';
import thresholdsJson from '../../src/physics/thresholds.json';
import type { CheckId, HabitabilityCheck } from '../../src/physics/types';

const earth: HabitabilityInputs = {
  surfaceTemp_K: 288,
  waterPhase: 'liquid',
  surfacePressure_bar: 1,
  insolation_Searth: 1,
  starTeff_K: 5772,
  tidalLocking: 'unlikely',
  stellarTideRelEarth: 1,
  atmosphereAssumed: true,
  missing: [],
};

const check = (r: ReturnType<typeof classifyHabitability>, id: CheckId): HabitabilityCheck => {
  const c = r.checks.find((x) => x.id === id);
  if (!c) throw new Error(`missing check ${id}`);
  return c;
};

describe('classifyHabitability — reference planets', () => {
  it('Earth-like → Highly Habitable, all checks pass, confidence medium (atmosphere assumed)', () => {
    const r = classifyHabitability(earth);
    expect(r.status).toBe('Highly Habitable');
    expect(r.checks).toHaveLength(5);
    expect(r.checks.every((c) => c.passed === true)).toBe(true);
    expect(r.confidence).toBe('medium');
    expect(r.confidenceReasons.join(' ')).toMatch(/user-assumed/);
    expect(r.disclaimer).toMatch(/not evidence that this planet contains life/);
    expect(check(r, 'temperature').observed).toBe('288 K (15 °C)');
    expect(check(r, 'temperature').target).toBe('273–323 K (0–50 °C)');
    expect(check(r, 'pressure').observed).toBe('1 bar');
    expect(check(r, 'irradiation').observed).toBe('1.00 S⊕');
    expect(r.checks.map((c) => c.weight)).toEqual(['critical', 'critical', 'supporting', 'supporting', 'supporting']);
  });

  it('Earth-like with measured atmosphere → high confidence', () => {
    const r = classifyHabitability({ ...earth, atmosphereAssumed: false });
    expect(r.confidence).toBe('high');
  });

  it('Venus-like → Uninhabitable', () => {
    const r = classifyHabitability({
      ...earth,
      surfaceTemp_K: 737,
      waterPhase: 'vapor',
      surfacePressure_bar: 92,
      insolation_Searth: 1.91,
      tidalLocking: 'unlikely',
    });
    expect(r.status).toBe('Uninhabitable');
    expect(check(r, 'temperature').passed).toBe(false);
    expect(check(r, 'liquidWater').passed).toBe(false);
    expect(check(r, 'pressure').passed).toBe(false);
    expect(check(r, 'irradiation').passed).toBe(false);
    expect(r.disclaimer).toMatch(/^Uninhabitable according to this simplified model/);
  });

  it('Mars-like (below triple point) → Uninhabitable', () => {
    const r = classifyHabitability({
      ...earth,
      surfaceTemp_K: 210,
      waterPhase: 'no-liquid-below-triple-point',
      surfacePressure_bar: 0.006,
      insolation_Searth: 0.43,
    });
    expect(r.status).toBe('Uninhabitable');
    expect(check(r, 'liquidWater').reason).toMatch(/pressure is too low/);
    expect(check(r, 'irradiation').passed).toBe(true); // Mars is inside the optimistic HZ
  });

  it('below-triple-point alone forces Uninhabitable even at a mild temperature', () => {
    const r = classifyHabitability({ ...earth, surfaceTemp_K: 290, waterPhase: 'no-liquid-below-triple-point', surfacePressure_bar: 0.005 });
    expect(r.status).toBe('Uninhabitable');
  });

  it('cold-but-within-extended (ice at 265 K) → Marginally Habitable', () => {
    const r = classifyHabitability({ ...earth, surfaceTemp_K: 265, waterPhase: 'ice', insolation_Searth: 0.8 });
    expect(r.status).toBe('Marginally Habitable');
    expect(check(r, 'temperature').passed).toBe(false);
    expect(check(r, 'temperature').reason).toMatch(/below freezing/);
    expect(check(r, 'liquidWater').passed).toBe(false);
  });

  it('warm liquid (330 K) → Marginal (temperature fails, water liquid)', () => {
    const r = classifyHabitability({ ...earth, surfaceTemp_K: 330 });
    expect(r.status).toBe('Marginally Habitable');
    expect(check(r, 'liquidWater').passed).toBe(true);
  });

  it('very cold ice (230 K, outside extended) → Uninhabitable', () => {
    const r = classifyHabitability({ ...earth, surfaceTemp_K: 230, waterPhase: 'ice', insolation_Searth: 0.5 });
    expect(r.status).toBe('Uninhabitable');
  });

  it('tidally locked M-dwarf planet with good conditions → Marginal, tidal fails, mentions heat transport', () => {
    const r = classifyHabitability({ ...earth, starTeff_K: 3300, insolation_Searth: 0.7, tidalLocking: 'likely', stellarTideRelEarth: 500 });
    expect(r.status).toBe('Marginally Habitable');
    const t = check(r, 'tidal');
    expect(t.passed).toBe(false);
    expect(t.reason).toMatch(/not a death sentence/);
    expect(t.reason).toMatch(/carry heat/);
    expect(check(r, 'irradiation').passed).toBe(true);
  });

  it('extreme stellar tide fails the tidal check even when locking is unlikely', () => {
    const r = classifyHabitability({ ...earth, stellarTideRelEarth: 2e4 });
    expect(check(r, 'tidal').passed).toBe(false);
    expect(check(r, 'tidal').reason).toMatch(/extreme/);
    expect(r.status).toBe('Marginally Habitable');
  });

  it('possible locking passes', () => {
    expect(check(classifyHabitability({ ...earth, tidalLocking: 'possible' }), 'tidal').passed).toBe(true);
  });

  it('unknown locking → tidal passed null; still Highly Habitable (supporting only) but confidence not high', () => {
    const r = classifyHabitability({ ...earth, tidalLocking: 'unknown', stellarTideRelEarth: null, atmosphereAssumed: false });
    expect(check(r, 'tidal').passed).toBeNull();
    expect(r.status).toBe('Highly Habitable');
    expect(r.confidence).toBe('medium');
  });

  it('a null critical check prevents Highly Habitable and gives low confidence', () => {
    const base = classifyHabitability(earth);
    const checks = base.checks.map((c) => (c.id === 'liquidWater' ? { ...c, passed: null } : c));
    const r = combineChecks(checks, {
      tempOutsideExtended: false,
      belowTriplePoint: false,
      atmosphereAssumed: true,
      teffClamped: false,
      missing: [],
    });
    expect(r.status).toBe('Marginally Habitable');
    expect(r.confidence).toBe('low');
  });

  it('missing mass/radius/eccentricity fields → low confidence; other missing fields do not', () => {
    expect(classifyHabitability({ ...earth, missing: ['pl_masse'] }).confidence).toBe('low');
    expect(classifyHabitability({ ...earth, missing: ['pl_orbeccen'] }).confidence).toBe('low');
    expect(classifyHabitability({ ...earth, missing: ['st_age', 'st_spectype'] }).confidence).toBe('medium');
  });
});

describe('habitableZoneLimits (Kopparapu et al. 2014)', () => {
  it('reproduces Table 1 values at Teff = 5780 K', () => {
    const hz = habitableZoneLimits(5780).value;
    expect(hz.recentVenus).toBeCloseTo(1.776, 2);
    expect(hz.runawayGreenhouse).toBeCloseTo(1.107, 2);
    expect(hz.maximumGreenhouse).toBeCloseTo(0.356, 2);
    expect(hz.earlyMars).toBeCloseTo(0.32, 2);
    expect(hz.teffClamped).toBe(false);
  });

  it('M-dwarf limits are lower than the Sun’s', () => {
    const sun = habitableZoneLimits(5780).value;
    const m = habitableZoneLimits(3300).value;
    expect(m.recentVenus).toBeLessThan(sun.recentVenus);
    expect(m.runawayGreenhouse).toBeLessThan(sun.runawayGreenhouse);
    expect(m.earlyMars).toBeLessThan(sun.earlyMars);
    expect(m.maximumGreenhouse).toBeLessThan(sun.maximumGreenhouse);
  });

  it('clamps Teff outside 2600–7200 K', () => {
    const hot = habitableZoneLimits(9000).value;
    expect(hot.teffClamped).toBe(true);
    expect(hot.teffUsed_K).toBe(7200);
    expect(habitableZoneLimits(2000).value.teffUsed_K).toBe(2600);
  });

  it('Teff clamping lowers confidence and is explained in the reason', () => {
    const r = classifyHabitability({ ...earth, starTeff_K: 2400, insolation_Searth: 0.6, atmosphereAssumed: false });
    expect(r.confidence).toBe('medium');
    expect(check(r, 'irradiation').reason).toMatch(/outside the range/);
    expect(r.confidenceReasons.join(' ')).toMatch(/extrapolated/);
    expect(classifyHabitability({ ...earth, atmosphereAssumed: false }).confidence).toBe('high');
  });
});

describe('thresholds.json', () => {
  it('every numeric entry sits in an object with a source and a valid status', () => {
    const offenders: string[] = [];
    let numericObjects = 0;
    const walk = (node: unknown, path: string): void => {
      if (Array.isArray(node)) return;
      if (node && typeof node === 'object') {
        const obj = node as Record<string, unknown>;
        const hasNumber = Object.values(obj).some((v) => typeof v === 'number');
        if (hasNumber) {
          numericObjects++;
          const ok =
            typeof obj.source === 'string' &&
            obj.source.length > 0 &&
            (obj.status === 'cited' || obj.status === 'needs human verification');
          if (!ok) offenders.push(path);
        }
        for (const [k, v] of Object.entries(obj)) walk(v, `${path}.${k}`);
      }
    };
    walk(thresholdsJson, '$');
    expect(offenders).toEqual([]);
    expect(numericObjects).toBeGreaterThanOrEqual(10);
  });

  it('pressure minimum exceeds water’s triple-point pressure', () => {
    expect(DEFAULT_THRESHOLDS.pressure.preferred.min).toBeGreaterThan(0.00611657);
  });

  it('documents the classification rules', () => {
    expect(DEFAULT_THRESHOLDS.rules.highlyHabitable).toBeTruthy();
    expect(DEFAULT_THRESHOLDS.rules.uninhabitable).toBeTruthy();
    expect(DEFAULT_THRESHOLDS.rules.confidence).toBeTruthy();
  });
});

describe('purity and validation', () => {
  it('is deterministic', () => {
    expect(classifyHabitability(earth)).toEqual(classifyHabitability(earth));
  });

  it.each([
    ['surfaceTemp_K', NaN],
    ['surfaceTemp_K', Infinity],
    ['surfaceTemp_K', 0],
    ['surfacePressure_bar', NaN],
    ['surfacePressure_bar', -1],
    ['insolation_Searth', Infinity],
    ['insolation_Searth', -0.1],
    ['starTeff_K', NaN],
    ['starTeff_K', -5000],
    ['stellarTideRelEarth', NaN],
  ] as const)('throws RangeError for %s = %s', (field, value) => {
    expect(() => classifyHabitability({ ...earth, [field]: value })).toThrow(RangeError);
  });
});
