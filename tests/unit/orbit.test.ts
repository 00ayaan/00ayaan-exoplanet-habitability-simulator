// Owner: Agent 2 (Orbit).
import { describe, expect, it } from 'vitest';
import { AU, DAY, L_SUN, M_EARTH, M_SUN } from '../../src/physics/constants';
import {
  apoapsis,
  distanceAtTrueAnomaly,
  orbitalPeriod,
  periapsis,
  sampleOrbit,
  solveKepler,
} from '../../src/physics/orbit';

function at<T>(arr: T[], i: number): T {
  const v = arr[i];
  if (v === undefined) throw new Error(`index ${i} out of range`);
  return v;
}

const relErr = (a: number, b: number): number => Math.abs(a - b) / Math.abs(b);

describe('orbitalPeriod', () => {
  it('Earth around the Sun is ≈ 365.25 d (within 0.1%)', () => {
    const P = orbitalPeriod(AU, M_SUN);
    expect(P.unit).toBe('s');
    expect(relErr(P.value / DAY, 365.25)).toBeLessThan(1e-3);
    // Including Earth's mass shortens it very slightly.
    expect(orbitalPeriod(AU, M_SUN, M_EARTH).value).toBeLessThan(P.value);
  });
  it('scales as a^1.5', () => {
    const p1 = orbitalPeriod(AU, M_SUN).value;
    for (const k of [0.1, 2, 4, 9, 30]) {
      expect(relErr(orbitalPeriod(k * AU, M_SUN).value / p1, k ** 1.5)).toBeLessThan(1e-12);
    }
  });
  it('states independence of eccentricity and planet-mass handling', () => {
    const txt = orbitalPeriod(AU, M_SUN).assumptions.join(' ');
    expect(txt).toMatch(/independent of eccentricity/i);
    expect(txt).toMatch(/planet mass/i);
  });
});

describe('periapsis / apoapsis / distanceAtTrueAnomaly', () => {
  const e = 0.0167;
  it('peri/apo for Earth-like e', () => {
    expect(periapsis(AU, e).value).toBeCloseTo(AU * (1 - e), 0);
    expect(apoapsis(AU, e).value).toBeCloseTo(AU * (1 + e), 0);
    expect(relErr(periapsis(AU, e).value / AU, 0.9833)).toBeLessThan(1e-12);
    expect(relErr(apoapsis(AU, e).value / AU, 1.0167)).toBeLessThan(1e-12);
  });
  it('r(0) = periapsis, r(π) = apoapsis', () => {
    for (const ee of [0, e, 0.5, 0.99]) {
      expect(relErr(distanceAtTrueAnomaly(AU, ee, 0).value, periapsis(AU, ee).value)).toBeLessThan(1e-12);
      expect(relErr(distanceAtTrueAnomaly(AU, ee, Math.PI).value, apoapsis(AU, ee).value)).toBeLessThan(1e-12);
    }
  });
  it('e = 0 is an exact circle', () => {
    for (const th of [0, 1, 2, Math.PI, 5]) expect(distanceAtTrueAnomaly(AU, 0, th).value).toBe(AU);
  });
});

describe('solveKepler', () => {
  it('satisfies M = E − e sinE to 1e-10 across e and many M', () => {
    const Ms: number[] = [];
    for (let i = -200; i <= 200; i++) Ms.push((i / 200) * 3 * Math.PI); // covers [−3π, 3π]
    Ms.push(0, Math.PI, -Math.PI, 1e-14, -1e-14, 2 * Math.PI - 1e-13);
    for (const e of [0, 0.1, 0.5, 0.9, 0.99]) {
      for (const M of Ms) {
        const E = solveKepler(M, e);
        expect(Number.isFinite(E)).toBe(true);
        expect(Math.abs(E - e * Math.sin(E) - M)).toBeLessThan(1e-10);
      }
    }
  });
  it('is deterministic and returns M for e = 0', () => {
    expect(solveKepler(1.234, 0.9)).toBe(solveKepler(1.234, 0.9));
    expect(solveKepler(4.2, 0)).toBe(4.2);
  });
  it('handles e very close to 1', () => {
    for (const M of [1e-6, 0.01, 0.5, 3]) {
      const E = solveKepler(M, 0.999999);
      expect(Math.abs(E - 0.999999 * Math.sin(E) - M)).toBeLessThan(1e-10);
    }
  });
});

describe('sampleOrbit', () => {
  const L = L_SUN;
  const A = 0.3;

  it('returns n samples with timeFraction k/n', () => {
    const s = sampleOrbit(AU, 0.3, L, A, 12);
    expect(s).toHaveLength(12);
    s.forEach((p, k) => expect(p.timeFraction).toBe(k / 12));
    expect(at(s, 0).trueAnomaly_rad).toBe(0);
    expect(relErr(at(s, 0).x_m, AU * 0.7)).toBeLessThan(1e-12); // periapsis on +x
  });

  it('e = 0 gives all distances exactly a', () => {
    for (const p of sampleOrbit(AU, 0, L, A, 90)) {
      expect(p.distance_m).toBe(AU);
      expect(Math.hypot(p.x_m, p.y_m) / AU).toBeCloseTo(1, 12);
    }
  });

  it('samples lie on the ellipse with the star at the focus', () => {
    for (const e of [0, 0.0167, 0.5, 0.9, 0.99]) {
      const a = 2 * AU;
      const b = a * Math.sqrt(1 - e * e);
      for (const p of sampleOrbit(a, e, L, A, 73)) {
        expect(relErr(Math.hypot(p.x_m, p.y_m), p.distance_m)).toBeLessThan(1e-9);
        const ell = (p.x_m + a * e) ** 2 / a ** 2 + p.y_m ** 2 / b ** 2;
        expect(Math.abs(ell - 1)).toBeLessThan(1e-9);
        // True anomaly consistent with the orbit equation.
        expect(relErr(distanceAtTrueAnomaly(a, e, p.trueAnomaly_rad).value, p.distance_m)).toBeLessThan(1e-9);
      }
    }
  });

  it('time-uniform sampling puts more samples near apoapsis than periapsis (e = 0.5)', () => {
    const s = sampleOrbit(AU, 0.5, L, A, 360);
    const nearPeri = s.filter((p) => Math.cos(p.trueAnomaly_rad) > 0.5).length;
    const nearApo = s.filter((p) => Math.cos(p.trueAnomaly_rad) < -0.5).length;
    expect(nearApo).toBeGreaterThan(2 * nearPeri);
  });

  it('flux ratio peri/apo = ((1+e)/(1−e))²', () => {
    for (const e of [0.1, 0.5, 0.9]) {
      const n = 200; // even n → k = n/2 is exactly apoapsis
      const s = sampleOrbit(AU, e, L, A, n);
      const ratio = at(s, 0).flux_W_m2 / at(s, n / 2).flux_W_m2;
      expect(relErr(ratio, ((1 + e) / (1 - e)) ** 2)).toBeLessThan(1e-10);
      expect(at(s, 0).equilibriumTemp_K).toBeGreaterThan(at(s, n / 2).equilibriumTemp_K);
    }
  });

  it('Earth-like circular orbit gives T_eq ≈ 255 K', () => {
    const s = sampleOrbit(AU, 0, L, 0.3, 4);
    expect(at(s, 0).equilibriumTemp_K).toBeGreaterThan(250);
    expect(at(s, 0).equilibriumTemp_K).toBeLessThan(258);
  });
});

describe('RangeError guards', () => {
  it('rejects invalid inputs', () => {
    expect(() => orbitalPeriod(0, M_SUN)).toThrow(RangeError);
    expect(() => orbitalPeriod(-AU, M_SUN)).toThrow(RangeError);
    expect(() => orbitalPeriod(AU, 0)).toThrow(RangeError);
    expect(() => orbitalPeriod(AU, M_SUN, -1)).toThrow(RangeError);
    expect(() => orbitalPeriod(NaN, M_SUN)).toThrow(RangeError);
    expect(() => orbitalPeriod(AU, Infinity)).toThrow(RangeError);
    expect(() => periapsis(AU, -0.1)).toThrow(RangeError);
    expect(() => apoapsis(AU, 1)).toThrow(RangeError);
    expect(() => distanceAtTrueAnomaly(AU, 1.5, 0)).toThrow(RangeError);
    expect(() => distanceAtTrueAnomaly(AU, 0.1, NaN)).toThrow(RangeError);
    expect(() => solveKepler(1, 1)).toThrow(RangeError);
    expect(() => solveKepler(Infinity, 0.1)).toThrow(RangeError);
    expect(() => sampleOrbit(AU, 0.1, L_SUN, 0.3, 2)).toThrow(RangeError);
    expect(() => sampleOrbit(AU, 0.1, L_SUN, 0.3, 10.5)).toThrow(RangeError);
    expect(() => sampleOrbit(AU, 0.1, L_SUN, 1.2, 10)).toThrow(RangeError);
    expect(() => sampleOrbit(AU, 0.1, 0, 0.3, 10)).toThrow(RangeError);
    expect(() => sampleOrbit(0, 0.1, L_SUN, 0.3, 10)).toThrow(RangeError);
  });
});
