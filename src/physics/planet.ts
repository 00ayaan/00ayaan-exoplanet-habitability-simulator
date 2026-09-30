/**
 * Planet bulk properties: surface gravity and radiative equilibrium temperature.
 * Owner: Agent 3 (Climate). See DESIGN.md §9 and §10.
 *
 * Pure, deterministic, SI in / SI out. Every function returns a `Result`.
 */
import type { Result } from './types';
import { G, SIGMA_SB } from './constants';

function assertFinite(name: string, v: number): void {
  if (!Number.isFinite(v)) throw new RangeError(`${name} must be a finite number (got ${v}).`);
}

/**
 * Surface gravity of a spherical planet.
 *
 * Equation: g = G·M / R²   (DESIGN.md §9)
 *
 * @param mass_kg   Planet mass [kg], > 0, or `null` if unknown.
 * @param radius_m  Planet radius [m], > 0, or `null` if unknown.
 * @returns `Result<number | null>` — g [m s^-2]. `value` is `null` (never guessed)
 *          when either input is unknown; `assumptions` says which.
 *
 * Assumptions: spherical, non-rotating planet (no centrifugal term); all mass
 * interior to R (point-mass/shell theorem); gravity at the reference radius.
 *
 * Valid range: mass_kg > 0 and radius_m > 0 when provided.
 * @throws RangeError for non-finite, zero or negative mass or radius.
 */
export function surfaceGravity(mass_kg: number | null, radius_m: number | null): Result<number | null> {
  if (mass_kg !== null) {
    assertFinite('mass_kg', mass_kg);
    if (mass_kg <= 0) throw new RangeError(`mass_kg must be > 0 (got ${mass_kg}).`);
  }
  if (radius_m !== null) {
    assertFinite('radius_m', radius_m);
    if (radius_m <= 0) throw new RangeError(`radius_m must be > 0 (got ${radius_m}).`);
  }

  if (mass_kg === null || radius_m === null) {
    const unknown =
      mass_kg === null && radius_m === null ? 'Planet mass and radius are' : mass_kg === null ? 'Planet mass is' : 'Planet radius is';
    return {
      value: null,
      unit: 'm s^-2',
      assumptions: [`${unknown} unknown, so surface gravity cannot be computed (not estimated).`],
    };
  }

  return {
    value: (G * mass_kg) / (radius_m * radius_m),
    unit: 'm s^-2',
    assumptions: [
      'Planet treated as a non-rotating sphere (g = GM/R²; no centrifugal correction).',
      'Gravity evaluated at the given planet radius.',
    ],
  };
}

/**
 * Radiative equilibrium (effective) temperature of a planet with no atmosphere
 * greenhouse effect.
 *
 * Equation: T_eq = [F·(1 − A) / (4σ)]^¼   (DESIGN.md §10)
 *   F = incident stellar flux at the planet [W m^-2], A = Bond albedo, σ = Stefan–Boltzmann.
 *
 * @param flux_W_m2 Stellar flux at the planet [W m^-2], ≥ 0.
 * @param albedo    Bond albedo, dimensionless, in [0, 1].
 * @returns `Result` — T_eq [K].
 *
 * Assumptions: the factor 4 means absorbed energy is redistributed uniformly over
 * the whole sphere (fast rotator / efficient heat transport — a tidally locked
 * planet's day side could be much hotter); Bond albedo is an assumed input, not a
 * measurement; no internal (geothermal/tidal) heat; planet radiates as a blackbody.
 *
 * Valid range: flux_W_m2 ≥ 0, 0 ≤ albedo ≤ 1.
 * @throws RangeError if flux is negative or non-finite, or albedo is outside [0, 1].
 */
export function equilibriumTemperature(flux_W_m2: number, albedo: number): Result {
  assertFinite('flux_W_m2', flux_W_m2);
  assertFinite('albedo', albedo);
  if (flux_W_m2 < 0) throw new RangeError(`flux_W_m2 must be ≥ 0 (got ${flux_W_m2}).`);
  if (albedo < 0 || albedo > 1) throw new RangeError(`albedo must be in [0, 1] (got ${albedo}).`);

  return {
    value: ((flux_W_m2 * (1 - albedo)) / (4 * SIGMA_SB)) ** 0.25,
    unit: 'K',
    assumptions: [
      'Uniform redistribution of absorbed energy over the whole planet (factor 4).',
      `Bond albedo A = ${albedo} is an assumed value, not a measurement.`,
      'No internal heat source; planet radiates as a blackbody.',
      'No greenhouse effect (see surface temperature for the simplified greenhouse model).',
    ],
  };
}
