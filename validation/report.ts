/**
 * Validation report builder — Agent 9 (independent).
 *
 * Runs a fixed set of cases through the public simulate() API, compares each with an independent
 * reference value (validation/reference.ts or a published number), and renders a deterministic
 * markdown table. Verdicts are COMPUTED from the comparison, not hard-coded, so a fixed bug or a
 * model upgrade changes the report automatically:
 *   ✓  within tolerance / matches
 *   ⚠  outside tolerance, and the case is a documented limitation of the simplified model
 *   ✗  outside tolerance and NOT an accepted limitation → a bug
 */
import { run } from './helpers';
import { EARTH, MARS, REF, VENUS, pctDiff, refFlux, refRecentVenusSeff, refTeq, refTide } from './reference';
import type { SimulationOutput } from '../src/physics/types';

export type Verdict = '✓' | '⚠ known limitation' | '✗ bug';

export interface ReportRow {
  id: string;
  group: string;
  caseLabel: string;
  model: string;
  reference: string;
  source: string;
  diffPct: number | null;
  verdict: Verdict;
  note: string;
}

interface NumericCase {
  id: string;
  group: string;
  caseLabel: string;
  model: () => number;
  reference: number;
  unit: string;
  source: string;
  /** Allowed |relative difference| in %. */
  tolPct: number;
  /** If set, a miss is an accepted model limitation (⚠) with this explanation; otherwise a miss is ✗. */
  limitation?: string;
  note?: string;
  digits?: number;
}

interface CategoricalCase {
  id: string;
  group: string;
  caseLabel: string;
  model: () => string;
  reference: string;
  source: string;
  limitation?: string;
  note?: string;
}

function fmt(x: number, digits = 4): string {
  if (x === 0) return '0';
  const a = Math.abs(x);
  if (a >= 1e5 || a < 1e-3) return x.toExponential(digits - 1);
  return String(Number(x.toPrecision(digits)));
}

function safe<T>(fn: () => T): { ok: true; v: T } | { ok: false; err: string } {
  try {
    return { ok: true, v: fn() };
  } catch (e) {
    return { ok: false, err: e instanceof Error ? `${e.name}: ${e.message}` : String(e) };
  }
}

const status = (o: SimulationOutput): string => o.habitability.status;

// ---------------------------------------------------------------------------
// Cases
// ---------------------------------------------------------------------------

const venus = (gh?: number, albedo = VENUS.bondAlbedo) =>
  run(VENUS.a_AU, { albedo, surfacePressure_bar: VENUS.surfacePressure_bar, ...(gh !== undefined ? { greenhouse: gh } : {}) });
const mars = (gh?: number) =>
  run(MARS.a_AU, { albedo: MARS.bondAlbedo, surfacePressure_bar: MARS.surfacePressure_bar, ...(gh !== undefined ? { greenhouse: gh } : {}) });

const SUN_EARTH_TIDE = refTide(REF.GM_sun, REF.R_earth_eq_m, REF.AU_m);
const MOON_EARTH_TIDE = refTide(REF.GM_moon, REF.R_earth_eq_m, REF.moonDistance_m);
const withMoon = () =>
  run(1, {}, 'G', { moon: { kind: 'custom', mass_kg: REF.GM_moon / REF.G, distance_m: REF.moonDistance_m, label: 'Moon' } });

export const NUMERIC_CASES: NumericCase[] = [
  // --- Earth known values
  { id: 'earth-flux', group: 'Earth', caseLabel: 'Solar constant at 1 AU', model: () => run(1).stellarFlux.value, reference: REF.TSI_KoppLean2011, unit: 'W m⁻²', source: 'Kopp & Lean 2011 (1360.8 ± 0.5)', tolPct: 0.1 },
  { id: 'earth-teq', group: 'Earth', caseLabel: 'T_eq, A = 0.30', model: () => run(1).equilibriumTemp.value, reference: 255, unit: 'K', source: 'Textbook value (e.g. Pierrehumbert 2010)', tolPct: 0.5 },
  { id: 'earth-teq-nasa', group: 'Earth', caseLabel: 'T_eq, A = 0.294 (NASA albedo)', model: () => run(1, { albedo: 0.294 }).equilibriumTemp.value, reference: EARTH.nasaBlackBodyTemp_K, unit: 'K', source: 'NASA Earth fact sheet (black-body T)', tolPct: 0.6, note: 'NASA 254.0 K implies A ≈ 0.306; hand calc with 0.294 gives 255.1 K' },
  { id: 'earth-period', group: 'Earth', caseLabel: 'Orbital period, 1 AU, 1 M☉', model: () => run(1).orbit.period.value / REF.day_s, reference: 365.256, unit: 'd', source: 'NASA Earth fact sheet (sidereal)', tolPct: 0.01, digits: 6 },
  { id: 'earth-g', group: 'Earth', caseLabel: 'Surface gravity (1 M⊕, 1 R⊕)', model: () => run(1).surfaceGravity.value as number, reference: REF.standardGravity, unit: 'm s⁻²', source: 'CGPM standard gravity 9.80665', tolPct: 0.2, note: 'NASA mean 9.82 uses volumetric radius 6371 km' },
  { id: 'earth-ts', group: 'Earth', caseLabel: 'Surface T, Earth greenhouse', model: () => run(1).surfaceTemp.value, reference: EARTH.meanSurfaceTemp_K, unit: 'K', source: 'NASA Earth fact sheet', tolPct: 0.2, note: 'calibration target, not a prediction' },
  { id: 'earth-sun-tide', group: 'Earth', caseLabel: 'Sun’s tide on Earth', model: () => run(1).tides.stellarAcceleration.value as number, reference: SUN_EARTH_TIDE, unit: 'm s⁻²', source: 'Hand calc 2GM☉R⊕/AU³ (IAU GM☉)', tolPct: 0.01 },
  { id: 'earth-moon-tide', group: 'Earth', caseLabel: 'Moon’s tide on Earth', model: () => withMoon().tides.moon.value as number, reference: 1.1e-6, unit: 'm s⁻²', source: 'Standard value; hand calc 1.10e-6 (NASA Moon sheet GM, 384 400 km)', tolPct: 1.5 },
  { id: 'earth-sun-moon', group: 'Earth', caseLabel: 'Sun/Moon tide ratio', model: () => (withMoon().tides.stellarAcceleration.value as number) / (withMoon().tides.moon.value as number), reference: 0.46, unit: '', source: 'Classical ratio (NOAA Tides & Water Levels)', tolPct: 2 },
  // --- Venus
  { id: 'venus-flux', group: 'Venus', caseLabel: 'Flux at 0.7233 AU', model: () => venus().stellarFlux.value, reference: 2601.3, unit: 'W m⁻²', source: 'NASA Venus fact sheet', tolPct: 0.1 },
  { id: 'venus-teq', group: 'Venus', caseLabel: 'T_eq, A = 0.77', model: () => venus(undefined, 0.77).equilibriumTemp.value, reference: VENUS.nasaBlackBodyTemp_K, unit: 'K', source: 'NASA Venus fact sheet (black-body T)', tolPct: 0.5 },
  { id: 'venus-ts-max', group: 'Venus', caseLabel: 'Surface T, A = 0.76, greenhouse = 1 (model max)', model: () => venus(1).surfaceTemp.value, reference: VENUS.meanSurfaceTemp_K, unit: 'K', source: 'NASA Venus fact sheet', tolPct: 10, limitation: 'One-layer model caps warming at 2^¼ ≈ 1.19 × T_eq; a 92-bar CO₂ atmosphere is optically thick in many layers' },
  { id: 'venus-ts-earthgh', group: 'Venus', caseLabel: 'Surface T, A = 0.76, Earth greenhouse', model: () => venus().surfaceTemp.value, reference: VENUS.meanSurfaceTemp_K, unit: 'K', source: 'NASA Venus fact sheet', tolPct: 10, limitation: 'Same cap; greenhouse slider is not tied to pressure or composition' },
  // --- Mars
  { id: 'mars-flux', group: 'Mars', caseLabel: 'Flux at 1.5238 AU', model: () => mars().stellarFlux.value, reference: 586.2, unit: 'W m⁻²', source: 'NASA Mars fact sheet', tolPct: 0.1 },
  { id: 'mars-teq', group: 'Mars', caseLabel: 'T_eq, A = 0.25', model: () => mars().equilibriumTemp.value, reference: MARS.nasaBlackBodyTemp_K, unit: 'K', source: 'NASA Mars fact sheet (black-body T)', tolPct: 0.5 },
  { id: 'mars-ts-gh0', group: 'Mars', caseLabel: 'Surface T, greenhouse = 0', model: () => mars(0).surfaceTemp.value, reference: MARS.meanSurfaceTemp_K, unit: 'K', source: 'NASA Mars fact sheet (~210 K; current sheet ~214 K)', tolPct: 3 },
  { id: 'mars-ts-earthgh', group: 'Mars', caseLabel: 'Surface T, Earth greenhouse (default slider)', model: () => mars().surfaceTemp.value, reference: MARS.meanSurfaceTemp_K, unit: 'K', source: 'NASA Mars fact sheet', tolPct: 3, limitation: 'Greenhouse strength is independent of pressure: a 0.006-bar atmosphere gets Earth’s 1-bar warming' },
  // --- Limits
  { id: 'hz-inner', group: 'Habitable zone', caseLabel: 'Recent-Venus limit for the 5772 K Sun', model: () => {
      // Bisect for the insolation at which the irradiation check flips (model behaviour, not formula).
      let lo = 1.5, hi = 2.0;
      for (let i = 0; i < 50; i++) {
        const mid = 0.5 * (lo + hi);
        const pass = run(1 / Math.sqrt(mid), {}, 'G', {}, 12).habitability.checks.find((c) => c.id === 'irradiation')!.passed;
        if (pass) lo = mid; else hi = mid;
      }
      return 0.5 * (lo + hi);
    }, reference: refRecentVenusSeff(5772), unit: 'S⊕', source: 'Kopparapu et al. 2014 Table 1 (1.776 at 5780 K)', tolPct: 0.01 },
  { id: 'lim-gh1', group: 'Limits', caseLabel: 'T_s/T_eq at greenhouse = 1', model: () => { const o = run(1, { greenhouse: 1 }); return o.surfaceTemp.value / o.equilibriumTemp.value; }, reference: 2 ** 0.25, unit: '', source: 'One-layer grey model (analytic)', tolPct: 1e-6 },
  { id: 'lim-gh0', group: 'Limits', caseLabel: 'T_s/T_eq at greenhouse = 0', model: () => { const o = run(1, { greenhouse: 0 }); return o.surfaceTemp.value / o.equilibriumTemp.value; }, reference: 1, unit: '', source: 'Analytic', tolPct: 1e-6 },
  { id: 'lim-1000au', group: 'Limits', caseLabel: 'Insolation at 1000 AU', model: () => run(1000).insolation.value, reference: 1e-6, unit: 'S⊕', source: 'Inverse-square law', tolPct: 1e-6 },
  { id: 'lim-a0', group: 'Limits', caseLabel: 'T_eq, A = 0 (black body)', model: () => run(1, { albedo: 0 }).equilibriumTemp.value, reference: refTeq(refFlux(1, 1), 0), unit: 'K', source: 'Hand calc [S/(4σ)]^¼ (≈ 278.3 K)', tolPct: 0.01 },
  { id: 'lim-ecc-period', group: 'Limits', caseLabel: 'Period ratio e = 0.99 / e = 0', model: () => run(1, {}, 'G', { ecc: 0.99 }).orbit.period.value / run(1).orbit.period.value, reference: 1, unit: '', source: 'Kepler III (independent of e)', tolPct: 1e-9 },
];

export const CATEGORICAL_CASES: CategoricalCase[] = [
  { id: 'earth-status', group: 'Classification', caseLabel: 'Earth status', model: () => status(run(1)), reference: 'Highly Habitable', source: 'Reality / DESIGN §25' },
  { id: 'earth-phase', group: 'Classification', caseLabel: 'Earth water phase', model: () => run(1).waterPhase.value, reference: 'liquid', source: 'Reality' },
  { id: 'venus-status-max', group: 'Classification', caseLabel: 'Venus status (A 0.76, 92 bar, greenhouse 1)', model: () => status(venus(1)), reference: 'Uninhabitable', source: 'Reality (737 K, no liquid)', note: '4 of 5 checks fail incl. both critical, yet not Uninhabitable: capped T_s ≈ 272 K is inside the 253–373 K "extended" band' },
  { id: 'venus-status-earthgh', group: 'Classification', caseLabel: 'Venus status (A 0.76, 92 bar, Earth greenhouse)', model: () => status(venus()), reference: 'Uninhabitable', source: 'Reality (737 K, no liquid)', note: 'Same rule gap; only greenhouse < ≈ 0.66 yields Uninhabitable' },
  { id: 'venus-phase', group: 'Classification', caseLabel: 'Venus water phase (greenhouse 1)', model: () => venus(1).waterPhase.value, reference: 'vapor', source: 'Reality (737 K ≫ boiling)', limitation: 'Consequence of the one-layer temperature cap (model says ice)' },
  { id: 'mars-status', group: 'Classification', caseLabel: 'Mars status (0.006 bar)', model: () => status(mars()), reference: 'Uninhabitable', source: 'Reality / triple point (IAPWS)' },
  { id: 'mars-phase', group: 'Classification', caseLabel: 'Mars water phase (0.006 bar)', model: () => mars().waterPhase.value, reference: 'no-liquid-below-triple-point', source: 'IAPWS triple point 611.657 Pa' },
  { id: 'albedo-1', group: 'Limits', caseLabel: 'Albedo = 1 (valid input) runs without throwing', model: () => { const r = safe(() => run(1, { albedo: 1 })); return r.ok ? 'runs' : r.err; }, reference: 'runs', source: 'AGENTS.md rule 9 (only A outside [0,1] is invalid)', note: 'T_eq = 0 K is correctly computed, then waterPhase() rejects T ≤ 0' },
  { id: 'ecc-verdict', group: 'Limits', caseLabel: 'e = 0.99 changes habitability vs e = 0', model: () => (status(run(1, {}, 'G', { ecc: 0.99 })) === status(run(1)) ? 'no change' : 'changes'), reference: 'changes', source: 'Mean flux ∝ 1/√(1−e²) ≈ 7.1×; periapsis flux 10⁴×', limitation: 'Headline flux/T/classification use a, not the orbit-averaged or periapsis flux' },
  { id: 'boil-100bar', group: 'Limits', caseLabel: 'Water phase at ~411 K, 100 bar', model: () => run(0.6, { surfacePressure_bar: 100, greenhouse: 1 }).waterPhase.value, reference: 'liquid', source: 'IAPWS saturation T at 100 bar ≈ 584 K', limitation: 'Fixed 373.15 K boiling threshold, no Clausius–Clapeyron curve yet' },
];

// ---------------------------------------------------------------------------
// Build + render
// ---------------------------------------------------------------------------

export function buildRows(): ReportRow[] {
  const rows: ReportRow[] = [];
  for (const c of NUMERIC_CASES) {
    const r = safe(c.model);
    if (!r.ok) {
      rows.push({ id: c.id, group: c.group, caseLabel: c.caseLabel, model: r.err, reference: `${fmt(c.reference)} ${c.unit}`.trim(), source: c.source, diffPct: null, verdict: '✗ bug', note: 'threw' });
      continue;
    }
    const d = pctDiff(r.v, c.reference);
    const ok = Number.isFinite(d) && Math.abs(d) <= c.tolPct;
    rows.push({
      id: c.id,
      group: c.group,
      caseLabel: c.caseLabel,
      model: `${fmt(r.v, c.digits)} ${c.unit}`.trim(),
      reference: `${fmt(c.reference, c.digits)} ${c.unit}`.trim(),
      source: c.source,
      diffPct: d,
      verdict: ok ? '✓' : c.limitation ? '⚠ known limitation' : '✗ bug',
      note: ok ? (c.note ?? `tol ±${c.tolPct} %`) : (c.limitation ?? c.note ?? `outside tol ±${c.tolPct} %`),
    });
  }
  for (const c of CATEGORICAL_CASES) {
    const r = safe(c.model);
    const v = r.ok ? r.v : r.err;
    const ok = v === c.reference;
    rows.push({
      id: c.id,
      group: c.group,
      caseLabel: c.caseLabel,
      model: v,
      reference: c.reference,
      source: c.source,
      diffPct: null,
      verdict: ok ? '✓' : c.limitation ? '⚠ known limitation' : '✗ bug',
      note: ok ? '' : (c.limitation ?? c.note ?? ''),
    });
  }
  return rows;
}

const esc = (s: string): string => s.replace(/\|/g, '\\|');

export function renderReport(rows: ReportRow[], date: string): string {
  const count = (v: Verdict) => rows.filter((r) => r.verdict === v).length;
  const lines: string[] = [];
  lines.push('# Validation report — Exoplanet Habitability Simulator, Prototype 1');
  lines.push('');
  lines.push(`Generated ${date} by \`validation/generate-report.test.ts\` (Agent 9, independent validation). Do not edit by hand — rerun \`npx vitest run validation\`.`);
  lines.push('');
  lines.push('Reference values are derived independently (validation/reference.ts: CODATA 2018, IAU 2015 nominal values, NASA GSFC planetary fact sheets, Kopp & Lean 2011, Kopparapu et al. 2014, IAPWS) — never from the implementation\'s own constants or formulas. Verdicts are computed: ✓ within tolerance; ⚠ outside tolerance but a documented limitation of the simplified model; ✗ bug (outside tolerance and not an accepted limitation).');
  lines.push('');
  lines.push(`**Summary:** ${rows.length} cases — ${count('✓')} ✓, ${count('⚠ known limitation')} ⚠ known limitation, ${count('✗ bug')} ✗ bug.`);
  lines.push('');
  lines.push('| Group | Case | Model | Reference | Reference source | Diff % | Verdict | Note |');
  lines.push('|---|---|---|---|---|---|---|---|');
  for (const r of rows) {
    const d = r.diffPct === null ? '—' : `${r.diffPct >= 0 ? '+' : ''}${r.diffPct.toFixed(Math.abs(r.diffPct) < 0.01 ? 4 : 2)}`;
    lines.push(`| ${esc(r.group)} | ${esc(r.caseLabel)} | ${esc(r.model)} | ${esc(r.reference)} | ${esc(r.source)} | ${d} | ${r.verdict} | ${esc(r.note)} |`);
  }
  lines.push('');
  lines.push('## Bugs (✗)');
  lines.push('');
  const bugs = rows.filter((r) => r.verdict === '✗ bug');
  if (bugs.length === 0) lines.push('None.');
  for (const b of bugs) lines.push(`- **${b.caseLabel}** — model \`${b.model}\`, expected \`${b.reference}\`. ${b.note}`);
  lines.push('');
  lines.push('## Known limitations confirmed (⚠)');
  lines.push('');
  const lims = rows.filter((r) => r.verdict === '⚠ known limitation');
  if (lims.length === 0) lines.push('None.');
  for (const l of lims) lines.push(`- **${l.caseLabel}** — model ${l.model} vs ${l.reference}. ${l.note}`);
  lines.push('');
  lines.push('## Also verified by the test suite (not tabulated)');
  lines.push('');
  lines.push('- e → 0 continuity (e = 1e-9 ≡ e = 0); e = 0.99 samples satisfy Kepler’s equation, the orbit equation and focus geometry; time-averaged sampled flux = F(a)/√(1−e²).');
  lines.push('- Property sweep over 8 star presets × 11 distances × 6 pressures × 5 greenhouse values: every numeric output finite or explicitly null; flux ∝ a⁻², T_s ∝ a^−½, T_s monotonic in a, greenhouse and albedo; stellar tide ∝ M★/a³.');
  lines.push('- Unknown mass/radius never throws; dependent outputs are null and confidence drops to low. Invalid inputs (e ≥ 1, a ≤ 0, A ∉ [0,1], greenhouse ∉ [0,1], P < 0, NaN) throw RangeError.');
  lines.push('- Star presets’ tabulated L agree with R²(T/T☉)⁴ within 5 %.');
  lines.push('');
  return lines.join('\n');
}
