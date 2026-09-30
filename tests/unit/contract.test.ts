// Owner: Agent 0. Sanity checks on the shared constants and unit helpers.
import { describe, expect, it } from 'vitest';
import { AU, L_SUN, S_EARTH, M_SUN, G } from '../../src/physics/constants';
import { auToM, mToAu, kToC } from '../../src/physics/units';
import { MODEL_ASSUMPTIONS, STAR_TYPES } from '../../src/physics/types';

describe('contract constants', () => {
  it('solar constant derived from nominal L_sun and AU is ~1361 W/m²', () => {
    expect(S_EARTH).toBeCloseTo(1361.2, 0);
    expect(L_SUN / (4 * Math.PI * AU ** 2)).toBeCloseTo(S_EARTH, 9);
  });
  it('GM_sun matches the IAU 2015 nominal value', () => {
    expect(G * M_SUN).toBeCloseTo(1.3271244e20, -13);
  });
  it('unit helpers round-trip', () => {
    expect(mToAu(auToM(2.5))).toBeCloseTo(2.5, 12);
    expect(kToC(273.15)).toBe(0);
  });
  it('contract lists all star types and the 10 display assumptions', () => {
    expect(STAR_TYPES).toHaveLength(8);
    expect(MODEL_ASSUMPTIONS).toHaveLength(10);
  });
});
