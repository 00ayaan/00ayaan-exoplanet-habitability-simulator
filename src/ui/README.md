# src/ui — UI layer (Agent 7)

Plain TypeScript + DOM + SVG. No framework, no runtime dependencies, so it wraps into Capacitor unchanged.

## Structure
- `engine.ts` is the **only** place the UI imports engine code from (`simulate`, `hypotheticalPlanet`, `defaultAtmosphere`, `loadCatalog`, `starPresets`, `starTypeLabels`, `EARTH_GREENHOUSE`). It re-exports `mock.ts` today. To go live, change only its export lines (the real paths are listed in its header comment).
- `state.ts` holds the single `AppState` and a pure function `buildInput(state) → SimulationInput`.
- `app.ts` builds the layout once. Every change goes through `scheduleUpdate()`, which runs `update()` once per animation frame. That keeps slider drags smooth on phones. `update()` is the one path that pushes state into components.
- `components/` has one component per file, as either `render<Thing>(container, props)` or a small class with `update(props)`. Components never query the global DOM:
  `Segmented` (mode switch + star chips), `Slider` (log/linear, tappable reference markers), `PlanetPicker`, `renderMeasured`, `OrbitView`, `renderResults`, `HabitabilityPanel`, `renderAssumptions`.
- `dom.ts`, `format.ts` and `starColor.ts` are small helpers. Display formatting lives only here, never in the physics code.

## Portability rules
- Asset paths are all relative (Vite `base: './'`). The service worker is registered only in production builds.
- Mobile-first CSS: 360 px is the design width, and two columns start at 900 px. Touch targets are at least 44 px, inputs are at least 16 px, the page respects `env(safe-area-inset-*)`, and it uses `touch-action: manipulation`.
- Nothing depends on hover: disclosures use `<details>` and choices use native radio inputs.
- Status is never shown by color alone (icon + text + border style). The habitability status is `aria-live`.
- The orbit animation starts paused under `prefers-reduced-motion` and stops while the tab is hidden.
