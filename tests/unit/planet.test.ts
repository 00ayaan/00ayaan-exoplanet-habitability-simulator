// Owner: Agent 3. Unit tests for src/physics/planet.ts.
import { describe, expect, it } from 'vitest';
import { equilibriumTemperature, surfaceGravity } from '../../src/physics/planet';
import { M_EARTH, R_EARTH, S_EARTH } from '../../src/physics/constants';

describe('surfaceGravity', () => {
  it('gives ≈ 9.80 m/s² for Earth mass and radius', () => {
    const g = surfaceGravity(M_EARTH, R_EARTH);
    expect(g.unit).toBe('m s^-2');
    expect(g.value).not.toBeNull();
    expect(Math.abs((g.value as number) - 9.8)).toBeLessThanOrEqual(0.03);
    expect(g.assumptions.length).toBeGreaterThan(0);
  });

  it('scales as M/R²', () => {
    const g0 = surfaceGravity(M_EARTH, R_EARTH).value as number;
    expect(surfaceGravity(2 * M_EARTH, R_EARTH).value as number).toBeCloseTo(2 * g0, 10);
    expect(surfaceGravity(M_EARTH, 2 * R_EARTH).value as number).toBeCloseTo(g0 / 4, 10);
    expect(surfaceGravity(8 * M_EARTH, 2 * R_EARTH).value as number).toBeCloseTo(2 * g0, 10);
  });

  it('returns null with an explanatory assumption when mass or radius is unknown', () => {
    const noMass = surfaceGravity(null, R_EARTH);
    expect(noMass.value).toBeNull();
    expect(noMass.assumptions.join(' ')).toMatch(/mass/i);
    const noRadius = surfaceGravity(M_EARTH, null);
    expect(noRadius.value).toBeNull();
    expect(noRadius.assumptions.join(' ')).toMatch(/radius/i);
    const neither = surfaceGravity(null, null);
    expect(neither.value).toBeNull();
    expect(neither.assumptions.join(' ')).toMatch(/mass and radius/i);
  });

  it('throws RangeError for non-positive or non-finite inputs', () => {
    expect(() => surfaceGravity(0, R_EARTH)).toThrow(RangeError);
    expect(() => surfaceGravity(-1, R_EARTH)).toThrow(RangeError);
    expect(() => surfaceGravity(M_EARTH, 0)).toThrow(RangeError);
    expect(() => surfaceGravity(M_EARTH, -5)).toThrow(RangeError);
    expect(() => surfaceGravity(NaN, R_EARTH)).toThrow(RangeError);
    expect(() => surfaceGravity(-1, null)).toThrow(RangeError);
  });
});

describe('equilibriumTemperature', () => {
  it('gives ≈ 254.6 K for Earth (S⊕, A = 0.30)', () => {
    const t = equilibriumTemperature(S_EARTH, 0.3);
    expect(t.unit).toBe('K');
    expect(Math.abs(t.value - 254.6)).toBeLessThanOrEqual(0.5);
  });

  it('documents redistribution, albedo and internal-heat assumptions', () => {
    const text = equilibriumTemperature(S_EARTH, 0.3).assumptions.join(' ');
    expect(text).toMatch(/redistribution/i);
    expect(text).toMatch(/albedo/i);
    expect(text).toMatch(/internal heat/i);
  });

  it('scales as F^¼ and increases with flux, decreases with albedo', () => {
    const t1 = equilibriumTemperature(S_EARTH, 0.3).value;
    expect(equilibriumTemperature(16 * S_EARTH, 0.3).value).toBeCloseTo(2 * t1, 9);
    expect(equilibriumTemperature(2 * S_EARTH, 0.3).value).toBeGreaterThan(t1);
    expect(equilibriumTemperature(S_EARTH, 0.5).value).toBeLessThan(t1);
  });

  it('handles limiting cases: zero flux and albedo = 1 give 0 K', () => {
    expect(equilibriumTemperature(0, 0.3).value).toBe(0);
    expect(equilibriumTemperature(S_EARTH, 1).value).toBe(0);
  });

  it('throws RangeError for negative flux or albedo outside [0, 1]', () => {
    expect(() => equilibriumTemperature(-1, 0.3)).toThrow(RangeError);
    expect(() => equilibriumTemperature(S_EARTH, -0.01)).toThrow(RangeError);
    expect(() => equilibriumTemperature(S_EARTH, 1.01)).toThrow(RangeError);
    expect(() => equilibriumTemperature(NaN, 0.3)).toThrow(RangeError);
  });
});
