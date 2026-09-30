/**
 * SHARED CONTRACT — OWNED BY AGENT 0. Every other agent codes against this file.
 * Changes go through Agent 0 (see AGENTS.md). Do not edit in a module agent.
 *
 * Unit rules (DESIGN.md §Units):
 *   - Contract objects below use "edge units": AU, R_sun, M_sun, L_sun,
 *     R_earth, M_earth, bar, days. Field names carry the unit suffix.
 *   - Physics functions take and return SI (m, kg, s, K, W, W/m², Pa, m/s²),
 *     with the unit as a parameter-name suffix (e.g. `radius_m`).
 *   - Conversions happen only through src/physics/units.ts.
 *
 * Every physics function is pure and deterministic, and returns a Result
 * (value + unit + assumptions), never a bare number, so assumptions travel
 * with the value all the way to the UI.
 */

// ---------------------------------------------------------------------------
// Core result wrapper
// ---------------------------------------------------------------------------

export interface Result<T = number> {
  value: T;
  /** Unit string, e.g. "K", "W m^-2", "S_earth", "" for dimensionless/categorical. */
  unit: string;
  /** Human-readable assumptions behind this value. May be empty, never undefined. */
  assumptions: string[];
}

/** Measured value with optional asymmetric uncertainty (err1 = +, err2 = −, as in the NASA archive). */
export interface Measured {
  value: number;
  errPlus?: number | null;
  errMinus?: number | null;
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export type StarType = 'M' | 'K' | 'G' | 'F' | 'A' | 'B' | 'O' | 'WD';

export const STAR_TYPES: readonly StarType[] = ['M', 'K', 'G', 'F', 'A', 'B', 'O', 'WD'] as const;

export interface Star {
  name: string;
  /** Preset class, or the archive's spectral-type string (e.g. "M5.5 V") for real stars. */
  spectralType: StarType | string;
  teff_K: number;
  radius_Rsun: number;
  mass_Msun: number;
  /** If null, compute from radius and Teff (Stefan–Boltzmann). */
  luminosity_Lsun: number | null;
  age_Gyr?: number | null;
  /** "preset:<type>" or "nasa-exoplanet-archive". */
  source: string;
  /** Citation / archive reference name. */
  reference?: string | null;
  uncertainties?: Partial<Record<'teff_K' | 'radius_Rsun' | 'mass_Msun' | 'luminosity_Lsun', Measured>>;
}

/** For real exoplanets moon status is "unknown" — never invent an exomoon. */
export type MoonSpec =
  | { kind: 'unknown' }
  | { kind: 'none' }
  | { kind: 'custom'; mass_kg: number; distance_m: number; label: string };

export interface Planet {
  name: string;
  /** null = unknown. Never fill with a guess inside physics code. */
  mass_Mearth: number | null;
  radius_Rearth: number | null;
  /** Semi-major axis. */
  a_AU: number;
  /** Eccentricity, 0 ≤ e < 1. Hypothetical planets default to 0. */
  ecc: number;
  /** Measured orbital period if known (real planets); the model still computes its own. */
  orbitalPeriod_days?: number | null;
  /** null = unknown. */
  rotationPeriod_days?: number | null;
  moon: MoonSpec;
  source: 'hypothetical' | 'nasa-exoplanet-archive';
  reference?: string | null;
  /** Which fields were derived rather than measured (e.g. a_AU from period + stellar mass). */
  derivedFields?: string[];
  uncertainties?: Partial<Record<'mass_Mearth' | 'radius_Rearth' | 'a_AU' | 'ecc', Measured>>;
}

export interface Atmosphere {
  surfacePressure_bar: number;
  /** Normalized greenhouse strength, 0–1 (UI slider). Mapped to emissivity ε by atmosphere.ts. */
  greenhouse: number;
  /** Bond albedo. Prototype default 0.30 (Earth-like) — an assumption, not a measurement. */
  albedo: number;
}

export const DEFAULT_ALBEDO = 0.3;

// ---------------------------------------------------------------------------
// Module outputs
// ---------------------------------------------------------------------------

export type WaterPhase = 'ice' | 'liquid' | 'vapor' | 'no-liquid-below-triple-point';

export type TidalLocking = 'likely' | 'possible' | 'unlikely' | 'unknown';

export interface OrbitSample {
  /** Fraction of the orbital period elapsed, 0 ≤ t < 1 (uniform in time — use for animation). */
  timeFraction: number;
  /** True anomaly θ [rad]. */
  trueAnomaly_rad: number;
  distance_m: number;
  /** Position in the orbital plane with the star at the origin (focus), periapsis on +x [m]. */
  x_m: number;
  y_m: number;
  flux_W_m2: number;
  equilibriumTemp_K: number;
}

export type CheckId = 'temperature' | 'liquidWater' | 'pressure' | 'irradiation' | 'tidal';

export interface HabitabilityCheck {
  id: CheckId;
  label: string;
  /** true = pass, false = fail, null = cannot evaluate (missing data). */
  passed: boolean | null;
  /** Displayable value, e.g. "288 K". */
  observed: string;
  /** Displayable target range, e.g. "273–323 K". */
  target: string;
  /** Plain-language reason for the outcome. */
  reason: string;
  /** Critical conditions can drive "Uninhabitable"; supporting ones only drop to "Marginal". */
  weight: 'critical' | 'supporting';
}

export type HabitabilityStatus = 'Uninhabitable' | 'Marginally Habitable' | 'Highly Habitable';

export interface HabitabilityResult {
  status: HabitabilityStatus;
  checks: HabitabilityCheck[];
  /** Low when inputs are hypothetical/assumed (e.g. atmosphere unknown) or checks were not evaluable. */
  confidence: 'low' | 'medium' | 'high';
  confidenceReasons: string[];
  /** Always includes the "model output, not evidence of life" disclaimer. */
  disclaimer: string;
}

// ---------------------------------------------------------------------------
// Pipeline entry point (implemented by Agent 8 in src/pipeline/simulate.ts)
// ---------------------------------------------------------------------------

export interface SimulationInput {
  star: Star;
  planet: Planet;
  atmosphere: Atmosphere;
  /** Real-planet mode: measured star/planet values stay fixed; slider edits are flagged. */
  mode: 'hypothetical' | 'real';
  /** In real mode, which inputs the user changed from archive values (e.g. ["a_AU", "greenhouse"]). */
  modifiedFields: string[];
  /** Number of orbit samples for visualization (default 180). */
  orbitSamples?: number;
}

export interface SimulationOutput {
  input: SimulationInput;
  star: { luminosity: Result };
  orbit: {
    period: Result; // s
    periapsis: Result; // m
    apoapsis: Result; // m
    samples: OrbitSample[];
  };
  stellarFlux: Result; // W m^-2 at a
  insolation: Result; // S / S_earth at a
  surfaceGravity: Result<number | null>; // m s^-2, null if mass/radius unknown
  equilibriumTemp: Result; // K
  epsilon: Result; // dimensionless
  surfaceTemp: Result; // K
  waterPhase: Result<WaterPhase>;
  tides: {
    stellarAcceleration: Result<number | null>; // m s^-2
    /** Stellar tide relative to the Sun's tide on Earth (dimensionless). */
    stellarRelativeToEarth: Result<number | null>;
    moon: Result<number | null>; // m s^-2, null when moon unknown/none
    locking: Result<TidalLocking>;
  };
  habitability: HabitabilityResult;
  /** Global model assumptions (DESIGN.md §24) plus any run-specific notes. */
  assumptions: string[];
  /** Human-readable provenance lines ("Star: NASA Exoplanet Archive, ref …", "Modified: a_AU"). */
  provenance: string[];
}

// ---------------------------------------------------------------------------
// Real-planet catalog record (produced by Agent 6's loader)
// ---------------------------------------------------------------------------

export interface CatalogEntry {
  id: string; // stable slug of pl_name
  star: Star;
  planet: Planet;
  /** Anything the loader could not fill (never guessed), e.g. ["pl_masse", "pl_orbeccen"]. */
  missing: string[];
}

export interface Catalog {
  generatedAt: string; // ISO timestamp
  source: string; // "NASA Exoplanet Archive, ps table, default_flag=1" or "dev fixture"
  isFixture: boolean;
  entries: CatalogEntry[];
}

export const MODEL_ASSUMPTIONS: readonly string[] = [
  'Planet treated as spherical.',
  'Star treated as a blackbody.',
  'Uniform planetary energy redistribution.',
  'Fixed/default albedo.',
  'Simplified greenhouse parameterization (one-layer model).',
  'Simplified water-phase model.',
  'Tidal effects approximated using point-mass gravitational relationships.',
  'Biological habitability is NOT being predicted.',
  'Atmospheric composition may be unknown.',
  'Results are model outputs, not evidence that life exists.',
] as const;
