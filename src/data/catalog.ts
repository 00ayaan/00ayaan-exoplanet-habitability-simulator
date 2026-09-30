/**
 * Real-planet catalog loader. Owner: Agent 6.
 *
 * The parsing logic lives in parse.js (plain ES module + parse.d.ts) so the
 * build-time script scripts/fetch-exoplanets.mjs runs exactly the same code
 * in Node. No DOM access here (AGENTS.md rule 10) — only `fetch`.
 */
import type { Catalog } from '../physics/types';
import { parseArchiveRows as parseRows } from './parse.js';

export {
  ARCHIVE_COLUMNS,
  ARCHIVE_FILTER,
  ARCHIVE_SOURCE,
  buildAdqlQuery,
  buildTapUrl,
  semiMajorAxisFromPeriod_AU,
  slugify,
  stripHtml,
} from './parse.js';
export type { ArchiveRow } from './parse.js';

/** Relative path: works under a GitHub Pages subpath and inside Capacitor. */
export const CATALOG_URL = './data/exoplanets.json';

export const FIXTURE_SOURCE =
  'DEV FIXTURE — hand-entered approximate values, not from the archive, not for display';

/**
 * Convert raw NASA Exoplanet Archive `ps` rows (default_flag = 1) to a Catalog.
 * Pure: see parse.js for the mapping rules.
 */
export function parseArchiveRows(
  rows: Record<string, string | number | null>[],
  generatedAt: string,
): Catalog {
  return parseRows(rows, generatedAt);
}

/**
 * Dev/test fixture parsed into a Catalog flagged isFixture: true.
 * Only reachable behind `import.meta.env.DEV`, so production builds drop the
 * dynamic import and the fixture is never shipped.
 */
async function loadFixtureCatalog(): Promise<Catalog> {
  const mod = await import('./fixture.json');
  const raw = mod.default as { generatedAt: string; rows: Record<string, string | number | null>[] };
  return parseRows(raw.rows, raw.generatedAt, { source: FIXTURE_SOURCE, isFixture: true });
}

function isCatalog(x: unknown): x is Catalog {
  if (x === null || typeof x !== 'object') return false;
  const c = x as Partial<Catalog>;
  return typeof c.generatedAt === 'string' && typeof c.source === 'string' && Array.isArray(c.entries);
}

/**
 * Load the build-time snapshot from ./data/exoplanets.json.
 * - DEV: on failure, fall back to the dev fixture (isFixture: true).
 * - Production: on failure, return an empty catalog (UI shows hypothetical mode only).
 * Never throws.
 */
export async function loadCatalog(): Promise<Catalog> {
  try {
    const res = await fetch(CATALOG_URL, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: unknown = await res.json();
    if (!isCatalog(data)) throw new Error('snapshot is not a Catalog');
    return { ...data, isFixture: false };
  } catch (err) {
    if (import.meta.env.DEV) {
      console.warn('[catalog] snapshot unavailable, using DEV fixture:', err);
      return loadFixtureCatalog();
    }
    return {
      generatedAt: new Date(0).toISOString(),
      source: 'No NASA Exoplanet Archive snapshot is available in this build; real-planet mode disabled.',
      isFixture: false,
      entries: [],
    };
  }
}
