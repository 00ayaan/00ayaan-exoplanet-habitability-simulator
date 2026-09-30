/**
 * Tidal environment — Owner: Agent 4 (Water & Tides).
 *
 * Tidal accelerations use the differential point-mass (leading-order) approximation
 * (DESIGN.md §15):  a_tide ≈ 2 G M R_p / r³ , valid for R_p ≪ r.
 *
 * The tidal-locking indicator is QUALITATIVE (DESIGN.md §17). It bins an
 * order-of-magnitude despinning timescale (Gladman et al. 1996, Icarus 122, 166,
 * eq. 9; the same form is used by e.g. Barnes 2017, Celest. Mech. Dyn. Astron. 129, 509):
 *
 *     t_lock ≈ ω₀ a⁶ I Q / (3 G M★² k₂ R_p⁵),   I = α M_p R_p²
 *
 * The timescale itself is never returned — only a category — because Q and k₂
 * are unknown for exoplanets and the estimate is uncertain by a factor ~100 or more.
 */
import { AU, G, M_SUN, R_EARTH, YEAR } from './constants';
import type { MoonSpec, Result, TidalLocking } from './types';

const ACCEL_UNIT = 'm s^-2';

function requirePositive(name: string, v: number, fn: string): void {
  if (!Number.isFinite(v) || v <= 0) {
    throw new RangeError(`${fn}: ${name} must be a finite number > 0 (got ${v}).`);
  }
}

/**
 * Differential (tidal) acceleration across a planet due to a perturbing point mass.
 *
 * Equation: a_tide ≈ 2 G M R_p / r³ (leading term of the expansion of G M / r² across the
 * planet's radius; DESIGN.md §15).
 *
 * @param perturberMass_kg Mass of the perturbing body M [kg], > 0.
 * @param planetRadius_m   Radius of the planet R_p [m], > 0.
 * @param distance_m       Centre-to-centre distance r [m], > 0.
 * @returns Result in m s^-2.
 * @throws RangeError for non-positive or non-finite inputs.
 *
 * Valid range: R_p ≪ r (point-mass, leading-order approximation). Circular separation assumed.
 */
export function tidalAcceleration(perturberMass_kg: number, planetRadius_m: number, distance_m: number): Result {
  const fn = 'tidalAcceleration';
  requirePositive('perturberMass_kg', perturberMass_kg, fn);
  requirePositive('planetRadius_m', planetRadius_m, fn);
  requirePositive('distance_m', distance_m, fn);
  const value = (2 * G * perturberMass_kg * planetRadius_m) / distance_m ** 3;
  const assumptions = [
    'Tidal acceleration approximated with a point-mass relationship: a ≈ 2GMR/r³ (leading order, R ≪ r).',
  ];
  if (planetRadius_m > 0.1 * distance_m) {
    assumptions.push('Planet radius is not small compared with the separation; the leading-order tidal approximation is poor here.');
  }
  return { value, unit: ACCEL_UNIT, assumptions };
}

/**
 * Reference: the Sun's tidal acceleration on Earth, 2 G M☉ R⊕ / (1 AU)³ ≈ 5.05e-7 m s^-2.
 * Derived from constants.ts, not hard-coded.
 */
const SUN_TIDE_ON_EARTH_M_S2 = (2 * G * M_SUN * R_EARTH) / AU ** 3;

/**
 * Stellar tide expressed relative to the Sun's tide on Earth.
 *
 * Equation: ratio = a_tide / (2 G M☉ R⊕ / AU³), with M☉, R⊕, AU from constants.ts.
 *
 * @param stellarTide_m_s2 Stellar tidal acceleration [m s^-2], finite and ≥ 0.
 * @returns Dimensionless Result (unit ""), 1 = Earth's solar tide.
 * @throws RangeError for negative or non-finite input.
 */
export function stellarTideRelativeToEarth(stellarTide_m_s2: number): Result {
  if (!Number.isFinite(stellarTide_m_s2) || stellarTide_m_s2 < 0) {
    throw new RangeError(`stellarTideRelativeToEarth: stellarTide_m_s2 must be a finite number ≥ 0 (got ${stellarTide_m_s2}).`);
  }
  return {
    value: stellarTide_m_s2 / SUN_TIDE_ON_EARTH_M_S2,
    unit: '',
    assumptions: [
      `Relative to the Sun's tide on Earth, 2GM☉R⊕/AU³ ≈ ${SUN_TIDE_ON_EARTH_M_S2.toExponential(3)} m s^-2 (point-mass approximation).`,
    ],
  };
}

/**
 * Tidal acceleration on the planet from its moon, if one is specified.
 *
 * - `{kind: 'unknown'}` → value null, "Moon status unknown — no exomoon assumed" (DESIGN.md §16).
 * - `{kind: 'none'}`    → value null, "No moon".
 * - `{kind: 'custom'}`  → a ≈ 2 G M_moon R_p / d³ via {@link tidalAcceleration}.
 * - planet radius null  → value null with a note (never guessed).
 *
 * @param moon           Moon specification from the contract.
 * @param planetRadius_m Planet radius [m], or null if unknown.
 * @returns Result<number | null> in m s^-2.
 * @throws RangeError (from tidalAcceleration) for a custom moon with non-positive mass/distance,
 *         or a non-positive planet radius.
 */
export function moonTide(moon: MoonSpec, planetRadius_m: number | null): Result<number | null> {
  switch (moon.kind) {
    case 'unknown':
      return { value: null, unit: ACCEL_UNIT, assumptions: ['Moon status unknown — no exomoon assumed.'] };
    case 'none':
      return { value: null, unit: ACCEL_UNIT, assumptions: ['No moon.'] };
    case 'custom': {
      if (planetRadius_m === null) {
        return {
          value: null,
          unit: ACCEL_UNIT,
          assumptions: [`Planet radius unknown — tide from moon "${moon.label}" cannot be computed.`],
        };
      }
      const r = tidalAcceleration(moon.mass_kg, planetRadius_m, moon.distance_m);
      return {
        value: r.value,
        unit: ACCEL_UNIT,
        assumptions: [`User-specified moon "${moon.label}" (hypothetical, not observed).`, ...r.assumptions],
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Tidal locking (qualitative)
// ---------------------------------------------------------------------------

/** Assumed tidal dissipation factor Q (Gladman et al. 1996 use Q ≈ 100 for rocky bodies). */
const ASSUMED_Q = 100;
/** Assumed Love number k₂ (Gladman et al. 1996 rocky-body value ≈ 0.3). */
const ASSUMED_K2 = 0.3;
/** Assumed moment-of-inertia coefficient α in I = α M R² (Earth ≈ 0.33). */
const ASSUMED_ALPHA = 0.33;
/** Assumed initial rotation period [s] (12 h). */
const INITIAL_ROTATION_PERIOD_S = 12 * 3600;
/** Fractional tolerance for treating a measured rotation period as synchronous. */
const SYNC_TOLERANCE = 0.05;
/** Absolute bins used when the system age is unknown [yr]. */
const LIKELY_BELOW_YR = 1e9;
const POSSIBLE_BELOW_YR = 1e11;

/**
 * Order-of-magnitude despinning timescale [yr] (Gladman et al. 1996, eq. 9).
 * Internal only — never exposed as a displayed value.
 */
function despinTimescale_yr(starMass_kg: number, a_m: number, planetMass_kg: number, planetRadius_m: number): number {
  const omega0 = (2 * Math.PI) / INITIAL_ROTATION_PERIOD_S;
  const I = ASSUMED_ALPHA * planetMass_kg * planetRadius_m ** 2;
  const t_s = (omega0 * a_m ** 6 * I * ASSUMED_Q) / (3 * G * starMass_kg ** 2 * ASSUMED_K2 * planetRadius_m ** 5);
  return t_s / YEAR;
}

/**
 * QUALITATIVE tidal-locking indicator (DESIGN.md §17). Does not report a locking time.
 *
 * Decision order:
 *  1. Measured rotation period within 5% of the orbital period → `'likely'` ("measured synchronous rotation").
 *     A measured rotation period that is clearly not synchronous → `'unlikely'` (it is observed not to be
 *     synchronously rotating now, though it may be in a spin–orbit resonance such as Mercury's 3:2).
 *  2. Planet mass or radius unknown → `'unknown'`.
 *  3. Otherwise estimate t_lock ≈ ω₀ a⁶ I Q / (3 G M★² k₂ R_p⁵), I = 0.33 M_p R_p²,
 *     Q = 100, k₂ = 0.3, ω₀ = 2π / 12 h (Gladman et al. 1996; Barnes 2017) and bin it:
 *     - age known:   t_lock < age → `'likely'`; t_lock < 10 × age → `'possible'`; else `'unlikely'`.
 *     - age unknown: t_lock < 1e9 yr → `'likely'`; < 1e11 yr → `'possible'`; else `'unlikely'`.
 *
 * @param p.starMass_kg      Stellar mass [kg], > 0.
 * @param p.a_m              Semi-major axis [m], > 0.
 * @param p.planetMass_kg    Planet mass [kg] or null.
 * @param p.planetRadius_m   Planet radius [m] or null.
 * @param p.systemAge_yr     System age [yr] or null.
 * @param p.rotationPeriod_s Measured rotation period [s] or null.
 * @param p.orbitalPeriod_s  Orbital period [s], > 0.
 * @returns Categorical Result<TidalLocking>, unit "".
 * @throws RangeError for non-positive/non-finite required inputs or non-positive non-null optionals.
 *
 * Valid range: rocky planets on near-circular orbits; the timescale is uncertain by a factor ~100 or more.
 */
export function tidalLockingIndicator(p: {
  starMass_kg: number;
  a_m: number;
  planetMass_kg: number | null;
  planetRadius_m: number | null;
  systemAge_yr: number | null;
  rotationPeriod_s: number | null;
  orbitalPeriod_s: number;
}): Result<TidalLocking> {
  const fn = 'tidalLockingIndicator';
  requirePositive('starMass_kg', p.starMass_kg, fn);
  requirePositive('a_m', p.a_m, fn);
  requirePositive('orbitalPeriod_s', p.orbitalPeriod_s, fn);
  if (p.planetMass_kg !== null) requirePositive('planetMass_kg', p.planetMass_kg, fn);
  if (p.planetRadius_m !== null) requirePositive('planetRadius_m', p.planetRadius_m, fn);
  if (p.systemAge_yr !== null) requirePositive('systemAge_yr', p.systemAge_yr, fn);
  if (p.rotationPeriod_s !== null) requirePositive('rotationPeriod_s', p.rotationPeriod_s, fn);

  const qualitative = 'QUALITATIVE indicator only — no exact tidal-locking time is computed or shown.';

  if (p.rotationPeriod_s !== null) {
    const mismatch = Math.abs(p.rotationPeriod_s - p.orbitalPeriod_s) / p.orbitalPeriod_s;
    if (mismatch <= SYNC_TOLERANCE) {
      return {
        value: 'likely',
        unit: '',
        assumptions: [qualitative, 'Measured synchronous rotation: rotation period within 5% of the orbital period.'],
      };
    }
    return {
      value: 'unlikely',
      unit: '',
      assumptions: [
        qualitative,
        'Measured rotation period differs from the orbital period by more than 5%, so the planet is not synchronously rotating (it may still be in a spin–orbit resonance, e.g. Mercury 3:2).',
      ],
    };
  }

  if (p.planetMass_kg === null || p.planetRadius_m === null) {
    const missing = [p.planetMass_kg === null ? 'mass' : null, p.planetRadius_m === null ? 'radius' : null]
      .filter(Boolean)
      .join(' and ');
    return {
      value: 'unknown',
      unit: '',
      assumptions: [qualitative, `Planet ${missing} unknown — tidal-locking tendency cannot be estimated.`],
    };
  }

  const t_yr = despinTimescale_yr(p.starMass_kg, p.a_m, p.planetMass_kg, p.planetRadius_m);
  const assumptions = [
    qualitative,
    'Based on an order-of-magnitude despinning timescale t ≈ ω₀a⁶IQ/(3GM★²k₂R⁵) (Gladman et al. 1996, Icarus 122, 166; cf. Barnes 2017).',
    `Assumed tidal dissipation Q = ${ASSUMED_Q}, Love number k₂ = ${ASSUMED_K2}, moment of inertia I = ${ASSUMED_ALPHA}·M·R², initial rotation period 12 h.`,
    'Q and k₂ are unknown for exoplanets; the timescale is uncertain by a factor of ~100 or more. Eccentricity, atmospheric tides and spin–orbit resonances are ignored.',
  ];

  let value: TidalLocking;
  if (p.systemAge_yr !== null) {
    if (t_yr < p.systemAge_yr) value = 'likely';
    else if (t_yr < 10 * p.systemAge_yr) value = 'possible';
    else value = 'unlikely';
    assumptions.push('Binned against the system age: likely if the estimated timescale is shorter than the age, possible if within 10× the age.');
  } else {
    if (t_yr < LIKELY_BELOW_YR) value = 'likely';
    else if (t_yr < POSSIBLE_BELOW_YR) value = 'possible';
    else value = 'unlikely';
    assumptions.push('System age unknown: binned as likely below ~1 Gyr, possible between ~1 and ~100 Gyr, unlikely above.');
  }
  return { value, unit: '', assumptions };
}
