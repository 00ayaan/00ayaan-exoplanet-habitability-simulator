/**
 * THE seam between the UI and the engine. The UI imports engine functions from
 * here only, never from src/pipeline / src/data / src/physics/starPresets directly.
 *
 * Today: mocks. To go live (Agent 8), replace the import lines below with e.g.
 *   export { simulate, hypotheticalPlanet, defaultAtmosphere } from '../pipeline/simulate';
 *   export { loadCatalog } from '../data/catalog';
 *   export { STAR_PRESETS as starPresets, STAR_TYPE_LABELS as starTypeLabels } from '../physics/starPresets';
 *   export { EARTH_GREENHOUSE } from '../physics/atmosphere';
 */
export { simulate, hypotheticalPlanet, defaultAtmosphere } from '../pipeline/simulate';
export { loadCatalog } from '../data/catalog';
export { STAR_PRESETS as starPresets, STAR_TYPE_LABELS as starTypeLabels } from '../physics/starPresets';
export { EARTH_GREENHOUSE } from '../physics/atmosphere';
