/**
 * Quick-start planet presets (hypothetical mode, around the G preset = the IAU nominal Sun).
 *
 * Source for a, Bond albedo, surface pressure, mass and radius:
 * NASA Goddard, "Planetary Fact Sheets" (D. R. Williams), nssdc.gsfc.nasa.gov/planetary/factsheet/
 *   Earth: a 1.000 AU, Bond albedo 0.306, surface pressure 1.014 bar, mass 1, mean radius 1 (by definition)
 *   Venus: a 0.723 AU, Bond albedo 0.76,  surface pressure 92 bar,   mass 0.815 M⊕, radius 0.949 R⊕
 *   Mars:  a 1.524 AU, Bond albedo 0.25,  surface pressure 0.006 bar (6.36 mbar mean), mass 0.107 M⊕, radius 0.532 R⊕
 * Deliberate rounding: Earth uses A = 0.30 and P = 1 bar (the model's calibration point),
 * not 0.306 / 1.014, so the Earth preset reproduces ≈ 288 K exactly (DESIGN §25).
 *
 * Greenhouse strength is NOT a measured quantity — it is this model's single knob:
 *   Earth = EARTH_GREENHOUSE (calibration), Venus = 1 (strongest the model allows), Mars = 0 (thin CO₂, ignored).
 */
import type { StarType } from '../physics/types';
import { EARTH_GREENHOUSE } from './engine';

export type PresetId = 'earth' | 'venus' | 'mars';

export interface PlanetPreset {
  id: PresetId;
  /** Display name, also the `name=` URL value. */
  name: string;
  starType: StarType;
  a_AU: number;
  pressure_bar: number;
  greenhouse: number;
  albedo: number;
  mass_Mearth: number;
  radius_Rearth: number;
  /** One-line note shown under the preset row. */
  note: string;
}

export const PRESETS: readonly PlanetPreset[] = [
  {
    id: 'earth', name: 'Earth', starType: 'G',
    a_AU: 1, pressure_bar: 1, greenhouse: EARTH_GREENHOUSE, albedo: 0.3, mass_Mearth: 1, radius_Rearth: 1,
    note: 'Our baseline: temperate, liquid oceans, 1 bar. The model is calibrated to about 288 K here.',
  },
  {
    id: 'venus', name: 'Venus', starType: 'G',
    a_AU: 0.723, pressure_bar: 92, greenhouse: 1, albedo: 0.76, mass_Mearth: 0.815, radius_Rearth: 0.949,
    note: 'Real Venus is about 737 K. This one-layer model cannot reach that, which is a known limit.',
  },
  {
    id: 'mars', name: 'Mars', starType: 'G',
    a_AU: 1.524, pressure_bar: 0.006, greenhouse: 0, albedo: 0.25, mass_Mearth: 0.107, radius_Rearth: 0.532,
    note: 'Mars’s air is so thin that liquid water can’t last on the surface.',
  },
];

export function presetById(id: string | null | undefined): PlanetPreset | null {
  return PRESETS.find((p) => p.id === id) ?? null;
}

export function presetByName(name: string | null | undefined): PlanetPreset | null {
  if (!name) return null;
  const n = name.trim().toLowerCase();
  return PRESETS.find((p) => p.name.toLowerCase() === n) ?? null;
}

/** Real planets to feature above the search box, if present in the catalog. */
export const FEATURED_PLANETS: readonly string[] = ['Proxima Cen b', 'TRAPPIST-1 e', 'Kepler-452 b', 'Kepler-186 f', 'TOI-700 d', 'LHS 1140 b', 'K2-18 b'];
