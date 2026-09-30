// Owner: Agent 3. Unit tests for src/physics/atmosphere.ts (simplified one-layer greenhouse model).
import { describe, expect, it } from 'vitest';
import { EARTH_GREENHOUSE, greenhouseToEpsilon, surfaceTemperature } from '../../src/physics/atmosphere';
import { equilibriumTemperature } from '../../src/physics/planet';
import { AU, L_SUN, S_EARTH } from '../../src/physics/constants';

const A = 0.3;

describe('EARTH_GREENHOUSE', () => {
  it('is ≈ 0.78 and in [0, 1]', () => {
    expect(EARTH_GREENHOUSE).toBeGreaterThan(0.77);
    expect(EARTH_GREENHOUSE).toBeLessThan(0.79);
  });

  it('reproduces 288 K for a Sun-like star at 1 AU with A = 0.30', () => {
    const S = L_SUN / (4 * Math.PI * AU ** 2);
    const eps = greenhouseToEpsilon(EARTH_GREENHOUSE).value;
    const ts = surfaceTemperature(S, A, eps).value;
    expect(Math.abs(ts - 288)).toBeLessThanOrEqual(0.01);
  });
});

describe('greenhouseToEpsilon', () => {
  it('is the identity mapping on [0, 1]', () => {
    for (const g of [0, 0.25, 0.5, EARTH_GREENHOUSE, 1]) {
      const r = greenhouseToEpsilon(g);
      expect(r.value).toBe(g);
      expect(r.unit).toBe('');
      expect(r.assumptions.length).toBeGreaterThan(0);
    }
  });

  it('throws RangeError outside [0, 1]', () => {
    expect(() => greenhouseToEpsilon(-0.01)).toThrow(RangeError);
    expect(() => greenhouseToEpsilon(1.01)).toThrow(RangeError);
    expect(() => greenhouseToEpsilon(NaN)).toThrow(RangeError);
  });
});

describe('surfaceTemperature (simplified one-layer model)', () => {
  const teq = equilibriumTemperature(S_EARTH, A).value;

  it('ε = 0 gives T_s = T_eq', () => {
    expect(surfaceTemperature(S_EARTH, A, 0).value).toBeCloseTo(teq, 10);
  });

  it('ε = 1 gives the model maximum 2^¼ · T_eq', () => {
    expect(surfaceTemperature(S_EARTH, A, 1).value / teq).toBeCloseTo(2 ** 0.25, 12);
  });

  it('matches the equivalent form T_eq · (2/(2 − ε))^¼', () => {
    for (const eps of [0.1, 0.5, 0.9]) {
      expect(surfaceTemperature(S_EARTH, A, eps).value).toBeCloseTo(teq * (2 / (2 - eps)) ** 0.25, 9);
    }
  });

  it('is monotonic increasing in ε', () => {
    let prev = -Infinity;
    for (let i = 0; i <= 20; i++) {
      const t = surfaceTemperature(S_EARTH, A, i / 20).value;
      expect(t).toBeGreaterThan(prev);
      prev = t;
    }
  });

  it('is monotonic increasing in flux', () => {
    let prev = -Infinity;
    for (const f of [100, 500, 1000, S_EARTH, 2000, 5000]) {
      const t = surfaceTemperature(f, A, EARTH_GREENHOUSE).value;
      expect(t).toBeGreaterThan(prev);
      prev = t;
    }
  });

  it('labels itself as a simplified model and lists its limits', () => {
    const r = surfaceTemperature(S_EARTH, A, 0.5);
    expect(r.unit).toBe('K');
    const text = r.assumptions.join(' ');
    expect(text).toMatch(/SIMPLIFIED one-layer/);
    expect(text).toMatch(/pressure/i);
    expect(text).toMatch(/water-vapor/i);
  });

  it('throws RangeError for invalid ε, flux or albedo', () => {
    expect(() => surfaceTemperature(S_EARTH, A, -0.1)).toThrow(RangeError);
    expect(() => surfaceTemperature(S_EARTH, A, 1.1)).toThrow(RangeError);
    expect(() => surfaceTemperature(S_EARTH, A, NaN)).toThrow(RangeError);
    expect(() => surfaceTemperature(-1, A, 0.5)).toThrow(RangeError);
    expect(() => surfaceTemperature(S_EARTH, 1.5, 0.5)).toThrow(RangeError);
  });
});
