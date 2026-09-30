/**
 * Stellar physics — OWNED BY AGENT 1 (Star).
 *
 * Luminosity from radius and effective temperature (Stefan–Boltzmann),
 * catalog-vs-computed luminosity resolution, and the inverse-square flux law.
 * Every function is pure, takes SI, returns SI wrapped in a `Result`.
 * See DESIGN.md §6 (stellar luminosity) and §7 (stellar flux at the planet).
 */
import type { Result, Star } from './types';
import { SIGMA_SB, S_EARTH } from './constants';
import { lSunToW, rSunToM } from './units';

/** Throw a RangeError unless `x` is a finite number strictly greater than zero. */
function requirePositive(name: string, x: number): void {
  if (typeof x !== 'number' || !Number.isFinite(x) || x <= 0) {
    throw new RangeError(`${name} must be a finite number > 0 (got ${String(x)}).`);
  }
}

/**
 * Bolometric luminosity of a star from its radius and effective temperature.
 *
 * Equation (Stefan–Boltzmann law for a spherical blackbody):
 *   L = 4π R² σ T_eff⁴
 *
 * Units:
 *   - `radius_m`: stellar photospheric radius [m]
 *   - `teff_K`: effective temperature [K]
 *   - returns: luminosity [W]
 *
 * Assumptions: the star radiates as a spherical blackbody at T_eff (T_eff is
 * defined so that this holds for the bolometric output); no limb darkening,
 * spots, rotation-induced oblateness or variability.
 *
 * Valid range: any finite radius_m > 0 and teff_K > 0. Physically meaningful
 * for stars roughly 2 000–50 000 K; the Sun (R☉, 5772 K) gives 3.828e26 W.
 *
 * @throws RangeError if radius_m or teff_K is not a finite positive number.
 */
export function luminosityFromRadiusTeff(radius_m: number, teff_K: number): Result {
  requirePositive('radius_m', radius_m);
  requirePositive('teff_K', teff_K);
  const value = 4 * Math.PI * radius_m * radius_m * SIGMA_SB * teff_K ** 4;
  return {
    value,
    unit: 'W',
    assumptions: [
      'Star treated as a blackbody.',
      'Luminosity computed from stellar radius and effective temperature (L = 4πR²σT⁴).',
    ],
  };
}

/**
 * Luminosity to use for a star: the catalog/preset value if present,
 * otherwise computed from radius and T_eff.
 *
 * Equation:
 *   L = star.luminosity_Lsun × L☉                    (if luminosity_Lsun is non-null)
 *   L = 4π (star.radius_Rsun × R☉)² σ T_eff⁴         (otherwise)
 *
 * Units:
 *   - input `star` uses edge units (R☉, K, L☉), converted via units.ts
 *   - returns: luminosity [W]
 *
 * Assumptions: stated in the result — either "Luminosity taken from catalog"
 * (with the star's source) or "computed from R and Teff" (blackbody).
 * A catalog value is never cross-checked or overridden here.
 *
 * Valid range: luminosity_Lsun > 0 when given; otherwise radius_Rsun > 0 and
 * teff_K > 0.
 *
 * @throws RangeError if the value used is not a finite positive number.
 */
export function resolveLuminosity(star: Star): Result {
  if (star.luminosity_Lsun !== null && star.luminosity_Lsun !== undefined) {
    requirePositive('star.luminosity_Lsun', star.luminosity_Lsun);
    return {
      value: lSunToW(star.luminosity_Lsun),
      unit: 'W',
      assumptions: [
        `Luminosity taken from catalog (${star.source}${star.reference ? `; ${star.reference}` : ''}), not recomputed.`,
      ],
    };
  }
  requirePositive('star.radius_Rsun', star.radius_Rsun);
  requirePositive('star.teff_K', star.teff_K);
  const computed = luminosityFromRadiusTeff(rSunToM(star.radius_Rsun), star.teff_K);
  return {
    ...computed,
    assumptions: [
      'Catalog luminosity unavailable: luminosity computed from R and Teff (Stefan–Boltzmann).',
      ...computed.assumptions,
    ],
  };
}

/**
 * Bolometric stellar flux (irradiance) at a given distance from the star.
 *
 * Equation (inverse-square law):
 *   F = L / (4π r²)
 *
 * Units:
 *   - `luminosity_W`: stellar luminosity [W]
 *   - `distance_m`: star–planet distance [m]
 *   - returns: flux [W m^-2]
 *
 * Assumptions: isotropic point-source emission; no absorption between star
 * and planet; distance ≫ stellar radius. For an eccentric orbit pass the
 * instantaneous distance r(θ), not the semi-major axis.
 *
 * Valid range: luminosity_W > 0, distance_m > 0 (finite). The Sun at 1 AU
 * gives ≈ 1361 W m^-2.
 *
 * @throws RangeError if either input is not a finite positive number.
 */
export function fluxAtDistance(luminosity_W: number, distance_m: number): Result {
  requirePositive('luminosity_W', luminosity_W);
  requirePositive('distance_m', distance_m);
  return {
    value: luminosity_W / (4 * Math.PI * distance_m * distance_m),
    unit: 'W m^-2',
    assumptions: [
      'Star radiates isotropically as a point source (inverse-square law).',
      'No absorption between star and planet.',
    ],
  };
}

/**
 * Insolation relative to what Earth receives from the present-day Sun.
 *
 * Equation:
 *   S = F / S⊕ = [L / (4π r²)] / S⊕,   S⊕ = L☉ / (4π AU²) ≈ 1361 W m^-2
 * Equivalently S = (L / L☉) / (r / AU)².
 *
 * Units:
 *   - `luminosity_W`: stellar luminosity [W]
 *   - `distance_m`: star–planet distance [m]
 *   - returns: dimensionless ratio, unit "S_earth" (1 = Earth today)
 *
 * Assumptions: those of `fluxAtDistance`, plus S⊕ from IAU 2015 nominal L☉
 * and the IAU astronomical unit. Bolometric only — spectral differences
 * between star types are ignored.
 *
 * Valid range: luminosity_W > 0, distance_m > 0 (finite).
 *
 * @throws RangeError if either input is not a finite positive number.
 */
export function relativeInsolation(luminosity_W: number, distance_m: number): Result {
  const flux = fluxAtDistance(luminosity_W, distance_m);
  return {
    value: flux.value / S_EARTH,
    unit: 'S_earth',
    assumptions: [
      ...flux.assumptions,
      'Relative to the present-day solar constant at 1 AU (S⊕ = L☉/(4π AU²) ≈ 1361 W m^-2).',
      'Bolometric comparison only; spectral differences between star types are ignored.',
    ],
  };
}
