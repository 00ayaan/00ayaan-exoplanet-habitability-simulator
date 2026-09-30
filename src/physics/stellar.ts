// STUB written by Agent 0 so imports resolve during parallel work. Owner agent replaces this file.  Owner: Agent 1.
import type { Result, Star } from './types';
import { S_EARTH } from './constants';
export function luminosityFromRadiusTeff(_radius_m: number, _teff_K: number): Result { throw new Error("not implemented yet"); }
export function resolveLuminosity(_star: Star): Result { throw new Error("not implemented yet"); }
/** PROVISIONAL (Agent 0): F = L / (4πr²). Agent 1 owns and must document + test. */
export function fluxAtDistance(luminosity_W: number, distance_m: number): Result {
  return { value: luminosity_W / (4 * Math.PI * distance_m ** 2), unit: 'W m^-2', assumptions: [] };
}
export function relativeInsolation(luminosity_W: number, distance_m: number): Result {
  return { value: fluxAtDistance(luminosity_W, distance_m).value / S_EARTH, unit: 'S_earth', assumptions: [] };
}
