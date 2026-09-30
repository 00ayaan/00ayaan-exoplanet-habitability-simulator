/**
 * SIMPLIFIED ONE-LAYER GREENHOUSE MODEL — educational approximation only.
 * This is NOT radiative transfer and NOT a climate model. Owner: Agent 3 (Climate).
 * See DESIGN.md §11 (greenhouse) and §12 (pressure).
 *
 * Model: a single isothermal atmospheric layer, transparent to starlight, with
 * infrared emissivity ε, over a blackbody surface. Energy balance gives
 *
 *   T_s = [(1 − A)·F / (4σ(1 − ε/2))]^¼ = T_eq · (2 / (2 − ε))^¼
 *
 * Known limits (by construction):
 *  - Maximum warming factor is 2^¼ ≈ 1.189 (ε = 1). With Venus-like inputs
 *    (A ≈ 0.77, T_eq ≈ 227 K) this gives at most ≈ 270 K, far below Venus's
 *    ≈ 737 K: thick, optically deep atmospheres cannot be reproduced.
 *  - No pressure dependence: surface pressure does not enter the temperature.
 *    We deliberately do not invent a pressure→temperature relation (DESIGN §12).
 *  - No water-vapor (or any) feedback loop; the T → H₂O → greenhouse feedback
 *    is future work (DESIGN §14).
 *  - No clouds, no lapse rate, no convection, no spectral (band) dependence;
 *    albedo is fixed and independent of the atmosphere.
 */
import type { Result } from './types';
import { DEFAULT_ALBEDO } from './types';
import { S_EARTH, SIGMA_SB } from './constants';
import { equilibriumTemperature } from './planet';

/** Earth's global mean surface temperature used as the calibration target [K]. */
const EARTH_CALIBRATION_SURFACE_TEMP_K = 288;

/**
 * Greenhouse slider value that reproduces Earth's ≈ 288 K mean surface temperature.
 *
 * Derivation: for a Sun-like star at 1 AU, F = S_EARTH = L_SUN / (4π AU²) ≈ 1361 W m^-2,
 * and A = 0.30 (DEFAULT_ALBEDO), T_eq = [S(1 − A)/(4σ)]^¼ ≈ 254.6 K. Setting
 * T_s = T_eq (2/(2 − ε))^¼ = 288 K and solving for ε:
 *
 *   ε = 2 · (1 − (T_eq / 288)⁴)  ≈ 0.78
 *
 * Because `greenhouseToEpsilon` is the identity, this ε is also the slider value.
 * Computed from constants at module load, not hard-coded.
 */
export const EARTH_GREENHOUSE: number =
  2 * (1 - ((S_EARTH * (1 - DEFAULT_ALBEDO)) / (4 * SIGMA_SB)) / EARTH_CALIBRATION_SURFACE_TEMP_K ** 4);

/**
 * Map the normalized UI greenhouse strength to the one-layer IR emissivity ε.
 *
 * Mapping: ε = greenhouse (identity). This is the simplest defensible choice:
 * the slider directly IS the one-layer atmospheric emissivity, so there is no
 * hidden calibration curve. 0 = no greenhouse effect, 1 = fully IR-opaque layer.
 *
 * @param greenhouse Normalized greenhouse strength, dimensionless, in [0, 1].
 * @returns `Result` — ε, dimensionless (unit ""), in [0, 1].
 * @throws RangeError if greenhouse is non-finite or outside [0, 1].
 */
export function greenhouseToEpsilon(greenhouse: number): Result {
  if (!Number.isFinite(greenhouse) || greenhouse < 0 || greenhouse > 1) {
    throw new RangeError(`greenhouse must be in [0, 1] (got ${greenhouse}).`);
  }
  return {
    value: greenhouse,
    unit: '',
    assumptions: [
      'Greenhouse slider maps directly to one-layer infrared emissivity (ε = greenhouse).',
      'Greenhouse strength is an assumed parameter, not derived from atmospheric composition.',
    ],
  };
}

/**
 * Surface temperature from the SIMPLIFIED one-layer greenhouse model (DESIGN.md §11).
 *
 * Equation: T_s = [(1 − A)·F / (4σ(1 − ε/2))]^¼ = T_eq · (2 / (2 − ε))^¼
 *
 * @param flux_W_m2 Stellar flux at the planet [W m^-2], ≥ 0.
 * @param albedo    Bond albedo, dimensionless, in [0, 1].
 * @param epsilon   One-layer atmospheric IR emissivity, dimensionless, in [0, 1].
 * @returns `Result` — T_s [K]. ε = 0 gives T_eq; ε = 1 gives 2^¼ · T_eq (the model maximum).
 *
 * Assumptions / limits: single isothermal layer transparent to starlight; uniform
 * redistribution; fixed albedo; no pressure dependence, no water-vapor feedback,
 * no clouds. Cannot exceed 1.19 · T_eq, so it cannot reproduce Venus (≈ 737 K).
 *
 * @throws RangeError if flux < 0, albedo outside [0, 1], or epsilon outside [0, 1].
 */
export function surfaceTemperature(flux_W_m2: number, albedo: number, epsilon: number): Result {
  if (!Number.isFinite(epsilon) || epsilon < 0 || epsilon > 1) {
    throw new RangeError(`epsilon must be in [0, 1] (got ${epsilon}).`);
  }
  const teq = equilibriumTemperature(flux_W_m2, albedo); // validates flux and albedo
  return {
    value: ((flux_W_m2 * (1 - albedo)) / (4 * SIGMA_SB * (1 - epsilon / 2))) ** 0.25,
    unit: 'K',
    assumptions: [
      'SIMPLIFIED one-layer greenhouse model — not radiative transfer or a climate model.',
      `Atmospheric infrared emissivity ε = ${epsilon.toFixed(3)} (assumed); maximum warming is 2^¼ ≈ 1.19 × T_eq.`,
      'Surface pressure does not affect temperature in this model.',
      'No water-vapor feedback and no clouds.',
      ...teq.assumptions.filter((a) => !a.startsWith('No greenhouse effect')),
    ],
  };
}
