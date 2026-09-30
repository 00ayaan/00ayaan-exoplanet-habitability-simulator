/**
 * Orbit module — OWNED BY AGENT 2 (Orbit).
 *
 * Two-body Keplerian orbits: period (Kepler's third law), distance along an
 * elliptical orbit, periapsis/apoapsis, a robust Kepler-equation solver and a
 * time-uniform orbit sampler for the visualization (DESIGN.md §8).
 *
 * All inputs and outputs are SI (m, kg, s, rad, W, K). Pure and deterministic.
 */
import { G } from './constants';
import { fluxAtDistance } from './stellar';
import { equilibriumTemperature } from './planet';
import type { OrbitSample, Result } from './types';

const TWO_PI = 2 * Math.PI;

/** Newton tolerance on the eccentric-anomaly step [rad]. */
const KEPLER_TOL = 1e-12;
/** Newton iteration cap before falling back to bisection. */
const KEPLER_MAX_NEWTON = 50;
/** Bisection iteration cap (interval of 2π halves below 1e-15 well before this). */
const KEPLER_MAX_BISECT = 200;

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

function requireFinite(name: string, v: number): void {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new RangeError(`${name} must be a finite number (got ${String(v)}).`);
  }
}

function requirePositive(name: string, v: number): void {
  requireFinite(name, v);
  if (v <= 0) throw new RangeError(`${name} must be > 0 (got ${v}).`);
}

function requireEccentricity(e: number): void {
  requireFinite('Eccentricity e', e);
  if (e < 0 || e >= 1) {
    throw new RangeError(`Eccentricity e must satisfy 0 ≤ e < 1 for a bound orbit (got ${e}).`);
  }
}

function eccentricityNote(e: number): string {
  return e === 0
    ? 'Circular orbit (e = 0): distance is constant and equal to the semi-major axis.'
    : `Elliptical orbit with eccentricity e = ${e}.`;
}

const TWO_BODY_NOTE =
  'Ideal two-body Keplerian orbit: point masses, no perturbations from other planets, no relativistic or tidal effects.';

// ---------------------------------------------------------------------------
// Period
// ---------------------------------------------------------------------------

/**
 * Orbital period from Kepler's third law (Newtonian two-body form).
 *
 * Equation: P = 2π √( a³ / (G (M★ + Mp)) )
 *
 * @param a_m           Semi-major axis a [m]. Must be finite and > 0.
 * @param starMass_kg   Stellar mass M★ [kg]. Must be finite and > 0.
 * @param planetMass_kg Planet mass Mp [kg]. Optional, default 0 (test-particle limit).
 *                      Must be finite and ≥ 0.
 * @returns Result with value P [s], unit "s".
 *
 * Assumptions: two-body point masses; the period depends only on a and the total
 * mass — it is independent of eccentricity. Planet mass is included only if given.
 *
 * Valid range: any bound orbit (a > 0, M★ > 0). Throws RangeError otherwise.
 */
export function orbitalPeriod(a_m: number, starMass_kg: number, planetMass_kg = 0): Result {
  requirePositive('Semi-major axis a_m', a_m);
  requirePositive('Stellar mass starMass_kg', starMass_kg);
  requireFinite('Planet mass planetMass_kg', planetMass_kg);
  if (planetMass_kg < 0) {
    throw new RangeError(`Planet mass planetMass_kg must be ≥ 0 (got ${planetMass_kg}).`);
  }
  const mu = G * (starMass_kg + planetMass_kg);
  const value = TWO_PI * Math.sqrt((a_m * a_m * a_m) / mu);
  return {
    value,
    unit: 's',
    assumptions: [
      "Kepler's third law, P = 2π√(a³/(G(M★+Mp))).",
      TWO_BODY_NOTE,
      'Period depends on semi-major axis and total mass only; it is independent of eccentricity.',
      planetMass_kg > 0
        ? 'Planet mass included in the total mass.'
        : 'Planet mass not given (or zero): planet treated as a test particle (Mp ≪ M★).',
    ],
  };
}

// ---------------------------------------------------------------------------
// Distance
// ---------------------------------------------------------------------------

/**
 * Instantaneous star–planet distance at a given true anomaly (orbit equation).
 *
 * Equation: r(θ) = a (1 − e²) / (1 + e cos θ)
 *
 * @param a_m             Semi-major axis a [m], finite and > 0.
 * @param e               Eccentricity [dimensionless], 0 ≤ e < 1.
 * @param trueAnomaly_rad True anomaly θ [rad], angle from periapsis measured at the star. Any finite value.
 * @returns Result with value r [m], unit "m". θ = 0 gives periapsis, θ = π apoapsis.
 *
 * Assumptions: ideal Keplerian ellipse with the star at one focus.
 * Valid range: bound orbits only. Throws RangeError for a ≤ 0, e outside [0, 1), non-finite inputs.
 */
export function distanceAtTrueAnomaly(a_m: number, e: number, trueAnomaly_rad: number): Result {
  requirePositive('Semi-major axis a_m', a_m);
  requireEccentricity(e);
  requireFinite('True anomaly trueAnomaly_rad', trueAnomaly_rad);
  const value = e === 0 ? a_m : (a_m * (1 - e * e)) / (1 + e * Math.cos(trueAnomaly_rad));
  return {
    value,
    unit: 'm',
    assumptions: ['Orbit equation r = a(1−e²)/(1+e cosθ), star at one focus.', eccentricityNote(e), TWO_BODY_NOTE],
  };
}

/**
 * Periapsis (closest-approach) distance.
 *
 * Equation: r_peri = a (1 − e)
 *
 * @param a_m Semi-major axis a [m], finite and > 0.
 * @param e   Eccentricity, 0 ≤ e < 1.
 * @returns Result with value r_peri [m], unit "m".
 *
 * Assumptions: ideal Keplerian ellipse. Valid range: bound orbits; throws RangeError otherwise.
 */
export function periapsis(a_m: number, e: number): Result {
  requirePositive('Semi-major axis a_m', a_m);
  requireEccentricity(e);
  return {
    value: a_m * (1 - e),
    unit: 'm',
    assumptions: ['Periapsis r = a(1−e).', eccentricityNote(e), TWO_BODY_NOTE],
  };
}

/**
 * Apoapsis (farthest) distance.
 *
 * Equation: r_apo = a (1 + e)
 *
 * @param a_m Semi-major axis a [m], finite and > 0.
 * @param e   Eccentricity, 0 ≤ e < 1.
 * @returns Result with value r_apo [m], unit "m".
 *
 * Assumptions: ideal Keplerian ellipse. Valid range: bound orbits; throws RangeError otherwise.
 */
export function apoapsis(a_m: number, e: number): Result {
  requirePositive('Semi-major axis a_m', a_m);
  requireEccentricity(e);
  return {
    value: a_m * (1 + e),
    unit: 'm',
    assumptions: ['Apoapsis r = a(1+e).', eccentricityNote(e), TWO_BODY_NOTE],
  };
}

// ---------------------------------------------------------------------------
// Kepler's equation
// ---------------------------------------------------------------------------

/**
 * Solve Kepler's equation for the eccentric anomaly E (helper; bare number allowed by AGENTS.md).
 *
 * Equation: M = E − e sin E
 *
 * Method: M is reduced to [−π, π]; Newton–Raphson starting from E₀ = M (e < 0.8)
 * or E₀ = π·sign(M) (e ≥ 0.8), step tolerance 1e-12 rad, at most 50 iterations.
 * If Newton fails to converge (or produces a non-finite value) the solver falls back
 * to bisection on [−π, π], where f(E) = E − e sinE − M is strictly increasing.
 * The 2π multiple removed during reduction is added back, so the returned E satisfies
 * E − e sin E = M for the caller's M (not just modulo 2π). e = 0 returns M exactly.
 *
 * @param meanAnomaly_rad Mean anomaly M [rad], any finite value.
 * @param e               Eccentricity, 0 ≤ e < 1.
 * @returns Eccentric anomaly E [rad], in the same 2π "turn" as M.
 *
 * Valid range: 0 ≤ e < 1 (robust up to e → 0.99+). Deterministic. Throws RangeError otherwise.
 */
export function solveKepler(meanAnomaly_rad: number, e: number): number {
  requireFinite('Mean anomaly meanAnomaly_rad', meanAnomaly_rad);
  requireEccentricity(e);
  if (e === 0) return meanAnomaly_rad;

  // Reduce to [−π, π]; remember the offset so we can restore the caller's turn.
  let Mn = meanAnomaly_rad - TWO_PI * Math.round(meanAnomaly_rad / TWO_PI);
  if (Mn > Math.PI) Mn = Math.PI;
  if (Mn < -Math.PI) Mn = -Math.PI;
  const offset = meanAnomaly_rad - Mn;

  const f = (E: number): number => E - e * Math.sin(E) - Mn;

  let E = e < 0.8 ? Mn : Math.PI * Math.sign(Mn);
  let converged = false;
  for (let i = 0; i < KEPLER_MAX_NEWTON; i++) {
    const fp = 1 - e * Math.cos(E); // ≥ 1 − e > 0
    const dE = f(E) / fp;
    E -= dE;
    if (!Number.isFinite(E)) break;
    if (Math.abs(dE) <= KEPLER_TOL) {
      converged = true;
      break;
    }
  }

  if (!converged || !Number.isFinite(E) || E < -Math.PI - 1e-9 || E > Math.PI + 1e-9) {
    // Bisection fallback: f(−π) = −π − Mn ≤ 0, f(π) = π − Mn ≥ 0.
    let lo = -Math.PI;
    let hi = Math.PI;
    for (let i = 0; i < KEPLER_MAX_BISECT && hi - lo > KEPLER_TOL; i++) {
      const mid = 0.5 * (lo + hi);
      if (f(mid) < 0) lo = mid;
      else hi = mid;
    }
    E = 0.5 * (lo + hi);
  }

  return E + offset;
}

// ---------------------------------------------------------------------------
// Sampling
// ---------------------------------------------------------------------------

/**
 * Sample an orbit at n points UNIFORM IN TIME, for animation and flux/temperature curves.
 *
 * For k = 0 … n−1: timeFraction t = k/n, mean anomaly M = 2πt, E from {@link solveKepler},
 *   true anomaly θ = 2·atan2(√(1+e) sin(E/2), √(1−e) cos(E/2))   (θ ∈ [0, 2π))
 *   r = a(1 − e cos E)
 *   x = a(cos E − e),  y = a√(1−e²) sin E   (star at origin = focus, periapsis on +x) [m]
 *   F = L / (4πr²) via fluxAtDistance (stellar.ts) [W m^-2]
 *   T_eq = [F(1−A)/(4σ)]^¼ via equilibriumTemperature (planet.ts) [K]
 * Because samples are uniform in time, they bunch up near apoapsis where the planet moves slowly,
 * so a constant-frame-rate animation speeds up at periapsis (Kepler's second law).
 *
 * @param a_m          Semi-major axis a [m], finite and > 0.
 * @param e            Eccentricity, 0 ≤ e < 1. e = 0 gives an exact circle (r = a at every sample).
 * @param luminosity_W Stellar luminosity L [W], finite and > 0.
 * @param albedo       Bond albedo A, 0 ≤ A ≤ 1.
 * @param n            Number of samples, integer ≥ 3.
 * @returns n OrbitSample objects, ordered by time starting at periapsis.
 *
 * Limitation (DESIGN.md §8): flux and equilibrium temperature are INSTANTANEOUS. Real planetary
 * climate does not respond instantly to changing stellar flux — atmospheric and oceanic thermal
 * inertia, circulation and seasonal effects are not modelled, so the T_eq swing along an eccentric
 * orbit is an upper bound on the actual temperature swing.
 *
 * Throws RangeError for invalid a, e, L, albedo or n.
 */
export function sampleOrbit(
  a_m: number,
  e: number,
  luminosity_W: number,
  albedo: number,
  n: number,
): OrbitSample[] {
  requirePositive('Semi-major axis a_m', a_m);
  requireEccentricity(e);
  requirePositive('Luminosity luminosity_W', luminosity_W);
  requireFinite('Albedo', albedo);
  if (albedo < 0 || albedo > 1) throw new RangeError(`Albedo must be in [0, 1] (got ${albedo}).`);
  requireFinite('Sample count n', n);
  if (!Number.isInteger(n) || n < 3) throw new RangeError(`Sample count n must be an integer ≥ 3 (got ${n}).`);

  const sqrtOnePlus = Math.sqrt(1 + e);
  const sqrtOneMinus = Math.sqrt(1 - e);
  const b = a_m * Math.sqrt(1 - e * e);

  const samples: OrbitSample[] = [];
  for (let k = 0; k < n; k++) {
    const t = k / n;
    const E = solveKepler(TWO_PI * t, e);
    const cosE = Math.cos(E);
    const sinE = Math.sin(E);
    let theta = 2 * Math.atan2(sqrtOnePlus * Math.sin(E / 2), sqrtOneMinus * Math.cos(E / 2));
    if (theta < 0) theta += TWO_PI;
    const r = e === 0 ? a_m : a_m * (1 - e * cosE);
    const flux = fluxAtDistance(luminosity_W, r).value;
    samples.push({
      timeFraction: t,
      trueAnomaly_rad: theta,
      distance_m: r,
      x_m: a_m * (cosE - e),
      y_m: b * sinE,
      flux_W_m2: flux,
      equilibriumTemp_K: equilibriumTemperature(flux, albedo).value,
    });
  }
  return samples;
}
