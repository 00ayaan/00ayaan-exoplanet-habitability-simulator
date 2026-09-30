# Changelog

All notable changes to this project are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: [Semantic Versioning](https://semver.org/).
Any change to a model value (constant, threshold, equation) must add an entry here and update [ASSUMPTIONS.md](ASSUMPTIONS.md).

## [Unreleased]

### Added
- UI work in progress: data-snapshot banner, provenance panel, result bar (Agent 7, uncommitted at the time of writing).
- Independent validation suite in `validation/` (Agent 9, in progress). Its report will be `validation/VALIDATION_REPORT.md`.

## [0.1.0] - 2026-09-29 — "Prototype 1"

The first working version: a real or hypothetical planet goes in, and physically interpretable conditions plus a model-defined habitability classification come out.

### Added
- **Agent 0 (Architect / Integrator)** (`f3eaea2`): TypeScript + Vite scaffold; the frozen shared contract `src/physics/types.ts`; CODATA 2018 / IAU 2015 constants (`constants.ts`) and edge-unit conversions (`units.ts`); `AGENTS.md` (ownership, frozen signatures, ground rules); `DESIGN.md` with adaptation notes; the CI workflow (typecheck, test, build) and the GitHub Pages deploy workflow with a weekly data refresh.
- **Agent 1 (Star)** (`f9c0f42`): Stefan–Boltzmann luminosity; catalog-vs-computed luminosity resolution; inverse-square flux and insolation relative to Earth; star presets for M, K, F, A, B and O from Pecaut & Mamajek (2013) / Mamajek table v2022.04.16, the IAU 2015 nominal Sun for G, and a 0.6 M☉ DA white dwarf.
- **Agent 2 (Orbit)** (`c281988`): Kepler's third law (including planet mass); the orbit equation; periapsis and apoapsis; a robust Kepler-equation solver (Newton + bisection fallback); orbit sampling uniform in time, so the animation speeds up at periapsis.
- **Agent 3 (Climate)** (`0999ca5`): surface gravity (null when mass or radius is unknown); equilibrium temperature; the simplified one-layer greenhouse model; the greenhouse → ε mapping; the Earth calibration that gives 288 K.
- **Agent 4 (Water & Tides)** (`6103a33`): approximate water phase (fixed thresholds plus the triple-point rule, behind a replaceable `PhaseModel` strategy); point-mass tidal acceleration; stellar tide relative to Earth; moon tide (never invents an exomoon); a qualitative tidal-locking indicator (Gladman et al. 1996 timescale, binned and never displayed).
- **Agent 5 (Habitability)** (`a4e6250`): five independent checks (temperature and liquid water as critical; pressure, irradiation and tides as supporting); star-dependent habitable-zone limits from Kopparapu et al. (2014); the three-way classification with confidence and plain-language reasons; `thresholds.json` with a `source` and `status` for every number.
- **Agent 6 (Data)** (`95877c2`, `d40afdc`): NASA Exoplanet Archive TAP query (`ps` table, `default_flag = 1`, small planets); a pure parser shared by the build script and the app; a build-time snapshot script with retry and a safe atomic write; a dev fixture; uncertainty and reference preservation; missing and derived fields tracked. Radial-velocity-only planets (mass < 10 M⊕, no radius) are included, with radius left unknown.
- **Agent 7 (UI / Visualization)** (`f685012`): mobile-first DOM + SVG UI; mode switch, star chips, three sliders, planet picker; animated SVG orbit with the star at the focus; results, habitability and assumptions panels; PWA manifest, icons and service worker (offline). Built against mocks first.
- **Agent 8 (Pipeline)** (`3656953`): `simulate()` wires every module in DESIGN §21 order; `hypotheticalPlanet()`, `defaultAtmosphere()`; the real-planet rule; the UI switched from mocks to the real engine.
- **Agent 10 (Science review / Docs)**: `README.md`, `ASSUMPTIONS.md` (science audit and study guide), `CHANGELOG.md`, `docs/mobile.md`, `docs/agents-workflow.md`.

### Model decisions

- **TypeScript + Vite instead of Python + Streamlit.** GitHub Pages only serves static files, and Streamlit needs a running Python server. The same static build can also be wrapped as an iOS/Android app with Capacitor. The physics is closed-form, so NumPy/SciPy were not needed. Constants are transcribed from the same CODATA 2018 / IAU 2015 sets that Astropy uses.
- **Hand-built SVG instead of Plotly.** Plotly is several MB, which is too heavy for phones. SVG is small, sharp at any size, touch-friendly and works offline.
- **`thresholds.json` instead of `thresholds.yaml`.** Browsers parse JSON natively, so no YAML library is needed. Every value keeps a `source` and a `status`.
- **Archive snapshot at build time instead of live queries.** GitHub Actions fetches the archive (weekly and on each deploy) into `public/data/exoplanets.json`. The app stays fast and offline-capable, avoids CORS, and each deploy has a fixed, versioned dataset.
- **Real-planet rule.** Measured star and planet values (T_eff, R★, M★, L★, planet mass and radius, e) stay fixed. Only orbital distance, surface pressure and greenhouse strength can be changed with sliders. Any change is labelled "Modified from archive values" in provenance, and requests to change other fields are ignored with a note. (Decided by the owner.)
- **ε = greenhouse slider (identity mapping).** The slider *is* the one-layer infrared emissivity, so there is no hidden calibration curve. It is not a gas amount.
- **Earth greenhouse calibration: `EARTH_GREENHOUSE` ≈ 0.7788.** Solved from ε = 2[1 − (T_eq/288 K)⁴] with T_eq = 254.6 K (Sun, 1 AU, A = 0.30). It is computed from the constants when the module loads, not hard-coded, and it is the default slider value.
- **G preset = IAU nominal Sun** (not Mamajek's G2V row), so the Earth test gives S = 1 and 288 K exactly.
- **Optimistic habitable zone as the pass limit** (Recent Venus to Early Mars). The conservative limits appear in the reason text. Outside 2600–7200 K, T_eff is clamped and confidence drops.
- **Radial-velocity-only planets included with unknown radius.** Planets without a measured radius but with mass < 10 M⊕ (e.g. Proxima Cen b) are in the catalog. Their radius is never guessed, so gravity, tides and tidal locking show "unknown" and confidence is low. Their mass may be a minimum mass (M sin i); this is flagged.
- **Atmosphere always treated as assumed.** No measured atmospheres are used in Prototype 1, so confidence is at most "medium".
- **Tidal-locking timescale never shown.** Only a category (likely / possible / unlikely / unknown) is displayed, because Q and k₂ are unknown for exoplanets.
- **Physics, data and pipeline never touch the DOM**, so the engine can run in a web worker, a Capacitor app or a future native UI.

[Unreleased]: https://github.com/00ayaan/00ayaan-exoplanet-habitability-simulator/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/00ayaan/00ayaan-exoplanet-habitability-simulator/releases/tag/v0.1.0
