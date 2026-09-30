/**
 * Habitability classification — Owner: Agent 5 (Habitability).
 *
 * Combines five independent, model-defined checks (DESIGN.md §18) into one of three
 * labels (DESIGN.md §19) plus a confidence level (DESIGN.md §20):
 *
 * | Check        | Weight     | Pass when                                                           |
 * |--------------|------------|---------------------------------------------------------------------|
 * | temperature  | critical   | T_preferred,min ≤ T_surface ≤ T_preferred,max (273.15–323.15 K)       |
 * | liquidWater  | critical   | waterPhase === 'liquid'                                             |
 * | pressure     | supporting | P_min ≤ P_surface ≤ P_max (0.1–10 bar)                               |
 * | irradiation  | supporting | S_EarlyMars(Teff) ≤ S ≤ S_RecentVenus(Teff) (Kopparapu et al. 2014) |
 * | tidal        | supporting | locking ≠ 'likely' AND stellar tide ≤ extreme limit; 'unknown' → null |
 *
 * Classification rule (also in thresholds.json "rules"):
 *  - **Highly Habitable**: every evaluable check passes AND no critical check is null.
 *  - **Uninhabitable**: any of
 *      (a) waterPhase is 'no-liquid-below-triple-point';
 *      (b) liquidWater fails AND T is outside the EXTENDED range 253.15–373.15 K;
 *      (c) BOTH critical checks (temperature, liquidWater) fail AND irradiation fails — the planet is
 *          strongly inconsistent with the habitable ranges on several independent axes (e.g. a
 *          Venus-like planet whose one-layer model temperature lands just below freezing).
 *  - otherwise **Marginally Habitable**.
 *
 * Confidence: start 'high'; 'medium' if the atmosphere is user-assumed, any supporting check is
 * null, or the star's Teff was clamped into the Kopparapu fit range; 'low' if any critical check is
 * null or a mass/radius/eccentricity/semi-major-axis catalog field is missing ('low' wins).
 *
 * All numbers live in `thresholds.json` (each with `source` + `status`). These labels describe
 * modeled physical conditions only — they are never evidence that life exists.
 */
import thresholdsJson from './thresholds.json';
import type {
  CheckId,
  HabitabilityCheck,
  HabitabilityResult,
  HabitabilityStatus,
  Result,
  TidalLocking,
  WaterPhase,
} from './types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Inputs to {@link classifyHabitability} (frozen in AGENTS.md). */
export interface HabitabilityInputs {
  /** Modeled surface temperature [K], finite and ≥ 0 (0 K occurs for albedo = 1). */
  surfaceTemp_K: number;
  /** Water phase from `waterPhase()` (water.ts). */
  waterPhase: WaterPhase;
  /** Surface pressure [bar], finite and ≥ 0. */
  surfacePressure_bar: number;
  /** Insolation relative to Earth's (S / S⊕), finite and ≥ 0. */
  insolation_Searth: number;
  /** Stellar effective temperature [K], finite and > 0. */
  starTeff_K: number;
  /** Qualitative tidal-locking indicator (tides.ts). */
  tidalLocking: TidalLocking;
  /** Stellar tide relative to the Sun's tide on Earth (dimensionless), or null if unknown. */
  stellarTideRelEarth: number | null;
  /** true whenever pressure/greenhouse come from sliders, not measurements. */
  atmosphereAssumed: boolean;
  /** Missing catalog fields (e.g. ["pl_masse", "st_age"]). */
  missing: string[];
}

/** A value with provenance, as stored in thresholds.json. */
export interface SourcedStatus {
  source: string;
  status: 'cited' | 'needs human verification';
}
export interface SourcedRange extends SourcedStatus {
  min: number;
  max: number;
  unit: string;
  note?: string;
}
export interface SourcedValue extends SourcedStatus {
  value: number;
  unit: string;
  note?: string;
}
/** Kopparapu et al. (2014) polynomial coefficients: S_eff = S_eff⊙ + aT + bT² + cT³ + dT⁴. */
export interface KopparapuCoefficients extends SourcedStatus {
  role: string;
  SeffSun: number;
  a: number;
  b: number;
  c: number;
  d: number;
}

/** Shape of thresholds.json — the single place to tune the model. */
export interface Thresholds {
  about: string;
  rules: Record<string, string>;
  temperature: { preferred: SourcedRange; extended: SourcedRange; knownLifeUpperLimit: SourcedValue };
  liquidWater: { note: string };
  pressure: { preferred: SourcedRange };
  irradiation: {
    note: string;
    teffOffset: SourcedValue;
    teffValidRange: SourcedRange;
    recentVenus: KopparapuCoefficients;
    runawayGreenhouse1Me: KopparapuCoefficients;
    maximumGreenhouse: KopparapuCoefficients;
    earlyMars: KopparapuCoefficients;
  };
  tidal: { extremeStellarTideRelEarth: SourcedValue };
  confidence: { lowConfidenceMissingFieldPatterns: string[]; note: string };
}

/** Default model thresholds, loaded from thresholds.json. */
export const DEFAULT_THRESHOLDS: Readonly<Thresholds> = thresholdsJson as Thresholds;

/** Habitable-zone flux limits for one star (units: S⊕). */
export interface HabitableZoneLimits {
  /** Teff actually used in the polynomial (after clamping) [K]. */
  teffUsed_K: number;
  /** true if the input Teff was outside the fit's validity range and was clamped. */
  teffClamped: boolean;
  recentVenus: number;
  runawayGreenhouse: number;
  maximumGreenhouse: number;
  earlyMars: number;
}

// ---------------------------------------------------------------------------
// Formatting helpers (internal)
// ---------------------------------------------------------------------------

const C0 = 273.15;

function fmtNum(x: number, sig = 3): string {
  if (x === 0) return '0';
  const abs = Math.abs(x);
  if (abs >= 1000 && abs < 1e6) return Math.round(x).toLocaleString('en-US');
  if (abs >= 1e6 || abs < 1e-3) return x.toExponential(1);
  return String(Number(x.toPrecision(sig)));
}
function fmtK(T_K: number): string {
  return `${Math.round(T_K)} K (${Math.round(T_K - C0)} °C)`;
}
function fmtKRange(r: SourcedRange): string {
  return `${Math.round(r.min)}–${Math.round(r.max)} K (${Math.round(r.min - C0)}–${Math.round(r.max - C0)} °C)`;
}
function fmtS(s: number): string {
  return `${s.toFixed(2)} S⊕`;
}

const PHASE_LABEL: Record<WaterPhase, string> = {
  ice: 'ice (frozen)',
  liquid: 'liquid',
  vapor: 'vapor (steam)',
  'no-liquid-below-triple-point': 'no liquid possible (pressure below water’s triple point)',
};

// ---------------------------------------------------------------------------
// Validation (internal)
// ---------------------------------------------------------------------------

function requireFinite(name: string, v: number, opts: { positive?: boolean; nonNegative?: boolean }): void {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new RangeError(`classifyHabitability: ${name} must be a finite number (got ${v}).`);
  }
  if (opts.positive && v <= 0) throw new RangeError(`classifyHabitability: ${name} must be > 0 (got ${v}).`);
  if (opts.nonNegative && v < 0) throw new RangeError(`classifyHabitability: ${name} must be ≥ 0 (got ${v}).`);
}

// ---------------------------------------------------------------------------
// Habitable-zone limits (Kopparapu et al. 2014)
// ---------------------------------------------------------------------------

function seff(c: KopparapuCoefficients, tStar: number): number {
  return c.SeffSun + c.a * tStar + c.b * tStar ** 2 + c.c * tStar ** 3 + c.d * tStar ** 4;
}

/**
 * Habitable-zone insolation limits for a main-sequence star.
 *
 * Equation (Kopparapu et al. 2014, ApJL 787, L29, eq. 4 and Table 1):
 *   S_eff = S_eff⊙ + a·T⋆ + b·T⋆² + c·T⋆³ + d·T⋆⁴,   T⋆ = Teff − 5780 K.
 *
 * @param teff_K     Stellar effective temperature [K], finite and > 0.
 * @param thresholds Model thresholds (default: thresholds.json).
 * @returns Result whose value holds four limits in units of Earth's insolation (S⊕):
 *   recentVenus (optimistic inner), runawayGreenhouse (1 M⊕, conservative inner),
 *   maximumGreenhouse (conservative outer), earlyMars (optimistic outer), plus the Teff used.
 * @throws RangeError for non-finite or non-positive Teff.
 *
 * Assumptions: Earth-mass planet with an H₂O/CO₂/N₂ atmosphere, cloud-free 1-D climate model.
 * Valid range: 2600 K ≤ Teff ≤ 7200 K. Outside it Teff is clamped to the nearest edge and
 * `teffClamped` is true.
 */
export function habitableZoneLimits(
  teff_K: number,
  thresholds: Readonly<Thresholds> = DEFAULT_THRESHOLDS,
): Result<HabitableZoneLimits> {
  requireFinite('starTeff_K', teff_K, { positive: true });
  const irr = thresholds.irradiation;
  const { min, max } = irr.teffValidRange;
  const teffUsed_K = Math.min(max, Math.max(min, teff_K));
  const teffClamped = teffUsed_K !== teff_K;
  const t = teffUsed_K - irr.teffOffset.value;
  const assumptions = [
    'Habitable-zone limits from Kopparapu et al. 2014 (ApJL 787, L29): 1-D cloud-free climate model for an Earth-mass planet with an H₂O/CO₂/N₂ atmosphere.',
  ];
  if (teffClamped) {
    assumptions.push(
      `Star temperature ${Math.round(teff_K)} K is outside the fit's valid range (${min}–${max} K); ${Math.round(teffUsed_K)} K was used instead, so these limits are less reliable.`,
    );
  }
  return {
    value: {
      teffUsed_K,
      teffClamped,
      recentVenus: seff(irr.recentVenus, t),
      runawayGreenhouse: seff(irr.runawayGreenhouse1Me, t),
      maximumGreenhouse: seff(irr.maximumGreenhouse, t),
      earlyMars: seff(irr.earlyMars, t),
    },
    unit: 'S_earth',
    assumptions,
  };
}

// ---------------------------------------------------------------------------
// Individual checks (internal)
// ---------------------------------------------------------------------------

function temperatureCheck(T: number, th: Readonly<Thresholds>): { check: HabitabilityCheck; outsideExtended: boolean } {
  const p = th.temperature.preferred;
  const e = th.temperature.extended;
  const hotLimit = th.temperature.knownLifeUpperLimit;
  const passed = T >= p.min && T <= p.max;
  const outsideExtended = T < e.min || T > e.max;
  let reason: string;
  if (passed) {
    reason = `The surface temperature is between ${Math.round(p.min - C0)} °C and ${Math.round(p.max - C0)} °C, the range this model uses for comfortable conditions for Earth-like surface life.`;
  } else if (T < p.min && !outsideExtended) {
    reason = `The surface is below freezing (${Math.round(T - C0)} °C). Some hardy microbes on Earth can still grow down to about ${Math.round(e.min - C0)} °C, so this is cold but not hopeless.`;
  } else if (T > p.max && !outsideExtended) {
    reason = `The surface is hot (${Math.round(T - C0)} °C) — above the ~${Math.round(p.max - C0)} °C that most plants and animals can handle, though heat-loving microbes can survive this.`;
  } else if (T < e.min) {
    reason = `The surface is far too cold (${Math.round(T - C0)} °C) — colder than the lowest temperature (about ${Math.round(e.min - C0)} °C) at which any known cells can grow.`;
  } else {
    reason = `The surface is far too hot (${Math.round(T - C0)} °C) — above water's boiling point at Earth's pressure. The hottest any known organism has been seen to multiply is about ${Math.round(hotLimit.value - C0)} °C, and only under very high pressure.`;
  }
  return {
    check: {
      id: 'temperature',
      label: 'Surface temperature',
      passed,
      observed: fmtK(T),
      target: fmtKRange(p),
      reason,
      weight: 'critical',
    },
    outsideExtended,
  };
}

function liquidWaterCheck(phase: WaterPhase): HabitabilityCheck {
  const passed = phase === 'liquid';
  const reason: Record<WaterPhase, string> = {
    liquid: 'Water would be liquid at the surface — the key ingredient for life as we know it.',
    ice: 'Surface water would be frozen solid. Life as we know it needs liquid water (though liquid could still hide under ice, which this model does not simulate).',
    vapor: 'Surface water would boil away into steam. Life as we know it needs liquid water.',
    'no-liquid-below-triple-point':
      'The air pressure is too low for liquid water to exist at any temperature — ice would turn straight into vapor, like dry ice does.',
  };
  return {
    id: 'liquidWater',
    label: 'Liquid water',
    passed,
    observed: PHASE_LABEL[phase],
    target: 'liquid',
    reason: reason[phase],
    weight: 'critical',
  };
}

function pressureCheck(P: number, th: Readonly<Thresholds>): HabitabilityCheck {
  const r = th.pressure.preferred;
  const passed = P >= r.min && P <= r.max;
  let reason: string;
  if (passed) {
    reason = `The air pressure is in the model's preferred range: thick enough to keep liquid water from boiling away quickly, but not a crushing, heat-trapping atmosphere. (Earth is 1 bar.)`;
  } else if (P < r.min) {
    reason = `The atmosphere is very thin (below ${fmtNum(r.min)} bar). Water boils at low temperatures in thin air, so liquid water is hard to keep. (Earth is 1 bar; Mars is about 0.006 bar.)`;
  } else {
    reason = `The atmosphere is very thick (above ${fmtNum(r.max)} bar). Thick atmospheres tend to trap a lot of heat — Venus, at about 92 bar, is the extreme example. (Earth is 1 bar.)`;
  }
  return {
    id: 'pressure',
    label: 'Surface pressure',
    passed,
    observed: `${fmtNum(P)} bar`,
    target: `${fmtNum(r.min)}–${fmtNum(r.max)} bar`,
    reason,
    weight: 'supporting',
  };
}

function irradiationCheck(
  S: number,
  teff_K: number,
  th: Readonly<Thresholds>,
): { check: HabitabilityCheck; clamped: boolean } {
  const hz = habitableZoneLimits(teff_K, th).value;
  const passed = S >= hz.earlyMars && S <= hz.recentVenus;
  const inConservative = S >= hz.maximumGreenhouse && S <= hz.runawayGreenhouse;
  const cons = `${hz.maximumGreenhouse.toFixed(2)}–${hz.runawayGreenhouse.toFixed(2)} S⊕`;
  let reason: string;
  if (passed && inConservative) {
    reason = `The planet gets ${S.toFixed(2)}× the starlight Earth gets, which is inside this star's habitable zone — even the cautious (conservative) version, ${cons}.`;
  } else if (passed) {
    reason = `The planet gets ${S.toFixed(2)}× the starlight Earth gets. That is inside the optimistic habitable zone for this star, but outside the cautious (conservative) zone of ${cons}, so it is near an edge.`;
  } else if (S > hz.recentVenus) {
    reason = `The planet gets ${S.toFixed(2)}× the starlight Earth gets — more than the inner edge of this star's habitable zone (${hz.recentVenus.toFixed(2)} S⊕). Oceans would likely evaporate in a runaway greenhouse, as probably happened on Venus.`;
  } else {
    reason = `The planet gets ${S.toFixed(2)}× the starlight Earth gets — less than the outer edge of this star's habitable zone (${hz.earlyMars.toFixed(2)} S⊕). Even a thick CO₂ atmosphere probably could not keep it warm enough for liquid water.`;
  }
  reason += ` Cooler stars give off redder light that planets absorb more easily, so the zone's edges depend on the star's temperature.`;
  if (hz.teffClamped) {
    reason += ` Note: the star's temperature (${Math.round(teff_K)} K) is outside the range the habitable-zone formula was built for (${th.irradiation.teffValidRange.min}–${th.irradiation.teffValidRange.max} K), so ${Math.round(hz.teffUsed_K)} K was used and these limits are less reliable.`;
  }
  return {
    check: {
      id: 'irradiation',
      label: 'Starlight received',
      passed,
      observed: fmtS(S),
      target: `${hz.earlyMars.toFixed(2)}–${hz.recentVenus.toFixed(2)} S⊕ (optimistic habitable zone; conservative ${cons})`,
      reason,
      weight: 'supporting',
    },
    clamped: hz.teffClamped,
  };
}

function tidalCheck(locking: TidalLocking, tideRel: number | null, th: Readonly<Thresholds>): HabitabilityCheck {
  const limit = th.tidal.extremeStellarTideRelEarth.value;
  const extreme = tideRel !== null && tideRel > limit;
  const heat =
    'A tidally locked planet always shows the same face to its star (one side in permanent day, the other in permanent night). That is a risk, not a death sentence: a thick enough atmosphere or ocean can carry heat around to the night side, and the day–night boundary could stay mild.';
  const parts: string[] = [];
  let passed: boolean | null;
  if (locking === 'likely') {
    passed = false;
    parts.push(`Tidal locking is likely. ${heat}`);
  } else if (locking === 'unknown') {
    passed = null;
    parts.push('Tidal locking cannot be judged because the planet’s mass or radius is unknown.');
  } else if (locking === 'possible') {
    passed = true;
    parts.push('Tidal locking is possible but not likely, so the planet probably still has a day–night cycle — though this is uncertain.');
  } else {
    passed = true;
    parts.push('Tidal locking is unlikely, so the planet probably has a normal day–night cycle.');
  }
  if (extreme) {
    passed = false;
    parts.push(
      `The star's tidal pull is extreme (${fmtNum(tideRel)}× the Sun's tide on Earth, above this model's limit of ${fmtNum(limit)}×). Strong tides can squeeze and heat a planet's interior, driving intense volcanism.`,
    );
  }
  const tideText = tideRel === null ? 'stellar tide unknown' : `stellar tide ${fmtNum(tideRel)}× Earth's`;
  return {
    id: 'tidal',
    label: 'Tidal environment',
    passed,
    observed: `locking: ${locking}; ${tideText}`,
    target: `locking not likely; stellar tide ≤ ${fmtNum(limit)}× Earth's`,
    reason: parts.join(' '),
    weight: 'supporting',
  };
}

// ---------------------------------------------------------------------------
// Combination
// ---------------------------------------------------------------------------

/** Extra facts needed by {@link combineChecks} beyond the checks themselves. */
export interface CombineContext {
  /** Surface temperature outside the EXTENDED range (null if temperature unknown). */
  tempOutsideExtended: boolean | null;
  /** waterPhase === 'no-liquid-below-triple-point'. */
  belowTriplePoint: boolean;
  atmosphereAssumed: boolean;
  teffClamped: boolean;
  missing: string[];
}

const DISCLAIMERS: Record<HabitabilityStatus, string> = {
  'Highly Habitable':
    'Highly habitable according to this simplified model — not evidence that this planet contains life.',
  'Marginally Habitable':
    'Marginally habitable according to this simplified model — a model output about physical conditions, not evidence that this planet does or does not contain life.',
  Uninhabitable:
    'Uninhabitable according to this simplified model — a model output about physical conditions, not evidence about whether life exists there.',
};

/**
 * Combine evaluated checks into a status, confidence and disclaimer. Pure.
 *
 * Status rule:
 *  - Uninhabitable if (a) ctx.belowTriplePoint, or (b) the liquidWater check fails AND
 *    ctx.tempOutsideExtended, or (c) the temperature, liquidWater AND irradiation checks all fail.
 *  - Highly Habitable if every non-null check passes AND no critical check is null.
 *  - Marginally Habitable otherwise.
 * Confidence rule: see module header ('low' > 'medium' > 'high').
 *
 * Units: none — inputs are already-evaluated checks (booleans/null with display strings) and
 * boolean context flags; `ctx.missing` holds catalog field names. Output is categorical.
 *
 * Assumptions: checks are independent; a null (`cannot evaluate`) check is never treated as a
 * pass or a fail; a failed check absent from `checks` is simply not considered. The labels are
 * model-defined and never evidence that life exists.
 *
 * Valid range: any set of 0–5 checks with unique ids; intended for the five CheckIds produced by
 * {@link classifyHabitability}.
 *
 * @param checks Evaluated checks (any order).
 * @param ctx    Context flags (see {@link CombineContext}).
 * @param thresholds Model thresholds (for the missing-field patterns).
 */
export function combineChecks(
  checks: HabitabilityCheck[],
  ctx: CombineContext,
  thresholds: Readonly<Thresholds> = DEFAULT_THRESHOLDS,
): HabitabilityResult {
  const byId = new Map<CheckId, HabitabilityCheck>(checks.map((c) => [c.id, c]));
  const liquid = byId.get('liquidWater');
  const temperature = byId.get('temperature');
  const irradiation = byId.get('irradiation');
  const multiAxisFailure =
    temperature?.passed === false && liquid?.passed === false && irradiation?.passed === false;
  const criticalNull = checks.filter((c) => c.weight === 'critical' && c.passed === null);
  const supportingNull = checks.filter((c) => c.weight === 'supporting' && c.passed === null);

  let status: HabitabilityStatus;
  if (
    ctx.belowTriplePoint ||
    (liquid?.passed === false && ctx.tempOutsideExtended === true) ||
    multiAxisFailure
  ) {
    status = 'Uninhabitable';
  } else if (checks.every((c) => c.passed !== false) && criticalNull.length === 0) {
    status = 'Highly Habitable';
  } else {
    status = 'Marginally Habitable';
  }

  const patterns = thresholds.confidence.lowConfidenceMissingFieldPatterns.map((p) => p.toLowerCase());
  const keyMissing = ctx.missing.filter((f) => patterns.some((p) => f.toLowerCase().includes(p)));

  const reasons: string[] = [];
  let low = false;
  let medium = false;
  if (criticalNull.length > 0) {
    low = true;
    reasons.push(`A critical condition could not be evaluated: ${criticalNull.map((c) => c.label.toLowerCase()).join(', ')}.`);
  }
  if (keyMissing.length > 0) {
    low = true;
    reasons.push(`Key planet or orbit data are missing from the catalog (${keyMissing.join(', ')}).`);
  }
  if (ctx.atmosphereAssumed) {
    medium = true;
    reasons.push(
      'Atmosphere is user-assumed, not measured (pressure and greenhouse strength come from sliders) — Prototype 1 confidence is at most medium.',
    );
  }
  if (supportingNull.length > 0) {
    medium = true;
    reasons.push(`Some supporting conditions could not be evaluated: ${supportingNull.map((c) => c.label.toLowerCase()).join(', ')}.`);
  }
  if (ctx.teffClamped) {
    medium = true;
    reasons.push("The star's temperature is outside the range the habitable-zone formula was built for, so the starlight limits are extrapolated.");
  }
  const confidence: HabitabilityResult['confidence'] = low ? 'low' : medium ? 'medium' : 'high';
  if (confidence === 'high') reasons.push('All inputs are measured or well-defined and every check could be evaluated.');

  return { status, checks, confidence, confidenceReasons: reasons, disclaimer: DISCLAIMERS[status] };
}

/**
 * Classify modeled planetary conditions as Uninhabitable / Marginally Habitable / Highly Habitable.
 *
 * Runs five independent checks (temperature, liquid water, pressure, irradiation, tidal) against
 * `thresholds` and combines them with {@link combineChecks}. See the module header for the exact
 * pass criteria, classification rule and confidence rule.
 *
 * Units: surfaceTemp_K [K]; surfacePressure_bar [bar]; insolation_Searth [S/S⊕]; starTeff_K [K];
 * stellarTideRelEarth [dimensionless, relative to the Sun's tide on Earth].
 *
 * Assumptions: thresholds are model choices for Earth-like surface life (see thresholds.json for
 * the source/status of each number); biological habitability is NOT predicted.
 * Valid range: any physical inputs; habitable-zone limits valid for 2600–7200 K (clamped outside).
 *
 * @throws RangeError on non-finite numbers, T < 0 K, P < 0, S < 0, Teff ≤ 0 or a negative tide.
 *   (T = 0 K is accepted: it is what the equilibrium model returns for albedo = 1.)
 */
export function classifyHabitability(
  inputs: HabitabilityInputs,
  thresholds: Readonly<Thresholds> = DEFAULT_THRESHOLDS,
): HabitabilityResult {
  // 0 K is a legitimate model output (e.g. albedo = 1 → no absorbed starlight), so only negatives are rejected.
  requireFinite('surfaceTemp_K', inputs.surfaceTemp_K, { nonNegative: true });
  requireFinite('surfacePressure_bar', inputs.surfacePressure_bar, { nonNegative: true });
  requireFinite('insolation_Searth', inputs.insolation_Searth, { nonNegative: true });
  requireFinite('starTeff_K', inputs.starTeff_K, { positive: true });
  if (inputs.stellarTideRelEarth !== null) {
    requireFinite('stellarTideRelEarth', inputs.stellarTideRelEarth, { nonNegative: true });
  }

  const temp = temperatureCheck(inputs.surfaceTemp_K, thresholds);
  const irr = irradiationCheck(inputs.insolation_Searth, inputs.starTeff_K, thresholds);
  const checks: HabitabilityCheck[] = [
    temp.check,
    liquidWaterCheck(inputs.waterPhase),
    pressureCheck(inputs.surfacePressure_bar, thresholds),
    irr.check,
    tidalCheck(inputs.tidalLocking, inputs.stellarTideRelEarth, thresholds),
  ];
  return combineChecks(
    checks,
    {
      tempOutsideExtended: temp.outsideExtended,
      belowTriplePoint: inputs.waterPhase === 'no-liquid-below-triple-point',
      atmosphereAssumed: inputs.atmosphereAssumed,
      teffClamped: irr.clamped,
      missing: inputs.missing,
    },
    thresholds,
  );
}
