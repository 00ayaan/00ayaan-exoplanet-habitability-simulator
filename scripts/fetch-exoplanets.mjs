#!/usr/bin/env node
/**
 * Build-time snapshot of the NASA Exoplanet Archive. Owner: Agent 6.
 *
 * Runs in GitHub Actions (`npm run data:fetch`) before `vite build`:
 *   1. Query the TAP sync endpoint (ps table, default_flag = 1, filter in
 *      src/data/parse.js → ARCHIVE_FILTER) with format=json.
 *   2. Pipe rows through the SAME pure parser the app uses (src/data/parse.js).
 *   3. Write public/data/exoplanets.json (compact Catalog JSON).
 *
 * On any failure it exits non-zero and leaves an existing snapshot untouched
 * (the write goes to a temp file that is renamed only on success).
 *
 * Requires Node >= 22.18 (native fetch, and type stripping so parse.js can
 * import src/physics/constants.ts). No dependencies.
 */
import { mkdir, rename, writeFile, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAdqlQuery, buildTapUrl, parseArchiveRows } from '../src/data/parse.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'public/data/exoplanets.json');
const TIMEOUT_MS = 60_000;
const ATTEMPTS = 2; // one retry
/** Sanity floor: the filtered archive has hundreds of rows; far fewer means something broke. */
const MIN_ENTRIES = 20;

async function fetchRows() {
  const url = buildTapUrl();
  let lastErr;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { accept: 'application/json' },
      });
      if (!res.ok) {
        const body = (await res.text()).slice(0, 300);
        throw new Error(`HTTP ${res.status} ${res.statusText}: ${body}`);
      }
      const data = await res.json();
      if (!Array.isArray(data)) throw new Error('TAP response is not a JSON array of rows');
      return data;
    } catch (err) {
      lastErr = err;
      console.error(`[data:fetch] attempt ${attempt}/${ATTEMPTS} failed: ${err instanceof Error ? err.message : err}`);
      if (attempt < ATTEMPTS) await new Promise((r) => setTimeout(r, 5_000));
    }
  }
  throw lastErr;
}

async function main() {
  console.log(`[data:fetch] ADQL: ${buildAdqlQuery()}`);
  const rows = await fetchRows();
  const catalog = parseArchiveRows(rows, new Date().toISOString());
  console.log(`[data:fetch] ${rows.length} rows → ${catalog.entries.length} catalog entries`);
  if (catalog.entries.length < MIN_ENTRIES) {
    throw new Error(`only ${catalog.entries.length} entries (< ${MIN_ENTRIES}); refusing to overwrite snapshot`);
  }
  await mkdir(dirname(OUT), { recursive: true });
  const tmp = `${OUT}.tmp`;
  try {
    await writeFile(tmp, JSON.stringify(catalog));
    await rename(tmp, OUT);
  } catch (err) {
    await rm(tmp, { force: true });
    throw err;
  }
  console.log(`[data:fetch] wrote ${OUT}`);
}

main().catch((err) => {
  console.error(`[data:fetch] FAILED — existing snapshot (if any) left unchanged: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
