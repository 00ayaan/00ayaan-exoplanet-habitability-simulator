/**
 * Simulation pipeline — OWNED BY AGENT 8 (Pipeline / Integration).
 *
 * Wires the physics modules together in the order of DESIGN.md §21:
 *   star luminosity → orbit → stellar flux / insolation → surface gravity →
 *   equilibrium temperature → greenhouse ε → surface temperature → water phase →
 *   tides → habitability classification.
 *
 * Edge units (AU, R☉, M☉, L☉, R⊕, M⊕, days, Gyr) are converted to SI only via
 * src/physics/units.ts. Pure and deterministic: no DOM, no I/O, no globals, so
 * it can run on every slider move (and inside a Capacitor app or worker).
 *
 * Real-planet rule (DESIGN.md adaptation notes): measured star and planet values
 * stay fixed. Only the orbital distance (a_AU), surface pressure and greenhouse
 * strength may be overridden by sliders; such edits are listed in provenance as
 * "Modified from archive values". Any other field named in `modifiedFields` is
 * ignored (and a note says so) — it can never change the star, mass or radius.
 *
 * Validation: physics RangeErrors propagate for truly invalid input (a ≤ 0,
 * e ≥ 1, albedo outside [0, 1], …). Nothing is clamped silently. Missing data
 * (unknown mass/radius/age/rotation) never throws: it yields null results with
 * a note, and lowers the habitability confidence.
 */
import type {
  Atmosphere,
  Planet,
  Result,
  SimulationInput,
  SimulationOutput,
  Star,
} from '../physics/types';
import { DEFAULT_ALBEDO, MODEL_ASSUMPTIONS } from '../physics/types';
import { auToM, daysToS, mEarthToKg, mSunToKg, rEarthToM, rSunToM } from '../physics/units';
import { fluxAtDistance, relativeInsolation, resolveLuminosity } from '../physics/stellar';
import { apoapsis, orbitalPeriod, periapsis, sampleOrbit } from '../physics/orbit';
import { equilibriumTemperature, surfaceGravity } from '../physics/planet';
import { EARTH_GREENHOUSE, greenhouseToEpsilon, surfaceTemperature } from '../physics/atmosphere';
import { waterPhase } from '../physics/water';
import { moonTide, stellarTideRelativeToEarth, tidalAcceleration, tidalLockingIndicator } from '../physics/tides';
import { classifyHabitability } from '../physics/habitability';

/** Default number of orbit samples for the visualization. */
export const DEFAULT_ORBIT_SAMPLES = 180;

/** Years per gigayear (edge unit Gyr → yr for the tidal-locking indicator). */
const YR_PER_GYR = 1e9;

/** Fields a user may override in real-planet mode. Everything else stays at the archive value. */
export const OVERRIDABLE_FIELDS: readonly string[] = ['a_AU', 'surfacePressure_bar', 'greenhouse'];

/** Planet.derivedFields key → archive column reported as missing (for habitability confidence). */
const DERIVED_TO_MISSING: Readonly<Record<string, string>> = {
  ecc: 'pl_orbeccen',
  a_AU: 'pl_orbsmax',
  mass_Mearth: 'pl_masse',
  radius_Rearth: 'pl_rade',
};

/**
 * Optional pass-through on top of the frozen SimulationInput: the catalog entry's
 * `missing` list (CatalogEntry.missing). When given it is merged with the list the
 * pipeline derives from the planet itself.
 */
export type SimulationInputWithMissing = SimulationInput & { missing?: string[] };

/** A hypothetical Earth-analogue planet at the given semi-major axis [AU]. */
export function hypotheticalPlanet(a_AU: number): Planet {
  return {
    name: 'Hypothetical planet',
    mass_Mearth: 1,
    radius_Rearth: 1,
    a_AU,
    ecc: 0,
    orbitalPeriod_days: null,
    rotationPeriod_days: null,
    moon: { kind: 'none' },
    source: 'hypothetical',
    reference: null,
    derivedFields: [],
  };
}

/** Default (assumed, not measured) atmosphere: 1 bar, Earth-calibrated greenhouse, A = 0.30. */
export function defaultAtmosphere(): Atmosphere {
  return { surfacePressure_bar: 1, greenhouse: EARTH_GREENHOUSE, albedo: DEFAULT_ALBEDO };
}

/** Compact number formatting for provenance/notes (4 significant figures, no trailing zeros). */
function fmt(x: number): string {
  if (!Number.isFinite(x)) return String(x);
  return String(Number(x.toPrecision(4)));
}

const nullResult = (unit: string, note: string): Result<number | null> => ({ value: null, unit, assumptions: [note] });

/** Missing catalog fields implied by the planet record itself (nulls and derived values). */
export function deriveMissing(planet: Planet, extra: readonly string[] = []): string[] {
  const out = new Set<string>(extra);
  if (planet.mass_Mearth === null || planet.mass_Mearth === undefined) out.add('pl_masse');
  if (planet.radius_Rearth === null || planet.radius_Rearth === undefined) out.add('pl_rade');
  for (const f of planet.derivedFields ?? []) {
    const col = DERIVED_TO_MISSING[f];
    if (col) out.add(col);
  }
  return [...out];
}

function sourceLine(kind: 'Star' | 'Planet', obj: Star | Planet): string {
  const ref = obj.reference ? `, ref ${obj.reference}` : '';
  return `${kind}: ${obj.name} — ${obj.source}${ref}`;
}

/** Provenance line for real-mode slider overrides, plus notes for ignored fields. */
function modifiedLine(input: SimulationInput, ignored: string[]): string | null {
  const baseAtm = defaultAtmosphere();
  const parts: string[] = [];
  for (const f of input.modifiedFields) {
    if (f === 'a_AU') {
      const orig = input.planet.uncertainties?.a_AU?.value;
      parts.push(
        orig !== undefined && orig !== null
          ? `a_AU (${fmt(orig)} AU → ${fmt(input.planet.a_AU)} AU)`
          : `a_AU (now ${fmt(input.planet.a_AU)} AU; archive value not available)`,
      );
    } else if (f === 'surfacePressure_bar') {
      parts.push(`surfacePressure_bar (assumed default ${fmt(baseAtm.surfacePressure_bar)} bar → ${fmt(input.atmosphere.surfacePressure_bar)} bar)`);
    } else if (f === 'greenhouse') {
      parts.push(`greenhouse (assumed default ${fmt(baseAtm.greenhouse)} → ${fmt(input.atmosphere.greenhouse)})`);
    } else {
      ignored.push(f);
    }
  }
  return parts.length ? `Modified from archive values: ${parts.join(', ')}` : null;
}

/**
 * Run the full Prototype 1 model for one star–planet–atmosphere configuration.
 *
 * Pure and deterministic. Throws RangeError (from the physics modules) only for
 * invalid input such as a ≤ 0, e outside [0, 1), albedo outside [0, 1],
 * greenhouse outside [0, 1] or negative pressure. Unknown planet mass/radius,
 * system age or rotation period never throw.
 */
export function simulate(input: SimulationInputWithMissing): SimulationOutput {
  const { star, planet, atmosphere } = input;
  const notes: string[] = [];

  // --- 1. Star ---------------------------------------------------------------
  const luminosity = resolveLuminosity(star);
  const L_W = luminosity.value;
  const starMass_kg = mSunToKg(star.mass_Msun);
  const starRadius_m = rSunToM(star.radius_Rsun);
  if (luminosity.assumptions[0]) notes.push(luminosity.assumptions[0]);

  // --- 2. Orbit ----------------------------------------------------------------
  const a_m = auToM(planet.a_AU);
  const e = planet.ecc;
  const planetMass_kg = planet.mass_Mearth != null ? mEarthToKg(planet.mass_Mearth) : null;
  const planetRadius_m = planet.radius_Rearth != null ? rEarthToM(planet.radius_Rearth) : null;
  const n = input.orbitSamples ?? DEFAULT_ORBIT_SAMPLES;

  const period = orbitalPeriod(a_m, starMass_kg, planetMass_kg ?? undefined);
  const peri = periapsis(a_m, e);
  const apo = apoapsis(a_m, e);
  const samples = sampleOrbit(a_m, e, L_W, atmosphere.albedo, n);
  notes.push(`Orbit sampled at ${n} points uniform in time; flux and T_eq along the orbit are instantaneous (no thermal inertia).`);
  if (peri.value <= starRadius_m) {
    notes.push(
      `Unphysical configuration: the orbit (periapsis ${fmt(peri.value / auToM(1))} AU) lies inside the star's radius (${fmt(star.radius_Rsun)} R☉ = ${fmt(starRadius_m / auToM(1))} AU). Values are shown for illustration only.`,
    );
  }

  // --- 3. Flux & insolation at a ---------------------------------------------
  const stellarFlux = fluxAtDistance(L_W, a_m);
  const insolation = relativeInsolation(L_W, a_m);

  // --- 4. Surface gravity -----------------------------------------------------
  const gravity = surfaceGravity(planetMass_kg, planetRadius_m);

  // --- 5–7. Temperatures --------------------------------------------------------
  const equilibriumTemp = equilibriumTemperature(stellarFlux.value, atmosphere.albedo);
  const epsilon = greenhouseToEpsilon(atmosphere.greenhouse);
  const surfaceTemp = surfaceTemperature(stellarFlux.value, atmosphere.albedo, epsilon.value);

  // --- 8. Water phase ---------------------------------------------------------
  const phase = waterPhase(surfaceTemp.value, atmosphere.surfacePressure_bar);

  // --- 9. Tides -----------------------------------------------------------------
  let stellarAcceleration: Result<number | null>;
  let stellarRelativeToEarth: Result<number | null>;
  if (planetRadius_m !== null) {
    stellarAcceleration = tidalAcceleration(starMass_kg, planetRadius_m, a_m);
    stellarRelativeToEarth = stellarTideRelativeToEarth(stellarAcceleration.value as number);
  } else {
    const why = 'Planet radius unknown, so the stellar tide cannot be computed (not estimated).';
    stellarAcceleration = nullResult('m s^-2', why);
    stellarRelativeToEarth = nullResult('', why);
  }
  const moon = moonTide(planet.moon, planetRadius_m);

  let systemAge_yr: number | null = null;
  if (star.age_Gyr != null) {
    if (Number.isFinite(star.age_Gyr) && star.age_Gyr > 0) systemAge_yr = star.age_Gyr * YR_PER_GYR;
    else notes.push(`Stellar age ${String(star.age_Gyr)} Gyr is not a usable positive value; treated as unknown.`);
  }
  let rotationPeriod_s: number | null = null;
  if (planet.rotationPeriod_days != null) {
    if (Number.isFinite(planet.rotationPeriod_days) && planet.rotationPeriod_days > 0) {
      rotationPeriod_s = daysToS(planet.rotationPeriod_days);
    } else {
      notes.push(`Rotation period ${String(planet.rotationPeriod_days)} d is not a usable positive value; treated as unknown.`);
    }
  }
  const locking = tidalLockingIndicator({
    starMass_kg,
    a_m,
    planetMass_kg,
    planetRadius_m,
    systemAge_yr,
    rotationPeriod_s,
    orbitalPeriod_s: period.value,
  });

  // --- 10. Habitability ---------------------------------------------------------
  const missing = deriveMissing(planet, input.missing ?? []);
  const habitability = classifyHabitability({
    surfaceTemp_K: surfaceTemp.value,
    waterPhase: phase.value,
    surfacePressure_bar: atmosphere.surfacePressure_bar,
    insolation_Searth: insolation.value,
    starTeff_K: star.teff_K,
    tidalLocking: locking.value,
    stellarTideRelEarth: stellarRelativeToEarth.value,
    // Prototype 1: pressure and greenhouse always come from sliders, never measurements.
    atmosphereAssumed: true,
    missing,
  });

  // --- Run-specific notes -----------------------------------------------------
  notes.push('Atmosphere (surface pressure, greenhouse strength, albedo) is assumed from the sliders, not measured.');
  for (const d of planet.derivedFields ?? []) {
    if (d.includes(':')) notes.push(`Derived value — ${d}.`);
  }
  if (e === 0 && (planet.derivedFields ?? []).includes('ecc')) {
    notes.push('Eccentricity not reported: circular orbit (e = 0) assumed.');
  }
  if (planetMass_kg === null || planetRadius_m === null) {
    const which = [planetMass_kg === null ? 'mass' : null, planetRadius_m === null ? 'radius' : null].filter(Boolean).join(' and ');
    notes.push(`Planet ${which} unknown: dependent results are left empty, never estimated.`);
  }
  if (planet.moon.kind === 'unknown') notes.push('Moon status unknown — no exomoon assumed.');

  // --- Provenance -------------------------------------------------------------
  const provenance = [sourceLine('Star', star), sourceLine('Planet', planet)];
  if (input.mode === 'real') {
    const ignored: string[] = [];
    const mod = modifiedLine(input, ignored);
    if (mod) provenance.push(mod);
    if (ignored.length) {
      notes.push(
        `Ignored modification request for ${ignored.join(', ')}: in real-planet mode measured star and planet values stay fixed; only ${OVERRIDABLE_FIELDS.join(', ')} can be overridden.`,
      );
    }
    if (planet.orbitalPeriod_days != null && planet.orbitalPeriod_days > 0) {
      provenance.push(`Archive orbital period: ${fmt(planet.orbitalPeriod_days)} d (the model computes its own period from a and masses).`);
    }
  }

  return {
    input,
    star: { luminosity },
    orbit: { period, periapsis: peri, apoapsis: apo, samples },
    stellarFlux,
    insolation,
    surfaceGravity: gravity,
    equilibriumTemp,
    epsilon,
    surfaceTemp,
    waterPhase: phase,
    tides: { stellarAcceleration, stellarRelativeToEarth, moon, locking },
    habitability,
    assumptions: [...new Set([...MODEL_ASSUMPTIONS, ...notes])],
    provenance,
  };
}
