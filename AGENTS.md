# AGENTS.md — how this repo is built

The simulator is built by scoped agents working in parallel against a frozen contract
(`src/physics/types.ts`). This file is the contract's companion: the frozen function
signatures, file ownership, and ground rules. Agent 0 (Architect/Integrator) owns it.

## Ground rules (every agent)

1. **Edit only the files you own** (table below). Need a contract change? Stop and report it — Agent 0 decides.
2. **Pure, deterministic functions.** No randomness, no I/O, no globals, no `Date.now()` in `src/physics/`.
3. **SI inside physics functions**, unit suffix on every parameter name (`distance_m`, `teff_K`). Convert only through `src/physics/units.ts`. Constants only from `src/physics/constants.ts`.
4. **Return `Result`**, never a bare number, from every exported physics function (helpers explicitly listed below excepted). `assumptions` lists what the value depends on in plain language.
5. **Document every exported function** with a TSDoc block giving: the equation, units of every input/output, assumptions, and valid range.
6. **Never guess missing data.** Unknown → `null` + a note. Never invent an exomoon, an atmosphere, or a mass.
7. **No LLM in the physics path.** Code only.
8. **Tests:** module authors write `tests/unit/<module>.test.ts`. Agent 9 independently owns `validation/`. Nothing merges unless `npm test` and `npm run typecheck` pass.
9. **Invalid inputs** (negative distance, e ≥ 1, albedo outside [0,1]) throw `RangeError` with a clear message. The UI prevents them; physics still guards.
10. **Mobile portability:** nothing in `src/physics/`, `src/data/` or `src/pipeline/` may touch the DOM. Only `src/ui/` does. This keeps the engine reusable in a Capacitor app or a future native UI.

## Ownership

| Agent | Role | Owns |
|---|---|---|
| 0 | Architect / Integrator | `src/physics/types.ts`, `constants.ts`, `units.ts`, `AGENTS.md`, `DESIGN.md`, config files, `.github/workflows/` |
| 1 | Star | `src/physics/stellar.ts`, `src/physics/starPresets.ts`, `tests/unit/stellar.test.ts` |
| 2 | Orbit | `src/physics/orbit.ts`, `tests/unit/orbit.test.ts` |
| 3 | Climate | `src/physics/planet.ts`, `src/physics/atmosphere.ts`, `tests/unit/planet.test.ts`, `tests/unit/atmosphere.test.ts` |
| 4 | Water & Tides | `src/physics/water.ts`, `src/physics/tides.ts`, `tests/unit/water.test.ts`, `tests/unit/tides.test.ts` |
| 5 | Habitability | `src/physics/habitability.ts`, `src/physics/thresholds.json`, `tests/unit/habitability.test.ts` |
| 6 | Data | `src/data/`, `scripts/fetch-exoplanets.mjs`, `public/data/`, `tests/unit/data.test.ts` |
| 7 | UI / Visualization | `index.html`, `src/ui/`, `src/main.ts`, `public/manifest.webmanifest`, `public/icons/`, `public/sw.js` |
| 8 | Pipeline | `src/pipeline/`, `tests/unit/simulate.test.ts` |
| 9 | Validation (independent) | `validation/` |
| 10 | Science review / docs | `README.md`, `ASSUMPTIONS.md`, `CHANGELOG.md`, `docs/` |

## Frozen signatures

All imports of types come from `src/physics/types.ts`.

### Agent 1 — `stellar.ts`
```ts
luminosityFromRadiusTeff(radius_m: number, teff_K: number): Result            // W. L = 4πR²σT⁴
resolveLuminosity(star: Star): Result                                           // W. Uses star.luminosity_Lsun if non-null, else computes; says which in assumptions
fluxAtDistance(luminosity_W: number, distance_m: number): Result                // W m^-2. F = L / (4πr²)
relativeInsolation(luminosity_W: number, distance_m: number): Result            // unit "S_earth". F / S_EARTH
```
### Agent 1 — `starPresets.ts`
```ts
STAR_PRESETS: Readonly<Record<StarType, Star>>   // typical main-sequence (and one white dwarf) values, source "preset:<type>", reference cited
STAR_TYPE_LABELS: Readonly<Record<StarType, string>>  // e.g. "M — red dwarf"
getStarPreset(type: StarType): Star
```

### Agent 2 — `orbit.ts`
```ts
orbitalPeriod(a_m: number, starMass_kg: number, planetMass_kg?: number): Result // s. P = 2π√(a³/(G(M★+Mp)))
distanceAtTrueAnomaly(a_m: number, e: number, trueAnomaly_rad: number): Result  // m. r = a(1−e²)/(1+e cosθ)
periapsis(a_m: number, e: number): Result                                      // m
apoapsis(a_m: number, e: number): Result                                       // m
solveKepler(meanAnomaly_rad: number, e: number): number                        // helper: eccentric anomaly E (bare number allowed)
sampleOrbit(a_m: number, e: number, luminosity_W: number, albedo: number, n: number): OrbitSample[]
// n samples uniform in TIME (via Kepler's equation) so the planet speeds up at periapsis when animated.
// Uses fluxAtDistance (stellar.ts) and equilibriumTemperature (planet.ts).
```

### Agent 3 — `planet.ts`
```ts
surfaceGravity(mass_kg: number | null, radius_m: number | null): Result<number | null>  // m s^-2. g = GM/R²; null if either unknown
equilibriumTemperature(flux_W_m2: number, albedo: number): Result                        // K. T = [F(1−A)/(4σ)]^¼
```
### Agent 3 — `atmosphere.ts`
```ts
EARTH_GREENHOUSE: number                                   // slider value that reproduces Earth ≈ 288 K at A = 0.30, 1 AU, G star
greenhouseToEpsilon(greenhouse: number): Result             // dimensionless ε in [0, 1]
surfaceTemperature(flux_W_m2: number, albedo: number, epsilon: number): Result  // K. T = [(1−A)F/(4σ(1−ε/2))]^¼  (SIMPLIFIED one-layer model)
```

### Agent 4 — `water.ts`
```ts
waterPhase(surfaceTemp_K: number, surfacePressure_bar: number): Result<WaterPhase>
// Prototype: approximate thresholds (273.15 / 373.15 K), plus: below the triple-point pressure liquid is impossible.
// Structure it so a vapor-pressure (Clausius–Clapeyron / IAPWS) model can replace the thresholds later.
```
### Agent 4 — `tides.ts`
```ts
tidalAcceleration(perturberMass_kg: number, planetRadius_m: number, distance_m: number): Result  // m s^-2. a ≈ 2GMR/r³
stellarTideRelativeToEarth(stellarTide_m_s2: number): Result          // dimensionless, vs the Sun's tide on Earth
moonTide(moon: MoonSpec, planetRadius_m: number | null): Result<number | null>  // null for unknown/none (note says which)
tidalLockingIndicator(p: {
  starMass_kg: number; a_m: number;
  planetMass_kg: number | null; planetRadius_m: number | null;
  systemAge_yr: number | null; rotationPeriod_s: number | null;
  orbitalPeriod_s: number;
}): Result<TidalLocking>   // QUALITATIVE only (DESIGN §17)
```

### Agent 5 — `habitability.ts`
```ts
interface HabitabilityInputs {
  surfaceTemp_K: number; waterPhase: WaterPhase; surfacePressure_bar: number;
  insolation_Searth: number; starTeff_K: number;
  tidalLocking: TidalLocking; stellarTideRelEarth: number | null;
  atmosphereAssumed: boolean;   // true whenever pressure/greenhouse come from sliders, not measurements
  missing: string[];            // missing catalog fields
}
DEFAULT_THRESHOLDS  // loaded from thresholds.json
classifyHabitability(inputs: HabitabilityInputs, thresholds?: typeof DEFAULT_THRESHOLDS): HabitabilityResult
```

### Agent 6 — `src/data/catalog.ts`
```ts
parseArchiveRows(rows: Record<string, string | number | null>[], generatedAt: string): Catalog  // pure; used by script and tests
loadCatalog(): Promise<Catalog>   // fetch('./data/exoplanets.json'); in DEV falls back to src/data/fixture.json (isFixture: true)
```

### Agent 8 — `src/pipeline/simulate.ts`
```ts
simulate(input: SimulationInput): SimulationOutput
hypotheticalPlanet(a_AU: number): Planet            // Earth mass & radius, e = 0, moon none
defaultAtmosphere(): Atmosphere                     // 1 bar, EARTH_GREENHOUSE, A = 0.30
```

## Units at the edge

| Quantity | Contract / UI | Physics |
|---|---|---|
| distance | AU | m |
| stellar radius / mass / luminosity | R☉ / M☉ / L☉ | m / kg / W |
| planet radius / mass | R⊕ / M⊕ | m / kg |
| pressure | bar | bar (only used categorically in P1) |
| period | days | s |
| temperature | K (UI also shows °C) | K |
