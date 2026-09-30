// @ts-check
/**
 * Pure NASA Exoplanet Archive → Catalog parser. Owner: Agent 6.
 *
 * Written as a plain ES module (with JSDoc types and a hand-written parse.d.ts)
 * so the SAME code runs in the browser/Vitest (via Vite) and in Node at build
 * time (scripts/fetch-exoplanets.mjs) without a TS toolchain or extra deps.
 * Node >= 22.18 strips types natively, which is what lets this file import the
 * shared constants straight from constants.ts (that file has no imports).
 *
 * No I/O, no DOM, no clock: output depends only on the arguments.
 */
import { AU, DAY, G, M_EARTH, M_JUPITER, M_SUN, R_EARTH, R_JUPITER } from '../physics/constants.ts';

/** @typedef {import('../physics/types').Catalog} Catalog */
/** @typedef {import('../physics/types').CatalogEntry} CatalogEntry */
/** @typedef {import('../physics/types').Measured} Measured */
/** @typedef {import('../physics/types').Star} Star */
/** @typedef {import('../physics/types').Planet} Planet */
/** @typedef {Record<string, string | number | null>} ArchiveRow */

export const ARCHIVE_TAP_SYNC_URL = 'https://exoplanetarchive.ipac.caltech.edu/TAP/sync';
export const ARCHIVE_TABLE = 'ps';
export const ARCHIVE_SOURCE = 'NASA Exoplanet Archive, ps table, default_flag=1';

/** Columns requested from the `ps` table. `+errs` columns are expanded below. */
export const ARCHIVE_COLUMNS = Object.freeze([
  'pl_name', 'hostname',
  'pl_orbper', 'pl_orbpererr1', 'pl_orbpererr2',
  'pl_orbsmax', 'pl_orbsmaxerr1', 'pl_orbsmaxerr2',
  'pl_orbeccen', 'pl_orbeccenerr1', 'pl_orbeccenerr2',
  'pl_rade', 'pl_radeerr1', 'pl_radeerr2',
  'pl_radj',
  'pl_masse', 'pl_masseerr1', 'pl_masseerr2',
  'pl_massj',
  'pl_bmasse',
  'pl_refname',
  'st_spectype',
  'st_teff', 'st_tefferr1', 'st_tefferr2',
  'st_rad', 'st_raderr1', 'st_raderr2',
  'st_mass', 'st_masserr1', 'st_masserr2',
  'st_lum', 'st_lumerr1', 'st_lumerr2',
  'st_age', 'st_met', 'st_refname',
  'sy_pnum', 'disc_year',
]);

/**
 * Row filter (ADQL WHERE clause) for the build-time snapshot.
 *  - default_flag = 1: the archive's single self-consistent default parameter
 *    set per planet (DESIGN §2 "use consistent parameter sets").
 *  - Star Teff, radius and mass must be known (needed for flux / orbit).
 *  - Orbit must be locatable: semi-major axis, or period (a derived via Kepler III).
 *  - Some size/mass measurement must exist.
 *  - Small planets only (where surface-habitability questions make sense, and
 *    a catalog small enough for a phone):
 *      pl_rade < 4 R⊕, OR, when no radius is measured (radial-velocity-only
 *      planets such as Proxima Cen b, Teegarden's Star b), a mass < 10 M⊕
 *      (pl_bmasse — often M sin i — or pl_masse). For those planets the
 *      radius stays null (never guessed), so gravity/tides show "unknown".
 *    ADQL comparisons with NULL are false, hence the explicit IS NULL branch.
 *    (Agent 0 decision, Sept 2026.)
 */
export const ARCHIVE_FILTER = [
  'default_flag = 1',
  'st_teff IS NOT NULL',
  'st_rad IS NOT NULL',
  'st_mass IS NOT NULL',
  '(pl_orbsmax IS NOT NULL OR pl_orbper IS NOT NULL)',
  '(pl_rade IS NOT NULL OR pl_masse IS NOT NULL OR pl_bmasse IS NOT NULL)',
  '(pl_rade < 4 OR (pl_rade IS NULL AND (pl_bmasse < 10 OR pl_masse < 10)))',
].join(' AND ');

/**
 * Build the ADQL query for the snapshot.
 * @returns {string}
 */
export function buildAdqlQuery() {
  return `SELECT ${ARCHIVE_COLUMNS.join(',')} FROM ${ARCHIVE_TABLE} WHERE ${ARCHIVE_FILTER} ORDER BY pl_name`;
}

/**
 * Full TAP sync URL (ADQL URL-encoded, JSON output).
 * @returns {string}
 */
export function buildTapUrl() {
  return `${ARCHIVE_TAP_SYNC_URL}?query=${encodeURIComponent(buildAdqlQuery())}&format=json`;
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/**
 * Finite number from an archive cell, else null. Accepts numeric strings.
 * @param {unknown} v
 * @returns {number | null}
 */
function num(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const t = v.trim();
    if (t === '') return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * @param {unknown} v
 * @returns {string | null}
 */
function str(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

/**
 * Strip HTML tags and decode the few entities the archive uses in *_refname.
 * @param {unknown} v
 * @returns {string | null}
 */
export function stripHtml(v) {
  const s = str(v);
  if (s === null) return null;
  const out = s
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
  return out === '' ? null : out;
}

/**
 * Stable slug of a planet name: "Teegarden's Star b" → "teegarden-s-star-b".
 * @param {string} name
 * @returns {string}
 */
export function slugify(name) {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Measured value with the archive's asymmetric errors (err1 = +, err2 = −,
 * kept exactly as the archive reports them, so errMinus is usually negative).
 * @param {number} value
 * @param {ArchiveRow} row
 * @param {string} col
 * @returns {Measured}
 */
function measured(value, row, col) {
  return { value, errPlus: num(row[`${col}err1`]), errMinus: num(row[`${col}err2`]) };
}

/**
 * Semi-major axis from period via Kepler's third law, neglecting planet mass:
 *   a = [G M★ P² / (4π²)]^(1/3)
 * @param {number} period_days  > 0
 * @param {number} starMass_Msun > 0
 * @returns {number} a [AU]
 */
export function semiMajorAxisFromPeriod_AU(period_days, starMass_Msun) {
  const P_s = period_days * DAY;
  const M_kg = starMass_Msun * M_SUN;
  const a_m = Math.cbrt((G * M_kg * P_s * P_s) / (4 * Math.PI * Math.PI));
  return a_m / AU;
}

const RJ_TO_RE = R_JUPITER / R_EARTH;
const MJ_TO_ME = M_JUPITER / M_EARTH;

/**
 * Map one archive row to a CatalogEntry, or null if a hard requirement is
 * missing (name, star Teff/radius/mass, a locatable orbit, some radius/mass).
 * @param {ArchiveRow} row
 * @returns {CatalogEntry | null}
 */
function parseRow(row) {
  const name = str(row.pl_name);
  const teff = num(row.st_teff);
  const srad = num(row.st_rad);
  const smass = num(row.st_mass);
  if (name === null || teff === null || srad === null || smass === null) return null;
  if (!(teff > 0 && srad > 0 && smass > 0)) return null;

  /** @type {string[]} */ const missing = [];
  /** @type {string[]} */ const derived = [];

  // --- orbit -------------------------------------------------------------
  const period = num(row.pl_orbper);
  const sma = num(row.pl_orbsmax);
  /** @type {number} */ let a_AU;
  /** @type {NonNullable<Planet['uncertainties']>} */ const pUnc = {};
  if (sma !== null && sma > 0) {
    a_AU = sma;
    pUnc.a_AU = measured(sma, row, 'pl_orbsmax');
  } else if (period !== null && period > 0) {
    a_AU = semiMajorAxisFromPeriod_AU(period, smass);
    missing.push('pl_orbsmax');
    derived.push('a_AU', "a_AU: derived from pl_orbper and st_mass via Kepler's third law");
  } else {
    return null;
  }
  if (period === null || !(period > 0)) missing.push('pl_orbper');

  let ecc = num(row.pl_orbeccen);
  if (ecc !== null && ecc >= 0 && ecc < 1) {
    pUnc.ecc = measured(ecc, row, 'pl_orbeccen');
  } else {
    ecc = 0;
    missing.push('pl_orbeccen');
    derived.push('ecc', 'ecc: not reported, assumed circular (e = 0)');
  }

  // --- size / mass ---------------------------------------------------------
  /** @type {number | null} */ let radius = null;
  const rade = num(row.pl_rade);
  const radj = num(row.pl_radj);
  if (rade !== null && rade > 0) {
    radius = rade;
    pUnc.radius_Rearth = measured(rade, row, 'pl_rade');
  } else if (radj !== null && radj > 0) {
    radius = radj * RJ_TO_RE;
    missing.push('pl_rade');
    derived.push('radius_Rearth', 'radius_Rearth: converted from pl_radj');
  } else {
    missing.push('pl_rade');
  }

  /** @type {number | null} */ let mass = null;
  const masse = num(row.pl_masse);
  const bmasse = num(row.pl_bmasse);
  const massj = num(row.pl_massj);
  if (masse !== null && masse > 0) {
    mass = masse;
    pUnc.mass_Mearth = measured(masse, row, 'pl_masse');
  } else if (bmasse !== null && bmasse > 0) {
    mass = bmasse;
    missing.push('pl_masse');
    derived.push('mass_Mearth', 'mass_Mearth: pl_bmasse (M sin i / best mass; may be a minimum mass)');
  } else if (massj !== null && massj > 0) {
    mass = massj * MJ_TO_ME;
    missing.push('pl_masse');
    derived.push('mass_Mearth', 'mass_Mearth: converted from pl_massj');
  } else {
    missing.push('pl_masse');
  }
  if (radius === null && mass === null) return null;

  // --- star ------------------------------------------------------------------
  const logL = num(row.st_lum);
  /** @type {NonNullable<Star['uncertainties']>} */ const sUnc = {
    teff_K: measured(teff, row, 'st_teff'),
    radius_Rsun: measured(srad, row, 'st_rad'),
    mass_Msun: measured(smass, row, 'st_mass'),
  };
  /** @type {number | null} */ let lum = null;
  if (logL !== null) {
    lum = 10 ** logL;
    const e1 = num(row.st_lumerr1);
    const e2 = num(row.st_lumerr2);
    // archive errors are in dex; convert to linear L☉ offsets (errMinus negative)
    sUnc.luminosity_Lsun = {
      value: lum,
      errPlus: e1 === null ? null : 10 ** (logL + e1) - lum,
      errMinus: e2 === null ? null : 10 ** (logL + e2) - lum,
    };
  } else {
    missing.push('st_lum');
  }
  const spectype = str(row.st_spectype);
  if (spectype === null) missing.push('st_spectype');
  const age = num(row.st_age);
  if (age === null) missing.push('st_age');

  /** @type {Star} */
  const star = {
    name: str(row.hostname) ?? name,
    spectralType: spectype ?? 'unknown',
    teff_K: teff,
    radius_Rsun: srad,
    mass_Msun: smass,
    luminosity_Lsun: lum,
    age_Gyr: age,
    source: 'nasa-exoplanet-archive',
    reference: stripHtml(row.st_refname),
    uncertainties: sUnc,
  };

  /** @type {Planet} */
  const planet = {
    name,
    mass_Mearth: mass,
    radius_Rearth: radius,
    a_AU,
    ecc,
    orbitalPeriod_days: period !== null && period > 0 ? period : null,
    rotationPeriod_days: null,
    moon: { kind: 'unknown' },
    source: 'nasa-exoplanet-archive',
    reference: stripHtml(row.pl_refname),
    derivedFields: derived,
    uncertainties: pUnc,
  };

  return { id: slugify(name), star, planet, missing };
}

/**
 * Convert raw archive rows (ps table, one default parameter set per planet)
 * into a Catalog. Pure and deterministic.
 *
 * Rows lacking a hard requirement are skipped, never guessed. Missing optional
 * archive fields are listed in entry.missing; substituted/derived values are
 * listed in planet.derivedFields. Output is stably sorted by pl_name (code-unit
 * order, locale-independent) and de-duplicated by id (first row wins).
 *
 * @param {ArchiveRow[]} rows
 * @param {string} generatedAt ISO timestamp supplied by the caller
 * @param {{ source?: string, isFixture?: boolean }} [opts]
 * @returns {Catalog}
 */
export function parseArchiveRows(rows, generatedAt, opts = {}) {
  /** @type {CatalogEntry[]} */
  const entries = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    if (row === null || typeof row !== 'object') continue;
    const e = parseRow(row);
    if (e !== null && e.id !== '') entries.push(e);
  }
  entries.sort((x, y) => (x.planet.name < y.planet.name ? -1 : x.planet.name > y.planet.name ? 1 : 0));
  const seen = new Set();
  const unique = entries.filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true)));
  return {
    generatedAt,
    source: opts.source ?? ARCHIVE_SOURCE,
    isFixture: opts.isFixture ?? false,
    entries: unique,
  };
}
