// Type declarations for parse.js (plain ES module shared by the app and the
// build-time fetch script). Owner: Agent 6. Keep in sync with parse.js.
import type { Catalog } from '../physics/types';

export type ArchiveRow = Record<string, string | number | null>;

export declare const ARCHIVE_TAP_SYNC_URL: string;
export declare const ARCHIVE_TABLE: string;
export declare const ARCHIVE_SOURCE: string;
export declare const ARCHIVE_COLUMNS: readonly string[];
export declare const ARCHIVE_FILTER: string;

export declare function buildAdqlQuery(): string;
export declare function buildTapUrl(): string;
export declare function stripHtml(v: unknown): string | null;
export declare function slugify(name: string): string;
/** a [AU] = [G M★ P² / 4π²]^(1/3), planet mass neglected. */
export declare function semiMajorAxisFromPeriod_AU(period_days: number, starMass_Msun: number): number;
export declare function parseArchiveRows(
  rows: ArchiveRow[],
  generatedAt: string,
  opts?: { source?: string; isFixture?: boolean },
): Catalog;
