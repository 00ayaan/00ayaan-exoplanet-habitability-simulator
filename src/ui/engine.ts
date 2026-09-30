/**
 * THE seam between the UI and the engine. The UI imports engine functions from
 * here only, never from src/pipeline / src/data / src/physics/starPresets directly.
 *
 * Live: points at the real deterministic engine. A future native UI (e.g. a
 * Capacitor plugin screen or a React Native port) should consume the same
 * modules through an equivalent seam. src/ui/mock.ts remains for UI-only work.
 */
export { simulate, hypotheticalPlanet, defaultAtmosphere } from '../pipeline/simulate';
export { loadCatalog } from '../data/catalog';
export { STAR_PRESETS as starPresets, STAR_TYPE_LABELS as starTypeLabels } from '../physics/starPresets';
export { EARTH_GREENHOUSE } from '../physics/atmosphere';
