/**
 * Shareable URL state (query string), using the reference app's parameter names
 * where they fit:
 *
 *   hypothetical / solar preset:
 *     ?mode=hypothetical|preset&name=Earth&st=G&a=1&p=1&gh=78&alb=0.3&mp=1&rp=1[&cmp=1]
 *   catalog planet (Known planet tab or NASA search):
 *     ?mode=preset|nasa&planet=<catalog id>[&a=…][&p=…][&gh=…][&alb=…][&cmp=1]   (only user overrides)
 *   `mode=real` is accepted as an alias of `nasa`.
 *
 *   a   semi-major axis [AU]        p   surface pressure [bar]
 *   gh  greenhouse strength, 0–100 (%)   alb Bond albedo 0–1
 *   mp  planet mass [M⊕]             rp  planet radius [R⊕]   (hypothetical only)
 *   st  star type M K G F A B O WD   name preset (Earth, Venus, Mars); absent = Custom
 *   cmp 1 = "Compare to Earth" on
 *
 * The active tab lives in the hash (#results), not here. Every parameter is
 * validated: unparseable / non-positive values fall back to defaults, finite
 * out-of-range values are clamped. Decoding never throws.
 */
import type { StarType } from '../physics/types';
import { STAR_TYPES } from '../physics/types';
import { EARTH_GREENHOUSE } from './engine';
import { presetById, presetByName } from './presets';
import { type AppState, type ControlValues, type Mode, type ScenarioTab, defaultControls, presetControls, selectedEntry } from './state';

export const LIMITS = {
  a_AU: [0.01, 100],
  pressure_bar: [0.001, 100],
  greenhouse: [0, 1],
  albedo: [0, 1],
  mass_Mearth: [0.1, 20],
  radius_Rearth: [0.3, 4],
} as const satisfies Record<keyof ControlValues, readonly [number, number]>;

const EARTH_GH_PCT = Math.round(EARTH_GREENHOUSE * 100);

/** Greenhouse values are whole percents, except Earth's calibrated value, which its rounded percent maps to. */
export function quantizeGreenhouse(v: number): number {
  const pct = Math.round(Math.min(1, Math.max(0, v)) * 100);
  return pct === EARTH_GH_PCT ? EARTH_GREENHOUSE : pct / 100;
}

const clamp = (v: number, [lo, hi]: readonly [number, number]) => Math.min(hi, Math.max(lo, v));
const fmt = (x: number) => String(Number(x.toPrecision(6)));

function parseNum(raw: string | null): number | null {
  if (raw == null || raw.trim() === '') return null;
  const v = Number(raw);
  return Number.isFinite(v) ? v : null;
}

/** Positive-only quantities (a, p, mp, rp). */
function positive(raw: string | null, lim: readonly [number, number]): number | null {
  const v = parseNum(raw);
  return v != null && v > 0 ? clamp(v, lim) : null;
}

function fraction(raw: string | null, lim: readonly [number, number]): number | null {
  const v = parseNum(raw);
  return v != null ? clamp(v, lim) : null;
}

function greenhousePct(raw: string | null): number | null {
  const v = parseNum(raw);
  return v != null ? quantizeGreenhouse(clamp(v, [0, 100]) / 100) : null;
}

function starType(raw: string | null): StarType | null {
  if (!raw) return null;
  const t = raw.trim().toUpperCase();
  return (STAR_TYPES as readonly string[]).includes(t) ? (t as StarType) : null;
}

export interface DecodedUrl {
  mode: Mode;
  scenario: ScenarioTab;
  compare: boolean;
  preset: AppState['preset'];
  starType: StarType;
  hypo: ControlValues;
  /** Real mode only. */
  planetId: string | null;
  realOverrides: Partial<ControlValues>;
}

/** Decode a query string. Returns null when there is nothing to restore (no recognised params). */
export function decodeQuery(search: string): DecodedUrl | null {
  let q: URLSearchParams;
  try { q = new URLSearchParams(search); } catch { return null; }
  const known = ['mode', 'name', 'st', 'a', 'p', 'gh', 'alb', 'mp', 'rp', 'planet', 'cmp'];
  if (!known.some((k) => q.has(k))) return null;

  const rawMode = (q.get('mode') ?? '').trim().toLowerCase();
  const planetRaw = q.get('planet');
  const planetId = planetRaw && planetRaw.length <= 200 ? planetRaw : null;
  const scenario: ScenarioTab = rawMode === 'nasa' || rawMode === 'real' ? 'nasa' : rawMode === 'preset' ? 'preset' : 'hypothetical';
  const mode: Mode = scenario === 'nasa' || (scenario === 'preset' && planetId) ? 'real' : 'hypothetical';
  const preset = presetByName(q.get('name'));
  const base = preset ? presetControls(preset) : defaultControls();
  const a = positive(q.get('a'), LIMITS.a_AU);
  const p = positive(q.get('p'), LIMITS.pressure_bar);
  const gh = greenhousePct(q.get('gh'));
  const alb = fraction(q.get('alb'), LIMITS.albedo);

  const hypo: ControlValues = {
    a_AU: a ?? base.a_AU,
    pressure_bar: p ?? base.pressure_bar,
    greenhouse: gh ?? base.greenhouse,
    albedo: alb ?? base.albedo,
    mass_Mearth: positive(q.get('mp'), LIMITS.mass_Mearth) ?? base.mass_Mearth,
    radius_Rearth: positive(q.get('rp'), LIMITS.radius_Rearth) ?? base.radius_Rearth,
  };
  const realOverrides: Partial<ControlValues> = {};
  if (a != null) realOverrides.a_AU = a;
  if (p != null) realOverrides.pressure_bar = p;
  if (gh != null) realOverrides.greenhouse = gh;
  if (alb != null) realOverrides.albedo = alb;

  return {
    mode,
    scenario,
    compare: q.get('cmp') === '1' || q.get('cmp') === 'true',
    preset: preset?.id ?? null,
    starType: starType(q.get('st')) ?? preset?.starType ?? 'G',
    hypo,
    planetId,
    realOverrides: mode === 'real' ? realOverrides : {},
  };
}

/** Encode the shareable part of the state as a query string (no leading "?"). */
export function encodeState(state: AppState): string {
  const q = new URLSearchParams();
  if (state.mode === 'real') {
    const entry = selectedEntry(state);
    const id = entry?.id ?? state.pendingReal?.planetId ?? null;
    q.set('mode', state.scenario === 'preset' ? 'preset' : 'nasa');
    if (id) q.set('planet', id);
    const r = state.real;
    if (state.modified.has('a_AU')) q.set('a', fmt(r.a_AU));
    if (state.modified.has('surfacePressure_bar')) q.set('p', fmt(r.pressure_bar));
    if (state.modified.has('greenhouse')) q.set('gh', String(Math.round(r.greenhouse * 100)));
    if (state.modified.has('albedo')) q.set('alb', fmt(r.albedo));
    if (state.compare) q.set('cmp', '1');
    return q.toString();
  }
  const h = state.hypo;
  q.set('mode', state.scenario === 'preset' ? 'preset' : 'hypothetical');
  const p = presetById(state.preset);
  if (p) q.set('name', p.name);
  q.set('st', state.starType);
  q.set('a', fmt(h.a_AU));
  q.set('p', fmt(h.pressure_bar));
  q.set('gh', String(Math.round(h.greenhouse * 100)));
  q.set('alb', fmt(h.albedo));
  q.set('mp', fmt(h.mass_Mearth));
  q.set('rp', fmt(h.radius_Rearth));
  if (state.compare) q.set('cmp', '1');
  return q.toString();
}
