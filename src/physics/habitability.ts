// STUB written by Agent 0 so imports resolve during parallel work. Owner agent replaces this file.  Owner: Agent 5.
import type { HabitabilityResult, TidalLocking, WaterPhase } from './types';
export interface HabitabilityInputs {
  surfaceTemp_K: number; waterPhase: WaterPhase; surfacePressure_bar: number;
  insolation_Searth: number; starTeff_K: number;
  tidalLocking: TidalLocking; stellarTideRelEarth: number | null;
  atmosphereAssumed: boolean; missing: string[];
}
export const DEFAULT_THRESHOLDS = {} as Record<string, unknown>;
export function classifyHabitability(_inputs: HabitabilityInputs, _thresholds: Record<string, unknown> = DEFAULT_THRESHOLDS): HabitabilityResult { throw new Error("not implemented yet"); }
