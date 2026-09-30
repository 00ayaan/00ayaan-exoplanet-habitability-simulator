// STUB written by Agent 0 so imports resolve during parallel work. Owner agent replaces this file.  Owner: Agent 4.
import type { MoonSpec, Result, TidalLocking } from './types';
export function tidalAcceleration(_perturberMass_kg: number, _planetRadius_m: number, _distance_m: number): Result { throw new Error("not implemented yet"); }
export function stellarTideRelativeToEarth(_stellarTide_m_s2: number): Result { throw new Error("not implemented yet"); }
export function moonTide(_moon: MoonSpec, _planetRadius_m: number | null): Result<number | null> { throw new Error("not implemented yet"); }
export function tidalLockingIndicator(_p: {
  starMass_kg: number; a_m: number; planetMass_kg: number | null; planetRadius_m: number | null;
  systemAge_yr: number | null; rotationPeriod_s: number | null; orbitalPeriod_s: number;
}): Result<TidalLocking> { throw new Error("not implemented yet"); }
