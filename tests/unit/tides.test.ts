// Owner: Agent 4. Unit tests for src/physics/tides.ts.
import { describe, expect, it } from 'vitest';
import {
  moonTide, stellarTideRelativeToEarth, tidalAcceleration, tidalLockingIndicator,
} from '../../src/physics/tides';
import {
  AU, DAY, EARTH_MOON_DISTANCE, M_EARTH, M_MOON, M_SUN, R_EARTH, YEAR,
} from '../../src/physics/constants';

const moonOnEarth = () => tidalAcceleration(M_MOON, R_EARTH, EARTH_MOON_DISTANCE).value;
const sunOnEarth = () => tidalAcceleration(M_SUN, R_EARTH, AU).value;

describe('tidalAcceleration', () => {
  it("Moon's tide on Earth ≈ 1.1e-6 m/s² (within 5%)", () => {
    expect(Math.abs(moonOnEarth() / 1.1e-6 - 1)).toBeLessThan(0.05);
    expect(tidalAcceleration(M_MOON, R_EARTH, EARTH_MOON_DISTANCE).unit).toBe('m s^-2');
  });
  it("Sun's tide on Earth ≈ 0.46× the Moon's", () => {
    expect(sunOnEarth() / moonOnEarth()).toBeCloseTo(0.46, 1);
    expect(Math.abs(sunOnEarth() / moonOnEarth() - 0.46)).toBeLessThan(0.02);
  });
  it('scales as 1/r³ and linearly in M and R', () => {
    const a1 = tidalAcceleration(M_SUN, R_EARTH, AU).value;
    expect(tidalAcceleration(M_SUN, R_EARTH, 2 * AU).value).toBeCloseTo(a1 / 8, 20);
    expect(tidalAcceleration(M_SUN, R_EARTH, 0.5 * AU).value / a1).toBeCloseTo(8, 10);
    expect(tidalAcceleration(2 * M_SUN, R_EARTH, AU).value / a1).toBeCloseTo(2, 10);
    expect(tidalAcceleration(M_SUN, 3 * R_EARTH, AU).value / a1).toBeCloseTo(3, 10);
  });
  it('throws RangeError for non-positive inputs', () => {
    expect(() => tidalAcceleration(0, R_EARTH, AU)).toThrow(RangeError);
    expect(() => tidalAcceleration(M_SUN, -1, AU)).toThrow(RangeError);
    expect(() => tidalAcceleration(M_SUN, R_EARTH, 0)).toThrow(RangeError);
    expect(() => tidalAcceleration(NaN, R_EARTH, AU)).toThrow(RangeError);
  });
});

describe('stellarTideRelativeToEarth', () => {
  it('Sun on Earth = 1', () => {
    expect(stellarTideRelativeToEarth(sunOnEarth()).value).toBeCloseTo(1, 12);
  });
  it('closer orbit gives a proportionally larger ratio', () => {
    const a = tidalAcceleration(M_SUN, R_EARTH, 0.1 * AU).value;
    expect(stellarTideRelativeToEarth(a).value).toBeCloseTo(1000, 6);
  });
  it('throws on negative input', () => {
    expect(() => stellarTideRelativeToEarth(-1)).toThrow(RangeError);
  });
});

describe('moonTide', () => {
  it('unknown → null, no exomoon assumed', () => {
    const r = moonTide({ kind: 'unknown' }, R_EARTH);
    expect(r.value).toBeNull();
    expect(r.assumptions.join(' ')).toContain('Moon status unknown — no exomoon assumed');
  });
  it('none → null, "No moon"', () => {
    const r = moonTide({ kind: 'none' }, R_EARTH);
    expect(r.value).toBeNull();
    expect(r.assumptions.join(' ')).toContain('No moon');
  });
  it('custom Earth-like moon matches tidalAcceleration', () => {
    const r = moonTide({ kind: 'custom', mass_kg: M_MOON, distance_m: EARTH_MOON_DISTANCE, label: 'Luna' }, R_EARTH);
    expect(r.value).toBeCloseTo(moonOnEarth(), 20);
  });
  it('custom moon with unknown planet radius → null with note', () => {
    const r = moonTide({ kind: 'custom', mass_kg: M_MOON, distance_m: EARTH_MOON_DISTANCE, label: 'Luna' }, null);
    expect(r.value).toBeNull();
    expect(r.assumptions.join(' ')).toContain('radius unknown');
  });
});

describe('tidalLockingIndicator', () => {
  const earth = {
    starMass_kg: M_SUN, a_m: AU, planetMass_kg: M_EARTH, planetRadius_m: R_EARTH,
    systemAge_yr: null as number | null, rotationPeriod_s: null as number | null, orbitalPeriod_s: YEAR,
  };
  it('Earth around the Sun → unlikely (with and without age)', () => {
    expect(tidalLockingIndicator(earth).value).toBe('unlikely');
    expect(tidalLockingIndicator({ ...earth, systemAge_yr: 4.6e9 }).value).toBe('unlikely');
  });
  it('Earth-mass planet at 0.03 AU from a 0.1 M☉ star → likely', () => {
    const r = tidalLockingIndicator({
      ...earth, starMass_kg: 0.1 * M_SUN, a_m: 0.03 * AU, orbitalPeriod_s: 7.1 * DAY,
    });
    expect(r.value).toBe('likely');
  });
  it('measured synchronous rotation → likely', () => {
    const r = tidalLockingIndicator({ ...earth, rotationPeriod_s: YEAR * 1.03 });
    expect(r.value).toBe('likely');
    expect(r.assumptions.join(' ')).toContain('Measured synchronous rotation');
  });
  it('missing mass or radius → unknown', () => {
    expect(tidalLockingIndicator({ ...earth, planetMass_kg: null }).value).toBe('unknown');
    expect(tidalLockingIndicator({ ...earth, planetRadius_m: null }).value).toBe('unknown');
  });
  it('is qualitative: states assumed Q, k₂ and uncertainty; no number as value', () => {
    const r = tidalLockingIndicator(earth);
    expect(typeof r.value).toBe('string');
    const text = r.assumptions.join(' ');
    expect(text).toContain('Q = 100');
    expect(text).toContain('k₂ = 0.3');
    expect(text).toContain('12 h');
    expect(text).toContain('~100');
  });
  it('an intermediate case bins as possible', () => {
    // Earth analogue: t ≈ 1.7e11 yr at 1 AU; t ∝ a⁶ → ≈ 7.7e9 yr at 0.6 AU → possible without age.
    expect(tidalLockingIndicator({ ...earth, a_m: 0.6 * AU }).value).toBe('possible');
  });
  it('throws on invalid inputs', () => {
    expect(() => tidalLockingIndicator({ ...earth, a_m: 0 })).toThrow(RangeError);
    expect(() => tidalLockingIndicator({ ...earth, planetMass_kg: -1 })).toThrow(RangeError);
  });
});
