# DESIGN — Exoplanet Habitability Simulator, Prototype 1

> Original design document, preserved verbatim below the adaptation notes. Where the two disagree, **the adaptation notes win** (they record decisions made after this document was written).

## Adaptation notes (Sept 2026)

| Original | Adopted | Why |
|---|---|---|
| Python + Streamlit | TypeScript + Vite, static site | GitHub Pages is static hosting (no server for Streamlit), and the same build must wrap into an iOS/Android app with Capacitor. |
| Astropy constants | `src/physics/constants.ts`, transcribed from the same CODATA 2018 / IAU 2015 sets Astropy uses | Browser runtime; values agree with Astropy to full precision. |
| NumPy / SciPy / pandas | Plain TypeScript | Formulas are closed-form; Kepler solve is a few Newton iterations. |
| Plotly | Hand-built SVG | Plotly is ~3.5 MB — too heavy for phones. SVG is tiny, touch-friendly and works offline. |
| `thresholds.yaml` | `src/physics/thresholds.json` | No YAML parser needed in the browser. |
| `physics/*.py`, `tests/test_*.py` | `src/physics/*.ts`, `tests/unit/*.test.ts` (module authors), `validation/*.test.ts` (Agent 9) | Same module split. |
| Live TAP query from the app | Archive snapshot fetched at build time by GitHub Actions into `public/data/exoplanets.json` | Keeps the app offline-capable and fast, avoids CORS, and the snapshot is versioned. |
| Real-planet slider behavior (left to owner) | Measured star + planet values stay fixed; slider edits override distance/pressure/greenhouse and the result is labeled "modified from real data" | Owner decision. |

---

Exoplanet Habitability Simulator — Prototype 1
Project goal
Build a transparent, simplified planetary habitability simulator using public astronomical data. The prototype is not intended to determine whether life exists. It models physical conditions and returns a model-defined habitability classification.


1. Prototype user interface
User-controlled sliders
Orbital Distance

Semi-major axis, a
Unit: AU

Surface Pressure

P_s
Unit: bar

Greenhouse Gases

Prototype representation: normalized greenhouse strength
Later: replace with individual gases such as CO2, CH4, H2O
User-selected dropdown
Star Type
M
K
G
F
A
B
O
White dwarf

The star selection should determine or retrieve:

Effective temperature, T_star
Stellar radius, R_star
Stellar mass, M_star
Stellar luminosity, L_star
Model outputs
Stellar flux
Orbital period
Surface gravity
Equilibrium temperature
Estimated surface temperature
Water phase
Tidal environment
Tidal-locking indicator
Habitability status
Tentative habitability classifications
Uninhabitable
Marginally Habitable
Highly Habitable

These classifications are outputs of the simplified model, not claims about the existence of life.


2. Primary dataset
NASA Exoplanet Archive
Use the NASA Exoplanet Archive Planetary Systems data.

Potential fields:
Planet
pl_name
pl_orbper
pl_orbsmax
pl_orbeccen
pl_rade
pl_radj
pl_masse
pl_massj
Host star
st_spectype
st_teff
st_rad
st_mass
st_logg
st_age
st_met

Primary API/documentation: https://exoplanetarchive.ipac.caltech.edu/docs/program_interfaces.html

Important:

Use consistent parameter sets when possible.
Record source/reference information.
Do not assume missing atmospheric measurements are known.
Preserve measurement uncertainties where available.


3. Future datasets
These are NOT required for Prototype 1.
NASA Exoplanet Archive atmospheric spectroscopy
Potential future use:

Transmission spectra
Emission spectra
Direct-imaging spectra
Atmospheric constraints

Documentation: https://exoplanetarchive.ipac.caltech.edu/docs/atmospheres/atmospheres_columns.html
Stellar spectral data
Future versions could replace the blackbody approximation with actual/model stellar spectra.
NASA Open Science Data Repository / astrobiology data
Potential future use:

Biological limits
Extremophile data
Environmental tolerances
Laboratory/space biology data

Important: Do not force astrobiology datasets into the physics model unless their variables are scientifically relevant.


4. Software stack
Recommended
Python — main language
NumPy — numerical calculations
SciPy — scientific calculations/integration/optimization
Astropy — astronomical units, constants, and physical quantities
pandas — data handling
Plotly — interactive visualization
Streamlit — prototype UI
Git + GitHub — version control and collaboration
Later possibilities
Three.js for advanced browser-based 3D visualization
HELIOS for more sophisticated atmospheric/radiative-transfer modeling
Exo-Transmit for atmospheric transmission calculations

Do not use advanced atmospheric codes in Prototype 1 unless needed for validation.


5. Physical constants
Prefer Astropy's built-in constants and units rather than manually entering values.

Needed constants include:

G — gravitational constant
sigma_sb — Stefan-Boltzmann constant
Solar radius
Solar mass
Earth radius
Earth mass
Astronomical Unit
Solar luminosity


6. Stellar physics
Stellar luminosity
If stellar radius and effective temperature are known:

L_star = 4 * pi * R_star^2 * sigma * T_star^4

Where:

L_star = luminosity
R_star = stellar radius
T_star = effective temperature
sigma = Stefan-Boltzmann constant

Relative to the Sun:

L_star / L_sun = (R_star / R_sun)^2 * (T_star / T_sun)^4


7. Stellar flux at the planet
F_star = L_star / (4 * pi * a^2)

Relative to Earth:

S = (L_star / L_sun) / (a_AU^2)

Where:

S = 1 approximately corresponds to Earth's present solar flux.
S > 1 means more stellar energy than Earth receives.
S < 1 means less stellar energy.


8. Orbital model
Prototype 1 should support general elliptical orbits, with circular orbits as the special case e = 0.
Semi-major axis
The user's Orbital Distance slider represents the semi-major axis:

a = semi-major axis

Unit: AU

For real exoplanets, retrieve orbital eccentricity when available using the NASA Exoplanet Archive field pl_orbeccen.

For hypothetical planets:

Default to e = 0 (circular orbit) unless an eccentricity control is added later.
e = 0 → circular orbit
0 < e < 1 → elliptical orbit
Instantaneous orbital distance
For an elliptical orbit:

r(theta) = a * (1 - e^2) / (1 + e * cos(theta))

Where:

r(theta) = instantaneous star-planet distance
a = semi-major axis
e = orbital eccentricity
theta = orbital position angle
Periapsis and apoapsis
r_peri = a * (1 - e)

r_apo = a * (1 + e)
Orbital period
P = 2 * pi * sqrt(a^3 / (G * M_star))
Elliptical orbit distance
r(theta) = a * (1 - e^2) / (1 + e * cos(theta))
Periapsis
r_peri = a * (1 - e)
Apoapsis
r_apo = a * (1 + e)
Instantaneous stellar flux
F_star(theta) = L_star / (4 * pi * r(theta)^2)
Instantaneous equilibrium temperature
T_eq(theta) = [L_star * (1 - A) / (16 * pi * sigma * r(theta)^2)]^(1/4)

For convenient astronomical units:

P_years ≈ sqrt(a_AU^3 / (M_star / M_sun))

The orbital period depends on the semi-major axis and stellar mass, not directly on eccentricity.
Instantaneous stellar flux
Because an elliptical orbit changes the planet-star distance:

F_star(theta) = L_star / (4 * pi * r(theta)^2)
Instantaneous equilibrium temperature
T_eq(theta) = [L_star * (1 - A) / (16 * pi * sigma * r(theta)^2)]^(1/4)
Prototype visualization
The orbital visualization should:

Draw a circle when e = 0.
Draw an ellipse when e > 0.
Place the star at one focus of the ellipse.
Animate the planet around the orbit.
Update instantaneous distance, stellar flux, and equilibrium temperature during the orbit.
Display periapsis and apoapsis distances.

Important limitation:

The prototype may calculate instantaneous equilibrium temperature from instantaneous flux, but real planetary climate does not necessarily respond instantly to changing stellar flux. Atmospheric and oceanic thermal inertia, circulation, and seasonal effects should be added in later versions.


9. Planetary surface gravity
g = G * M_p / R_p^2

Relative to Earth:

g / g_Earth = (M_p / M_Earth) / (R_p / R_Earth)^2

For Prototype 1:

Retrieve planet mass/radius from the dataset.
Do not make them user sliders yet.


10. Equilibrium temperature
Initial model:

T_eq = [L_star * (1 - A) / (16 * pi * sigma * a^2)]^(1/4)

Equivalent form:

T_eq = [F_star * (1 - A) / (4 * sigma)]^(1/4)

Where:

A = Bond albedo
F_star = stellar flux

Prototype default:

Use an Earth-like albedo of approximately A = 0.30.

Important:

Albedo is not universally 0.30.
Treat this as a prototype assumption.
Future versions should model albedo more realistically.


11. Simplified greenhouse model
Do NOT use an LLM to calculate climate physics.

Use deterministic equations/code.

For a simple one-layer atmospheric model:

T_surface = [(1 - A) * S / (4 * sigma * (1 - epsilon/2))]^(1/4)

Where:

epsilon = simplified atmospheric infrared emissivity
Higher epsilon represents stronger greenhouse behavior.

The UI's greenhouse slider can map to epsilon.

Example conceptual mapping:

greenhouse_strength -> epsilon

Important:

This is a simplified educational model.
It is not a full radiative-transfer or climate model.
Label it clearly in code as a simplified greenhouse model.


12. Surface pressure
Pressure:

P = F / A

However, this equation alone does NOT determine climate.

For Prototype 1:

Store surface pressure.
Display it.
Use it as an input to the water-phase calculation.
Do not invent a direct pressure-to-temperature equation.

Future pressure effects could include:

Greenhouse absorption
Collision-induced absorption
Atmospheric circulation
Boiling point
Atmospheric escape
Heat transport


13. Water phase
Water phase is an OUTPUT.

Prototype approximation:

Ice: T < 273.15 K
Liquid: approximately 273.15–373.15 K at roughly Earth-like pressure
Vapor: T > 373.15 K

Important: These are NOT universal boundaries.

Eventually implement:

Water phase = f(T_surface, P_surface)

using an actual water phase diagram / vapor-pressure relation.

For Prototype 1, clearly label the simple thresholds as approximate.


14. Water-vapor feedback
Future feature, NOT Prototype 1.

Potential feedback:

surface temperature ↓ water phase ↓ atmospheric H2O ↓ greenhouse effect ↓ surface temperature

This creates a climate feedback loop.


15. Tidal effects
Tides should primarily be OUTPUTS.

Approximate tidal acceleration from a perturbing body:

a_tide ≈ 2 * G * M * R_p / r^3

For stellar tides:

a_tide_star ≈ 2 * G * M_star * R_p / a^3

For lunar tides:

a_tide_moon ≈ 2 * G * M_moon * R_p / d^3

Key relationship:

tidal effect ∝ M / r^3

This means distance is extremely important.


16. Moons
For real exoplanets:

Usually mark moon status as Unknown.
Do not invent an exomoon.

For hypothetical systems in future versions:

No moon
Earth-like moon
Custom moon

Potential parameters:

Moon mass
Planet-moon distance

Then calculate lunar tidal influence.


17. Tidal locking
Prototype approach:

Do NOT attempt to calculate an exact tidal-locking time initially.
Use a qualitative tidal-locking indicator.

A tidally locked planet has:

P_rotation ≈ P_orbital

Future versions can implement a full tidal-evolution model.


18. Habitability model
Do not make habitability a single temperature check.

Calculate independent conditions.
Temperature
Check whether:

T_min < T_surface < T_max
Liquid water
Check:

water_phase == "Liquid"
Pressure
Check whether:

P_min < P_surface < P_max
Stellar irradiation
Check:

S_min < S < S_max
Tidal environment
Evaluate separately.

Then combine the model outputs.


19. Prototype habitability classifications
Uninhabitable
The modeled environment is strongly inconsistent with the predefined potentially habitable ranges.
Marginally Habitable
Some potentially favorable conditions exist, but one or more important modeled conditions are outside the preferred range.
Highly Habitable
The modeled environment falls within the predefined ranges for the variables considered by the prototype.

Important: These labels mean: "Highly habitable according to this simplified model."

They do NOT mean: "This planet contains life."


20. Future uncertainty output
Eventually add:
Insufficient Data
Example:

Habitability: Marginally Habitable

Confidence: Low

Reason: Atmospheric composition unknown

The model should eventually propagate observational uncertainties.


21. Prototype calculation pipeline
NASA exoplanet data ↓ Planet parameters ↓ Host-star parameters ↓ Stellar model ↓ Luminosity ↓ Orbital distance ↓ Stellar flux ↓ Equilibrium temperature ↓ Atmospheric pressure + greenhouse parameter ↓ Surface temperature ↓ Water phase ↓ Tidal model ↓ Habitability model ↓ Habitability classification


22. Prototype equation checklist
Star
L_star = 4 * pi * R_star^2 * sigma * T_star^4
Stellar flux
F_star = L_star / (4 * pi * a^2)
Orbital period
P = 2 * pi * sqrt(a^3 / (G * M_star))
Elliptical orbit distance
r(theta) = a * (1 - e^2) / (1 + e * cos(theta))
Periapsis
r_peri = a * (1 - e)
Apoapsis
r_apo = a * (1 + e)
Instantaneous stellar flux
F_star(theta) = L_star / (4 * pi * r(theta)^2)
Instantaneous equilibrium temperature
T_eq(theta) = [L_star * (1 - A) / (16 * pi * sigma * r(theta)^2)]^(1/4)
Surface gravity
g = G * M_p / R_p^2
Equilibrium temperature
T_eq = [L_star * (1 - A) / (16 * pi * sigma * a^2)]^(1/4)
Simplified atmospheric temperature
T_surface = [(1 - A) * S / (4 * sigma * (1 - epsilon/2))]^(1/4)
Water phase
Phase = f(T_surface, P_surface)
Stellar tides
a_tide_star ≈ 2 * G * M_star * R_p / a^3
Lunar tides
a_tide_moon ≈ 2 * G * M_moon * R_p / d^3
Tidal locking
P_rotation -> P_orbital
Habitability
H = f( T_surface, P_surface, water_phase, S, tidal_environment, ... )


23. Recommended project structure
Exoplanet-Habitability-Simulator/

data/

    raw/

    processed/

physics/

    constants.py

    stellar.py

    orbit.py

    planet.py

    atmosphere.py

    water.py

    tides.py

    habitability.py

visualization/

    plots.py

    planet_view.py

tests/

    test_stellar.py

    test_orbit.py

    test_temperature.py

    test_water.py

    test_tides.py

    test_habitability.py

app.py

requirements.txt

README.md


24. Model assumptions to display in the app
Add a "Model assumptions" section:

Planet treated as spherical.
Star treated as a blackbody.
Uniform planetary energy redistribution.
Fixed/default albedo.
Simplified greenhouse parameterization.
Simplified water-phase model.
Tidal effects approximated using point-mass gravitational relationships.
Biological habitability is NOT being predicted.
Atmospheric composition may be unknown.
Results are model outputs, not evidence that life exists.


25. Validation plan
The prototype should intentionally be treated as a first model.

Winter-break workflow:

Build a simple working prototype.
Study astronomy and biology material.
Identify assumptions in every equation.
Compare equations against authoritative sources/textbooks.
Test limiting cases.
Compare outputs with known Solar System examples.
Identify errors and unrealistic behavior.
Replace simplified assumptions with better models.
Add uncertainty handling.
Document every major model change.

A particularly useful test is Earth:

Sun-like star
1 AU
~1 bar
Earth-like albedo
Earth-like greenhouse assumptions

The simulator should produce broadly Earth-like values where the simplified model is expected to work.


26. Future model upgrades
Potential later modules:

Atmospheric escape
Photochemistry
Clouds
Ocean circulation
Surface/continental effects
Plate tectonics
Magnetic fields
Stellar evolution
Real stellar spectra
Detailed greenhouse gas absorption
1D radiative-convective climate models
Atmospheric transmission spectra
Biological tolerance limits
Biosignature modeling
Monte Carlo uncertainty propagation

Do not implement these until Prototype 1 is validated.


27. Scientific design principle
The LLM should NOT be the physics engine.

Recommended architecture:

User ↓ LLM / natural-language interface ↓ Structured parameters ↓ Deterministic Python physics engine ↓ Calculated results ↓ Visualization ↓ LLM explanation (optional)

The physics engine should be reproducible and deterministic.


28. Prototype goal
The first successful version does NOT need to predict life.

Success means:

Given a real or hypothetical planet, star type, orbital distance, surface pressure, and greenhouse strength, the program calculates a physically interpretable approximation of the planet's thermal environment, water phase, tidal environment, and model-defined habitability classification.

After this works, the project can become progressively more scientifically sophisticated.







































Agent breakdown
Parallel agents only work if they agree on interfaces first. So the plan is: one agent freezes the contracts, then the physics agents work independently against those contracts, then integration and validation close it out. (Each "agent" can be a separate Claude session or a Claude Code subagent with its own scoped instructions and file ownership.)
Phase 0: Foundation (do first, sequentially)
Agent 0: Architect / Integrator
Owns: repo scaffold, requirements.txt, DESIGN.md (your document), CI running pytest, physics/types.py
Job: define the shared data structures and unit conventions before anyone else starts. Later it merges everyone's work and resolves conflicts.
Key deliverable: the contract everyone codes against. For example:
@dataclass(frozen=True)
class Star:
    teff_K: float; radius_Rsun: float; mass_Msun: float
    luminosity_Lsun: float | None = None
    source: str = "preset"

@dataclass(frozen=True)
class Planet:
    mass_Mearth: float | None; radius_Rearth: float | None
    a_AU: float; ecc: float = 0.0
    source: str = "hypothetical"

@dataclass(frozen=True)
class Atmosphere:
    pressure_bar: float; greenhouse: float  # 0-1 normalized
    albedo: float = 0.30

@dataclass
class Result:  # every module returns values + notes, never bare floats only
    value: float; unit: str; assumptions: list[str]

Rules to set here: one unit convention across modules (for example SI internally, AU/Earth units at the UI edge), Astropy constants only, every function is pure and deterministic, and every output carries an assumptions note.
Phase 1: Physics agents (parallel)
Agent
Owns
Depends on
Job
1. Star
constants.py, stellar.py, star-type presets
types
L from R and T, flux at distance. Preset table for M, K, G, F, A, B, O, white dwarf (typical T, R, M, L with sources).
2. Orbit
orbit.py
types, Star
Period, r(θ), periapsis/apoapsis, instantaneous flux and T_eq along the orbit. Handles e=0 through e→1 edge cases.
3. Climate
planet.py, atmosphere.py
types, Star, Orbit
Surface gravity, T_eq, the one-layer greenhouse model, and the greenhouse-slider-to-epsilon mapping, calibrated so Earth gives ~288 K.
4. Water & Tides
water.py, tides.py
types, Climate outputs
Water phase from (T, P) (simple thresholds now, structured so a vapor-pressure curve can replace them), stellar and lunar tidal acceleration, qualitative tidal-locking indicator.
5. Habitability
habitability.py, thresholds.yaml
types, agents 1-4 outputs
Independent checks for temperature, liquid water, pressure, flux, and tides, combined into Uninhabitable / Marginal / Highly Habitable, with a list of which conditions passed or failed and why. Thresholds live in a config file.

Agents 1-4 can start at the same time using stub inputs from the contract. Agent 5 can begin with mocked inputs and hook in real ones later.
Phase 1: Data and UI agents (parallel with physics)
Agent 6: Data
Owns: data/, data_loader.py
Job: NASA Exoplanet Archive TAP queries, local CSV caching, selection of a consistent parameter set per planet, missing-value handling (never assume unknowns), uncertainty and reference preservation, and conversion into the Star/Planet contract.
Caveat: it can't be tested against the live service from a sandbox, so ship it with a small saved sample CSV for tests, and expect you to run it once and report real responses.
Agent 7: UI / Visualization
Owns: app.py, visualization/plots.py, visualization/planet_view.py
Job: Streamlit layout (three sliders, star dropdown, real-planet picker), output panels, Plotly orbit with the star at the focus and animated frames, the "Model assumptions" section, and result display with the failed/passed condition list.
Works against: a mock simulate() function returning fake Result objects until real modules land.
Phase 2: Integration and quality
Agent 8: Pipeline / Integration
Owns: simulate.py (single entry point: inputs go in, complete result comes out)
Job: wire modules in the order of your pipeline, replacing the UI's mock. Also resolves the design question of which parameters stay fixed when a user moves a real planet. That decision belongs to you, and this agent implements it.
Agent 9: Validation / QA (deliberately independent)
Owns: tests/, validation/
Job: it should NOT be the same agent that wrote the physics, so it doesn't share the author's mistakes. It writes:
Known-value tests: Earth T_eq ≈ 255 K at A=0.30, 1-year period at 1 AU around the Sun, Earth g, and so on
Limiting cases: e→0, a→large, zero greenhouse, and extreme stars
Solar System comparisons (Venus, Mars, Earth) with honest notes on where the simple model fails
A validation report listing every mismatch
Agent 10: Science Reviewer / Docs
Owns: README.md, CHANGELOG.md, docstring audit, ASSUMPTIONS.md
Job: audits each equation's stated assumptions, flags every threshold that needs a literature source, and keeps the changelog. Anything it can't source gets marked "needs human verification." This is where your winter-break study plan plugs in.
Dependency flow
Agent 0 (contracts)
   ├── Agents 1,2,3,4 (physics) ──► Agent 5 (habitability) ──┐
   ├── Agent 6 (data) ───────────────────────────────────────┤
   └── Agent 7 (UI, mocked) ─────────────────────────────────┤
                                                             ▼
                                            Agent 8 (integration) ► Agent 9 (validation) ► Agent 10 (docs)

Ground rules for every agent
Each agent edits only its own files. Contract changes go through Agent 0.
No agent merges without its tests passing. You run the tests, not the agent.
Every function documents its equation, units, and assumptions.
No LLM in the physics path.
Commit per module, with a CHANGELOG entry for any model change.
Recommended start order
Agent 0 first, then agents 1 and 2 (the foundation everything uses), with agent 9 writing tests for them in parallel. Then 3, 4, 5, followed by 6 and 7 alongside. Integration and docs last.
If you want, I can write the Agent 0 deliverables now (the scaffold, types.py, and the unit conventions), plus a reusable instruction prompt for each agent that scopes its files, inputs, outputs, and test requirements.
