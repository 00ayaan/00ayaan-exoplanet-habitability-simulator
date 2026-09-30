// Owner: Agent 1. Unit tests for stellar.ts and starPresets.ts.
import { describe, expect, it } from 'vitest';
import {
  fluxAtDistance, luminosityFromRadiusTeff, relativeInsolation, resolveLuminosity,
} from '../../src/physics/stellar';
import { STAR_PRESETS, STAR_TYPE_LABELS, getStarPreset } from '../../src/physics/starPresets';
import { AU, L_SUN, R_SUN, T_SUN } from '../../src/physics/constants';
import { STAR_TYPES, type Star, type StarType } from '../../src/physics/types';

const relErr = (a: number, b: number) => Math.abs(a - b) / Math.abs(b);

describe('luminosityFromRadiusTeff', () => {
  it('reproduces nominal solar luminosity within 0.1%', () => {
    const r = luminosityFromRadiusTeff(R_SUN, T_SUN);
    expect(r.unit).toBe('W');
    expect(relErr(r.value, 3.828e26)).toBeLessThan(1e-3);
    expect(r.assumptions.join(' ')).toMatch(/blackbody/i);
  });
  it('scales as R² T⁴', () => {
    const base = luminosityFromRadiusTeff(R_SUN, T_SUN).value;
    expect(luminosityFromRadiusTeff(2 * R_SUN, T_SUN).value / base).toBeCloseTo(4, 10);
    expect(luminosityFromRadiusTeff(R_SUN, 2 * T_SUN).value / base).toBeCloseTo(16, 10);
  });
  it('throws RangeError on invalid input', () => {
    expect(() => luminosityFromRadiusTeff(0, T_SUN)).toThrow(RangeError);
    expect(() => luminosityFromRadiusTeff(-R_SUN, T_SUN)).toThrow(RangeError);
    expect(() => luminosityFromRadiusTeff(R_SUN, 0)).toThrow(RangeError);
    expect(() => luminosityFromRadiusTeff(R_SUN, -5)).toThrow(RangeError);
    expect(() => luminosityFromRadiusTeff(NaN, T_SUN)).toThrow(RangeError);
    expect(() => luminosityFromRadiusTeff(R_SUN, Infinity)).toThrow(RangeError);
  });
});

describe('fluxAtDistance / relativeInsolation', () => {
  it('Sun at 1 AU gives ≈ 1361 W/m²', () => {
    const f = fluxAtDistance(L_SUN, AU);
    expect(f.unit).toBe('W m^-2');
    expect(f.value).toBeCloseTo(1361, -1);
    expect(Math.abs(f.value - 1361)).toBeLessThan(1);
  });
  it('relative insolation of the Sun at 1 AU is 1', () => {
    const s = relativeInsolation(L_SUN, AU);
    expect(s.unit).toBe('S_earth');
    expect(s.value).toBeCloseTo(1, 12);
    expect(s.assumptions.length).toBeGreaterThan(0);
  });
  it('follows the inverse-square law', () => {
    const f1 = fluxAtDistance(L_SUN, AU).value;
    expect(fluxAtDistance(L_SUN, 2 * AU).value).toBeCloseTo(f1 / 4, 8);
    expect(relativeInsolation(L_SUN, 0.5 * AU).value).toBeCloseTo(4, 10);
    expect(relativeInsolation(L_SUN, 10 * AU).value).toBeCloseTo(0.01, 12);
  });
  it('is linear in luminosity', () => {
    expect(relativeInsolation(3 * L_SUN, AU).value).toBeCloseTo(3, 10);
  });
  it('throws RangeError on invalid input', () => {
    expect(() => fluxAtDistance(L_SUN, 0)).toThrow(RangeError);
    expect(() => fluxAtDistance(L_SUN, -AU)).toThrow(RangeError);
    expect(() => fluxAtDistance(0, AU)).toThrow(RangeError);
    expect(() => fluxAtDistance(-L_SUN, AU)).toThrow(RangeError);
    expect(() => relativeInsolation(L_SUN, 0)).toThrow(RangeError);
    expect(() => relativeInsolation(-1, AU)).toThrow(RangeError);
  });
});

describe('resolveLuminosity', () => {
  const base: Star = {
    name: 'Test', spectralType: 'G', teff_K: T_SUN, radius_Rsun: 1, mass_Msun: 1,
    luminosity_Lsun: null, source: 'nasa-exoplanet-archive', reference: 'Test ref',
  };
  it('uses the catalog value when present', () => {
    const r = resolveLuminosity({ ...base, luminosity_Lsun: 2.5 });
    expect(r.value).toBeCloseTo(2.5 * L_SUN, -18);
    expect(r.unit).toBe('W');
    expect(r.assumptions.join(' ')).toMatch(/taken from catalog/i);
  });
  it('catalog value wins even when inconsistent with R and Teff', () => {
    const r = resolveLuminosity({ ...base, luminosity_Lsun: 10 });
    expect(r.value / L_SUN).toBeCloseTo(10, 10);
  });
  it('computes from R and Teff when luminosity is null', () => {
    const r = resolveLuminosity(base);
    expect(relErr(r.value, L_SUN)).toBeLessThan(1e-3);
    expect(r.assumptions.join(' ')).toMatch(/computed from R and Teff/i);
    expect(r.assumptions.join(' ')).toMatch(/blackbody/i);
  });
  it('throws RangeError on invalid stars', () => {
    expect(() => resolveLuminosity({ ...base, luminosity_Lsun: 0 })).toThrow(RangeError);
    expect(() => resolveLuminosity({ ...base, luminosity_Lsun: -1 })).toThrow(RangeError);
    expect(() => resolveLuminosity({ ...base, radius_Rsun: 0 })).toThrow(RangeError);
    expect(() => resolveLuminosity({ ...base, teff_K: -100 })).toThrow(RangeError);
  });
});

describe('STAR_PRESETS', () => {
  it('has a preset and label for every StarType', () => {
    for (const t of STAR_TYPES) {
      expect(STAR_PRESETS[t]).toBeDefined();
      expect(STAR_TYPE_LABELS[t]).toMatch(new RegExp(`^${t} — `));
      expect(STAR_PRESETS[t].source).toBe(`preset:${t}`);
      expect(STAR_PRESETS[t].spectralType).toBe(t);
      expect(STAR_PRESETS[t].reference).toBeTruthy();
    }
  });
  it('every preset has positive finite values', () => {
    for (const t of STAR_TYPES) {
      const s = STAR_PRESETS[t];
      for (const v of [s.teff_K, s.radius_Rsun, s.mass_Msun, s.luminosity_Lsun]) {
        expect(typeof v).toBe('number');
        expect(Number.isFinite(v)).toBe(true);
        expect(v as number).toBeGreaterThan(0);
      }
    }
  });
  it('every preset L is consistent with R and Teff within 15%', () => {
    for (const t of STAR_TYPES) {
      const s = STAR_PRESETS[t];
      const sb = s.radius_Rsun ** 2 * (s.teff_K / T_SUN) ** 4;
      expect(relErr(s.luminosity_Lsun as number, sb), t).toBeLessThan(0.15);
    }
  });
  it('the G preset is exactly the nominal Sun', () => {
    const g = STAR_PRESETS.G;
    expect([g.teff_K, g.radius_Rsun, g.mass_Msun, g.luminosity_Lsun]).toEqual([5772, 1, 1, 1]);
    expect(relativeInsolation(resolveLuminosity(g).value, AU).value).toBeCloseTo(1, 12);
  });
  it('main-sequence presets are ordered by Teff O > B > A > F > G > K > M', () => {
    const order = ['O', 'B', 'A', 'F', 'G', 'K', 'M'] as const;
    for (let i = 0; i < order.length - 1; i++) {
      const hotter = STAR_PRESETS[order[i] as StarType];
      const cooler = STAR_PRESETS[order[i + 1] as StarType];
      expect(hotter.teff_K).toBeGreaterThan(cooler.teff_K);
      expect(hotter.luminosity_Lsun as number).toBeGreaterThan(cooler.luminosity_Lsun as number);
    }
  });
  it('getStarPreset returns an independent copy', () => {
    const m = getStarPreset('M');
    expect(m).toEqual(STAR_PRESETS.M);
    m.teff_K = 1;
    expect(STAR_PRESETS.M.teff_K).toBe(3430);
    expect(() => getStarPreset('X' as never)).toThrow(RangeError);
  });
});
