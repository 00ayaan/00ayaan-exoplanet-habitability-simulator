// STUB written by Agent 0 so imports resolve during parallel work. Owner agent replaces this file.  Owner: Agent 3.
import type { Result } from './types';
import { SIGMA_SB } from './constants';
export function surfaceGravity(_mass_kg: number | null, _radius_m: number | null): Result<number | null> { throw new Error("not implemented yet"); }
/** PROVISIONAL (Agent 0): T = [F(1−A)/(4σ)]^¼. Agent 3 owns and must document + test. */
export function equilibriumTemperature(flux_W_m2: number, albedo: number): Result {
  return { value: ((flux_W_m2 * (1 - albedo)) / (4 * SIGMA_SB)) ** 0.25, unit: 'K', assumptions: [] };
}
