/** The single app state object and its pure derivation into a SimulationInput. */
import type { Catalog, CatalogEntry, SimulationInput, SimulationOutput, StarType } from '../physics/types';
import { defaultAtmosphere, hypotheticalPlanet, starPresets } from './engine';

export type Mode = 'hypothetical' | 'real';
export type CatalogStatus = 'loading' | 'ok' | 'empty' | 'error';

/** Slider-driven values. Real mode keeps its own copy so toggling modes restores each. */
export interface ControlValues {
  a_AU: number;
  pressure_bar: number;
  greenhouse: number;
}

/** Field names used in SimulationInput.modifiedFields. */
export type ModifiableField = 'a_AU' | 'surfacePressure_bar' | 'greenhouse';

export const FIELD_LABELS: Record<ModifiableField, string> = {
  a_AU: 'orbital distance',
  surfacePressure_bar: 'surface pressure',
  greenhouse: 'greenhouse strength',
};

export interface AppState {
  mode: Mode;
  starType: StarType;
  hypo: ControlValues;
  real: ControlValues;
  /** Real mode: which sliders the user moved away from the measured/default baseline. */
  modified: Set<ModifiableField>;
  catalog: Catalog | null;
  catalogStatus: CatalogStatus;
  selectedId: string | null;
  filter: string;
  output: SimulationOutput | null;
  error: string | null;
}

export function initialState(): AppState {
  const atm = defaultAtmosphere();
  const base = { a_AU: 1, pressure_bar: atm.surfacePressure_bar, greenhouse: atm.greenhouse };
  return {
    mode: 'hypothetical',
    starType: 'G',
    hypo: { ...base },
    real: { ...base },
    modified: new Set(),
    catalog: null,
    catalogStatus: 'loading',
    selectedId: null,
    filter: '',
    output: null,
    error: null,
  };
}

export function selectedEntry(state: AppState): CatalogEntry | null {
  if (!state.catalog || !state.selectedId) return null;
  return state.catalog.entries.find((e) => e.id === state.selectedId) ?? null;
}

/** Baseline control values for a real planet: measured a, default (assumed) atmosphere. */
export function realBaseline(entry: CatalogEntry): ControlValues {
  const atm = defaultAtmosphere();
  return { a_AU: entry.planet.a_AU, pressure_bar: atm.surfacePressure_bar, greenhouse: atm.greenhouse };
}

export const controlsFor = (state: AppState): ControlValues => (state.mode === 'real' ? state.real : state.hypo);

/** Pure: state → engine input. Returns null when real mode has no planet selected. */
export function buildInput(state: AppState): SimulationInput | null {
  const c = controlsFor(state);
  const atmosphere = { ...defaultAtmosphere(), surfacePressure_bar: c.pressure_bar, greenhouse: c.greenhouse };
  if (state.mode === 'hypothetical') {
    return {
      star: starPresets[state.starType],
      planet: hypotheticalPlanet(c.a_AU),
      atmosphere,
      mode: 'hypothetical',
      modifiedFields: [],
    };
  }
  const entry = selectedEntry(state);
  if (!entry) return null;
  return {
    star: entry.star,
    planet: { ...entry.planet, a_AU: c.a_AU },
    atmosphere,
    mode: 'real',
    modifiedFields: [...state.modified],
  };
}
