/**
 * Writes validation/VALIDATION_REPORT.md — Agent 9 (independent).
 * Deterministic: the only date is the fixed string below.
 */
import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildRows, renderReport } from './report';

const REPORT_DATE = '2026-09-29';

/**
 * Cases known to be bugs today. Previously ['venus-status-max', 'venus-status-earthgh', 'albedo-1'];
 * all three were fixed by their owners (Sept 2026) and are now regression-checked as ✓ below.
 */
const KNOWN_BUG_IDS: string[] = [];
const FIXED_BUG_IDS = ['venus-status-max', 'venus-status-earthgh', 'albedo-1'];

describe('validation report', () => {
  const rows = buildRows();

  it('writes VALIDATION_REPORT.md deterministically', () => {
    const md = renderReport(rows, REPORT_DATE);
    expect(renderReport(buildRows(), REPORT_DATE)).toBe(md);
    expect(md).not.toMatch(/\d{4}-\d{2}-\d{2}T/); // no timestamps
    writeFileSync(new URL('./VALIDATION_REPORT.md', import.meta.url), md, 'utf8');
  }, 30_000);

  it('Earth, Mars and all numeric physics cases pass; only the documented limitations are ⚠', () => {
    const lim = rows.filter((r) => r.verdict === '⚠ known limitation').map((r) => r.id).sort();
    expect(lim).toEqual(['boil-100bar', 'ecc-verdict', 'mars-ts-earthgh', 'venus-phase', 'venus-ts-earthgh', 'venus-ts-max']);
  });

  it('the only ✗ rows are the recorded bugs (this test fails if a new bug appears — or passes-through if one is fixed)', () => {
    const bugs = rows.filter((r) => r.verdict === '✗ bug').map((r) => r.id);
    for (const id of bugs) expect(KNOWN_BUG_IDS).toContain(id);
  });

  it('previously reported bugs stay fixed (✓)', () => {
    for (const id of FIXED_BUG_IDS) expect(rows.find((r) => r.id === id)?.verdict, id).toBe('✓');
  });
});
