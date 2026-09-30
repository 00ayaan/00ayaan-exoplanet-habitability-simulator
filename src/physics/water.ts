/**
 * Water phase at the planetary surface — Owner: Agent 4 (Water & Tides).
 *
 * Prototype 1 (DESIGN.md §13) uses APPROXIMATE fixed thresholds:
 *   ice    T < 273.15 K
 *   liquid 273.15 K ≤ T ≤ 373.15 K
 *   vapor  T > 373.15 K
 * plus one hard physical rule: below the triple-point pressure of water
 * (611.657 Pa ≈ 0.00611657 bar, IAPWS) liquid water cannot exist at any
 * temperature — ice sublimates directly to vapor.
 *
 * The thresholds are the melting and boiling points at 1 atm and are NOT
 * universal boundaries: the boiling point rises with pressure (≈ 453 K at
 * 10 bar) and falls with it (≈ 354 K at 0.5 bar). The decision logic lives
 * behind the internal `PhaseModel` strategy so a vapor-pressure model
 * (Clausius–Clapeyron, or the IAPWS-95 / IAPWS R14-08 saturation and melting
 * curves; Wagner & Pruß 2002, J. Phys. Chem. Ref. Data 31, 387) can replace
 * `thresholdModel` later without changing `waterPhase`'s signature.
 */
import { WATER_TRIPLE_POINT_BAR } from './constants';
import type { Result, WaterPhase } from './types';

/** Approximate melting point of water at ~1 atm [K]. */
const MELTING_POINT_K = 273.15;
/** Approximate boiling point of water at ~1 atm [K]. */
const BOILING_POINT_K = 373.15;
/** Pressure range [bar] within which the fixed 373.15 K boiling threshold is treated as acceptable. */
const NEAR_ONE_BAR_MIN = 0.5;
const NEAR_ONE_BAR_MAX = 2;

/**
 * Internal strategy for deciding water phase. Not exported as part of the
 * frozen contract; kept as an interface so a more physical model can be
 * substituted in one place.
 */
interface PhaseModel {
  /** Short identifier, surfaced in assumptions. */
  readonly name: string;
  /** Inputs are pre-validated: T_K ≥ 0 and finite, P_bar ≥ 0 and finite. */
  classify(T_K: number, P_bar: number): { phase: WaterPhase; assumptions: string[] };
}

/**
 * Prototype threshold model (DESIGN.md §13). APPROXIMATE.
 * Future: replace with a saturation-curve model (Clausius–Clapeyron / IAPWS).
 */
const thresholdModel: PhaseModel = {
  name: 'fixed-threshold (prototype)',
  classify(T_K, P_bar) {
    const assumptions: string[] = [
      'APPROXIMATE: simplified water-phase model with fixed thresholds (ice < 273.15 K ≤ liquid ≤ 373.15 K < vapor); these are the 1-atm melting and boiling points, not universal boundaries.',
      'Pure water assumed (salts or other solutes would lower the freezing point).',
    ];

    if (P_bar < WATER_TRIPLE_POINT_BAR) {
      assumptions.push(
        `Surface pressure ${P_bar} bar is below the triple-point pressure of water (${WATER_TRIPLE_POINT_BAR} bar, IAPWS): liquid water cannot exist at any temperature; ice would sublimate directly to vapor.`,
      );
      return { phase: 'no-liquid-below-triple-point', assumptions };
    }

    if (P_bar < NEAR_ONE_BAR_MIN || P_bar > NEAR_ONE_BAR_MAX) {
      assumptions.push(
        `Surface pressure ${P_bar} bar is far from ~1 bar: the fixed 373.15 K boiling threshold is only valid near 1 bar. The true boiling point shifts with pressure (lower at low pressure, higher at high pressure), so the liquid/vapor boundary here is especially uncertain.`,
      );
    }

    let phase: WaterPhase;
    if (T_K < MELTING_POINT_K) phase = 'ice';
    else if (T_K <= BOILING_POINT_K) phase = 'liquid';
    else phase = 'vapor';
    return { phase, assumptions };
  },
};

/** The model currently used by `waterPhase`. Swap here to upgrade. */
const activeModel: PhaseModel = thresholdModel;

/**
 * Classify the phase of surface water from surface temperature and pressure.
 *
 * Rules (APPROXIMATE, Prototype 1 — DESIGN.md §13):
 *  1. P < P_triple (0.00611657 bar) → `'no-liquid-below-triple-point'` at any T.
 *  2. Otherwise T < 273.15 K → `'ice'`; 273.15 ≤ T ≤ 373.15 K → `'liquid'`; T > 373.15 K → `'vapor'`
 *     (both boundaries inclusive for liquid).
 *  3. If P lies outside 0.5–2 bar an extra assumption notes that the fixed boiling threshold
 *     is only valid near 1 bar.
 *
 * @param surfaceTemp_K       Surface temperature [K]. Must be finite and ≥ 0 (0 K is a valid model output, e.g. albedo = 1).
 * @param surfacePressure_bar Surface pressure [bar]. Must be finite and ≥ 0.
 * @returns Result with categorical `value` (WaterPhase), unit `""`, and assumptions.
 * @throws RangeError for non-finite inputs, T < 0 K, or P < 0.
 *
 * Valid range: any physical (T, P); accuracy is only reasonable near 1 bar.
 */
export function waterPhase(surfaceTemp_K: number, surfacePressure_bar: number): Result<WaterPhase> {
  if (!Number.isFinite(surfaceTemp_K) || surfaceTemp_K < 0) {
    throw new RangeError(`waterPhase: surfaceTemp_K must be a finite number ≥ 0 K (got ${surfaceTemp_K}).`);
  }
  if (!Number.isFinite(surfacePressure_bar) || surfacePressure_bar < 0) {
    throw new RangeError(`waterPhase: surfacePressure_bar must be a finite number ≥ 0 (got ${surfacePressure_bar}).`);
  }
  const { phase, assumptions } = activeModel.classify(surfaceTemp_K, surfacePressure_bar);
  return { value: phase, unit: '', assumptions: [`Water-phase model: ${activeModel.name}.`, ...assumptions] };
}
