/** Display formatting. UI-only; physics never formats. */
import type { Measured } from '../physics/types';
import { AU, DAY, G_EARTH_STANDARD, S_EARTH, YEAR } from '../physics/constants';

export const UNKNOWN = 'unknown';

/** Significant-figure formatting with sensible switch to exponent for extremes. */
export function num(x: number | null | undefined, sig = 3): string {
  if (x == null || !Number.isFinite(x)) return UNKNOWN;
  if (x === 0) return '0';
  const ax = Math.abs(x);
  if (ax >= 1e6 || ax < 1e-3) {
    const [m, e] = x.toExponential(sig - 1).split('e');
    return `${m}×10${superscript(Number(e))}`;
  }
  const p = Number(x.toPrecision(sig));
  return p.toLocaleString('en-US', { maximumFractionDigits: 6 });
}

const SUP: Record<string, string> = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
const superscript = (n: number) => String(n).split('').map((c) => SUP[c] ?? c).join('');

export const kelvin = (k: number | null) => (k == null ? UNKNOWN : `${Math.round(k)} K`);
export const celsius = (k: number | null) => (k == null ? UNKNOWN : `${Math.round(k - 273.15)} °C`);
export const auFromM = (m: number) => m / AU;
export const days = (s: number) => s / DAY;
export const years = (s: number) => s / YEAR;
export const sEarth = (w: number) => w / S_EARTH;
export const gEarth = (g: number) => g / G_EARTH_STANDARD;

/** Format a value with optional ± uncertainty from a Measured record; null → "unknown". */
export function measured(value: number | null | undefined, unit: string, m?: Measured | null, sig = 3): string {
  if (value == null) return UNKNOWN;
  let out = `${num(value, sig)}${unit ? ' ' + unit : ''}`;
  const up = m?.errPlus, dn = m?.errMinus;
  if (up != null && dn != null) {
    const a = Math.abs(up), b = Math.abs(dn);
    out += Math.abs(a - b) <= 1e-12 * Math.max(a, b, 1) ? ` ± ${num(a, 2)}` : ` (+${num(a, 2)} / −${num(b, 2)})`;
  } else if (up != null) out += ` (+${num(Math.abs(up), 2)})`;
  else if (dn != null) out += ` (−${num(Math.abs(dn), 2)})`;
  return out;
}

/** "1 year", "2 years", "0.5 years": singular only when the displayed number is exactly 1. */
export function plural(x: number | null | undefined, singular: string, pluralForm = singular + 's', sig = 3): string {
  const t = num(x, sig);
  if (t === UNKNOWN) return UNKNOWN;
  return `${t} ${t === '1' ? singular : pluralForm}`;
}

export function waterPhaseLabel(p: string): string {
  switch (p) {
    case 'ice': return 'Ice';
    case 'liquid': return 'Liquid';
    case 'vapor': return 'Vapor';
    case 'no-liquid-below-triple-point': return 'No liquid (below triple point)';
    default: return p;
  }
}
