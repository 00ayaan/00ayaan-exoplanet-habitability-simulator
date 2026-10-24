/** The single app state object and pure helpers that derive from it. */
import type { Catalog, CatalogEntry, SimulationInput, SimulationOutput, StarType } from '../physics/types';
import { defaultAtmosphere, hypotheticalPlanet, starPresets } from './engine';
import { type PlanetPreset, type PresetId, presetById } from './presets';

export type Mode = 'hypothetical' | 'real';
/** Scenario tab shown to the user. Hypothetical → hypothetical engine; Known planet → solar preset
 *  (hypothetical engine) or featured catalog planet (real engine); NASA search → real engine. */
export type ScenarioTab = 'hypothetical' | 'preset' | 'nasa';
export type CatalogStatus = 'loading' | 'ok' | 'empty' | 'error';
export type TabId = 'setup' | 'results' | 'orbit' | 'model';
export const TABS: readonly { id: TabId; label: string }[] = [
  { id: 'setup', label: 'Setup' },
  { id: 'results', label: 'Results' },
  { id: 'orbit', label: 'Orbit' },
  { id: 'model', label: 'Model' },
];

/** Slider-driven values. Real mode keeps its own copy (mass/radius unused there: they stay measured). */
export interface ControlValues {
  a_AU: number;
  pressure_bar: number;
  greenhouse: number;
  albedo: number;
  mass_Mearth: number;
  radius_Rearth: number;
}
export type ControlKey = keyof ControlValues;

/** Field names used in SimulationInput.modifiedFields (real mode). */
export type ModifiableField = 'a_AU' | 'surfacePressure_bar' | 'greenhouse' | 'albedo';
export const REAL_FIELD: Partial<Record<ControlKey, ModifiableField>> = {
  a_AU: 'a_AU', pressure_bar: 'surfacePressure_bar', greenhouse: 'greenhouse', albedo: 'albedo',
};
export const FIELD_LABELS: Record<ModifiableField, string> = {
  a_AU: 'orbital distance',
  surfacePressure_bar: 'surface pressure',
  greenhouse: 'greenhouse strength',
  albedo: 'albedo',
};

/** Where an input value comes from (mirrors the reference app's `src` tags). */
export type SourceTag = 'measured' | 'assumed' | 'modified' | 'unknown';

export interface AppState {
  /** Engine mode (derived from the scenario tab + selection). */
  mode: Mode;
  scenario: ScenarioTab;
  /** "Compare to Earth" switch. */
  compare: boolean;
  /** Hypothetical mode: the quick-start preset the values came from (null = Custom). */
  preset: PresetId | null;
  starType: StarType;
  hypo: ControlValues;
  real: ControlValues;
  /** Real mode: which sliders the user moved away from the measured/default baseline. */
  modified: Set<ModifiableField>;
  catalog: Catalog | null;
  catalogStatus: CatalogStatus;
  selectedId: string | null;
  /** From the URL, applied once the catalog arrives. */
  pendingReal: { planetId: string | null; overrides: Partial<ControlValues>; scenario: ScenarioTab } | null;
  filter: string;
  tab: TabId;
  output: SimulationOutput | null;
  error: string | null;
}

export function defaultControls(): ControlValues {
  const atm = defaultAtmosphere();
  return { a_AU: 1, pressure_bar: atm.surfacePressure_bar, greenhouse: atm.greenhouse, albedo: atm.albedo, mass_Mearth: 1, radius_Rearth: 1 };
}

export function presetControls(p: PlanetPreset): ControlValues {
  return { a_AU: p.a_AU, pressure_bar: p.pressure_bar, greenhouse: p.greenhouse, albedo: p.albedo, mass_Mearth: p.mass_Mearth, radius_Rearth: p.radius_Rearth };
}

export function initialState(): AppState {
  const earth = presetById('earth')!;
  return {
    mode: 'hypothetical',
    scenario: 'preset',
    compare: false,
    preset: 'earth',
    starType: earth.starType,
    hypo: presetControls(earth),
    real: defaultControls(),
    modified: new Set(),
    catalog: null,
    catalogStatus: 'loading',
    selectedId: null,
    pendingReal: null,
    filter: '',
    tab: 'setup',
    output: null,
    error: null,
  };
}

export const same = (a: number, b: number): boolean => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

const KEYS: readonly ControlKey[] = ['a_AU', 'pressure_bar', 'greenhouse', 'albedo', 'mass_Mearth', 'radius_Rearth'];

/** Hypothetical values to return to on Reset: the preset's, or the model defaults. */
export function hypoBaseline(state: AppState): { starType: StarType; values: ControlValues } {
  const p = presetById(state.preset);
  return p ? { starType: p.starType, values: presetControls(p) } : { starType: 'G', values: defaultControls() };
}

/** True when the hypothetical inputs differ from where Reset would take them. */
export function hypoDirty(state: AppState): boolean {
  const b = hypoBaseline(state);
  return b.starType !== state.starType || KEYS.some((k) => !same(b.values[k], state.hypo[k]));
}

export function selectedEntry(state: AppState): CatalogEntry | null {
  if (!state.catalog || !state.selectedId) return null;
  return state.catalog.entries.find((e) => e.id === state.selectedId) ?? null;
}

/** Baseline control values for a real planet: measured a, default (assumed) atmosphere and albedo. */
export function realBaseline(entry: CatalogEntry): ControlValues {
  return { ...defaultControls(), a_AU: entry.planet.a_AU, mass_Mearth: entry.planet.mass_Mearth ?? 1, radius_Rearth: entry.planet.radius_Rearth ?? 1 };
}

export const controlsFor = (state: AppState): ControlValues => (state.mode === 'real' ? state.real : state.hypo);

/** Recompute the real-mode modified set by comparing against the measured/default baseline. */
export function recomputeModified(state: AppState): void {
  const entry = selectedEntry(state);
  state.modified.clear();
  if (!entry) return;
  const base = realBaseline(entry);
  for (const [k, f] of Object.entries(REAL_FIELD) as [ControlKey, ModifiableField][]) {
    if (!same(base[k], state.real[k])) state.modified.add(f);
  }
}

/** Source tag for an input value, shown as a small badge next to it. */
export function sourceTag(state: AppState, key: ControlKey | 'star' | 'ecc'): SourceTag {
  if (state.mode === 'real') {
    const entry = selectedEntry(state);
    if (!entry) return 'unknown';
    if (key === 'star') return 'measured';
    if (key === 'ecc') return entry.missing.includes('pl_orbeccen') ? 'assumed' : 'measured';
    if (key === 'mass_Mearth') return entry.planet.mass_Mearth == null ? 'unknown' : 'measured';
    if (key === 'radius_Rearth') return entry.planet.radius_Rearth == null ? 'unknown' : 'measured';
    const f = REAL_FIELD[key];
    if (f && state.modified.has(f)) return 'modified';
    return key === 'a_AU' ? 'measured' : 'assumed';
  }
  const p = presetById(state.preset);
  if (key === 'star') return p && p.starType === state.starType ? 'measured' : 'assumed';
  if (key === 'ecc') return 'assumed';
  if (!p) return 'assumed';
  const changed = !same(presetControls(p)[key], state.hypo[key]);
  if (changed) return 'modified';
  // Greenhouse strength is a model knob, never a measurement.
  return key === 'greenhouse' ? 'assumed' : 'measured';
}

/** Pure: state → engine input. Returns null when real mode has no planet selected. */
export function buildInput(state: AppState): (SimulationInput & { missing?: string[] }) | null {
  const c = controlsFor(state);
  const atmosphere = { surfacePressure_bar: c.pressure_bar, greenhouse: c.greenhouse, albedo: c.albedo };
  if (state.mode === 'hypothetical') {
    const p = presetById(state.preset);
    const name = p ? (hypoDirty(state) ? `Custom (from ${p.name})` : p.name) : 'Hypothetical planet';
    return {
      star: starPresets[state.starType],
      planet: { ...hypotheticalPlanet(c.a_AU), name, mass_Mearth: c.mass_Mearth, radius_Rearth: c.radius_Rearth },
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
    missing: entry.missing,
  };
}

/** Heading for the scenario card. */
export function scenarioName(state: AppState): string {
  if (state.mode === 'real') return selectedEntry(state)?.planet.name ?? (state.catalogStatus === 'loading' ? 'Loading planets…' : 'Choose a planet');
  const p = presetById(state.preset);
  return p ? (hypoDirty(state) ? `Custom (from ${p.name})` : p.name) : 'Custom';
}
