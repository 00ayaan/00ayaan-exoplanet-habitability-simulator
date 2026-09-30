/**
 * Unit conversions at the edge — OWNED BY AGENT 0 (contract file).
 *
 * Contract objects (Star, Planet, Atmosphere) use astronomer-friendly units
 * (AU, R_sun, M_earth, bar). Physics functions take and return SI.
 * These helpers are the ONLY place conversions happen.
 */
import {
  AU, BAR_PA, DAY, L_SUN, M_EARTH, M_JUPITER, M_SUN, R_EARTH, R_JUPITER, R_SUN, YEAR,
} from './constants';

export const auToM = (au: number): number => au * AU;
export const mToAu = (m: number): number => m / AU;
export const rSunToM = (r: number): number => r * R_SUN;
export const mSunToKg = (m: number): number => m * M_SUN;
export const lSunToW = (l: number): number => l * L_SUN;
export const wToLSun = (w: number): number => w / L_SUN;
export const rEarthToM = (r: number): number => r * R_EARTH;
export const mEarthToKg = (m: number): number => m * M_EARTH;
export const rJupToREarth = (r: number): number => (r * R_JUPITER) / R_EARTH;
export const mJupToMEarth = (m: number): number => (m * M_JUPITER) / M_EARTH;
export const barToPa = (p: number): number => p * BAR_PA;
export const sToDays = (s: number): number => s / DAY;
export const sToYears = (s: number): number => s / YEAR;
export const daysToS = (d: number): number => d * DAY;
export const kToC = (k: number): number => k - 273.15;
