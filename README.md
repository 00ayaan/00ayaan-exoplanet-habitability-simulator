# Exoplanet Habitability Simulator

A transparent, simplified planetary habitability simulator built on public astronomical data.

Choose a star and a planet, which can be a real exoplanet from the NASA Exoplanet Archive or a hypothetical one. Then move three sliders: orbital distance, surface pressure and greenhouse strength. The app shows the physical conditions that follow step by step: starlight received, orbital period, surface gravity, temperatures, water phase and tides. It ends with a **model-defined** classification: *Uninhabitable*, *Marginally Habitable* or *Highly Habitable*.

> **This is not a life detector.** "Highly Habitable" means *highly habitable according to this simplified model*. It does not mean the planet has life, or even that it could support life. The model is deliberately simple so that every assumption can be seen and checked. See [ASSUMPTIONS.md](ASSUMPTIONS.md).

**Live site:** https://00ayaan.github.io/00ayaan-exoplanet-habitability-simulator/ (available once GitHub Pages is enabled; see below)

<!-- Screenshot placeholder: add docs/screenshot.png (phone width, ~390 px) and reference it here:
![Simulator on a phone](docs/screenshot.png) -->
*Screenshot: to be added (`docs/screenshot.png`).*

## Features

- **Two modes.** *Hypothetical* uses a preset star type (M, K, G, F, A, B, O or white dwarf) and an Earth-mass planet. *Real planet* uses a small rocky planet from the NASA Exoplanet Archive with its measured values held fixed.
- **Three sliders:** orbital distance (AU), surface pressure (bar) and greenhouse strength (0–1).
- **Animated orbit view** (SVG). The star sits at one focus of the ellipse, and the planet speeds up at periapsis (Kepler's second law). The view shows the instantaneous distance, flux and equilibrium temperature.
- **Outputs:** stellar luminosity and flux, insolation (S⊕), orbital period, periapsis and apoapsis, surface gravity, equilibrium and surface temperature, water phase, stellar and lunar tides, a qualitative tidal-locking indicator, and a habitability classification with a confidence level.
- **Reasons you can read.** Each of the five habitability checks (temperature, liquid water, pressure, starlight, tides) shows pass, fail or unknown with an explanation. Every number keeps a list of the assumptions behind it.
- **Missing data is never guessed.** An unknown mass or radius gives an "unknown" result and lowers the confidence level.
- **Works on phones and offline.** The layout is mobile-first and installs as a PWA. The same build is ready to wrap as an iOS/Android app ([docs/mobile.md](docs/mobile.md)).

## Quick start

Requires **Node.js ≥ 22.18**. The data-fetch script needs it because it relies on Node's native TypeScript type stripping.

```bash
npm ci              # install exact dependency versions
npm run dev         # dev server at http://localhost:5173
npm test            # unit tests (tests/unit) + independent validation (validation/)
npm run typecheck   # TypeScript strict check
npm run build       # production build into dist/
npm run preview     # serve dist/ locally
npm run data:fetch  # download a fresh NASA Exoplanet Archive snapshot
```

`npm run data:fetch` needs internet access to `exoplanetarchive.ipac.caltech.edu`. You normally don't need to run it yourself, because it runs automatically in GitHub Actions before every deploy. With no snapshot, `npm run dev` uses a small hand-entered fixture (`src/data/fixture.json`, marked as a fixture in the UI). A production build with no snapshot offers hypothetical mode only.

## Project structure

The layout follows the module split in [DESIGN.md](DESIGN.md) §23. Files were adapted from Python to TypeScript; the table at the top of DESIGN.md says why.

| Design doc module | This repo | What it does |
|---|---|---|
| `physics/constants.py` | `src/physics/constants.ts`, `units.ts` | CODATA 2018 / IAU 2015 constants (the same values Astropy uses) and the only unit conversions |
| *(contract)* | `src/physics/types.ts` | Shared data types (`Star`, `Planet`, `Atmosphere`, `Result`, …) that every module codes against |
| `physics/stellar.py` | `src/physics/stellar.ts`, `starPresets.ts` | Luminosity, flux, insolation; one preset star per spectral class |
| `physics/orbit.py` | `src/physics/orbit.ts` | Kepler's third law, elliptical orbits, Kepler-equation solver, time-uniform orbit sampling |
| `physics/planet.py` | `src/physics/planet.ts` | Surface gravity, equilibrium temperature |
| `physics/atmosphere.py` | `src/physics/atmosphere.ts` | Simplified one-layer greenhouse model |
| `physics/water.py` | `src/physics/water.ts` | Approximate water phase from temperature and pressure |
| `physics/tides.py` | `src/physics/tides.ts` | Tidal accelerations and the qualitative tidal-locking indicator |
| `physics/habitability.py` + `thresholds.yaml` | `src/physics/habitability.ts` + `thresholds.json` | Five checks combined into a classification; every threshold has a source and a status |
| `data/`, `data_loader.py` | `src/data/`, `scripts/fetch-exoplanets.mjs`, `public/data/` | Archive query, parser, build-time snapshot |
| `app.py` | `src/pipeline/simulate.ts` | `simulate()`: a single pure function that takes inputs and returns a complete result |
| `visualization/*.py`, `app.py` UI | `src/ui/`, `index.html`, `src/main.ts`, `public/` | Mobile-first DOM + SVG UI, PWA manifest, service worker ([src/ui/README.md](src/ui/README.md)) |
| `tests/test_*.py` | `tests/unit/*.test.ts` (module authors), `validation/` (independent) | Vitest |

## Calculation pipeline

`src/pipeline/simulate.ts` runs the steps below in the order of DESIGN.md §21. Every step is plain deterministic code. There is no AI in the physics path.

```
NASA archive row or star preset
  → luminosity           L = 4πR²σT⁴ (or the catalog value)
  → orbit                P = 2π√(a³/G(M★+Mp)),  r(θ) = a(1−e²)/(1+e cosθ)
  → stellar flux         F = L/(4πa²),  S = F/S⊕
  → surface gravity      g = GM/R²
  → equilibrium temp     T_eq = [F(1−A)/(4σ)]^¼
  → greenhouse           ε = slider value
  → surface temp         T_s = T_eq · (2/(2−ε))^¼        (one-layer model)
  → water phase          ice / liquid / vapor / no-liquid (below the triple point)
  → tides                a_tide ≈ 2GMR/r³, tidal-locking indicator
  → habitability         5 checks → status + confidence + reasons
```

[ASSUMPTIONS.md](ASSUMPTIONS.md) gives the assumptions, the range where each equation is valid, and a source for every step.

## How it was built

The code was written by 11 scoped agents working in parallel against a frozen contract (`src/physics/types.ts`). Each agent owned specific files, and nothing was merged unless the tests passed. [AGENTS.md](AGENTS.md) holds the ownership table, the frozen function signatures and the ground rules. [docs/agents-workflow.md](docs/agents-workflow.md) explains the dependency flow and how to run the next iteration.

## Deploying to GitHub Pages

The workflow `.github/workflows/deploy.yml` builds and publishes the site. It runs on every push to `main`, weekly (Mondays 09:17 UTC) to refresh the archive data, and on demand.

One-time setup:

1. On GitHub, open the repository's **Settings → Pages**. Under **Build and deployment → Source**, choose **GitHub Actions**.
2. Go to **Actions → "Deploy to GitHub Pages" → Run workflow** (branch `main`).
3. When the run finishes, the site appears at the live-site address above.

`vite.config.ts` uses `base: './'`, so the same build works from the `/00ayaan-exoplanet-habitability-simulator/` subpath and inside a native app. Do not change it.

The data step is marked `continue-on-error`. If the archive is down, the deploy still goes out. The snapshot (`public/data/exoplanets.json`) is generated in CI and is not committed, so a deploy made while the archive is down has **no** real-planet catalog and shows hypothetical mode only, until the next successful run.

## Data provenance

- **Source:** [NASA Exoplanet Archive](https://exoplanetarchive.ipac.caltech.edu/), **Planetary Systems (`ps`) table** ([DOI 10.26133/NEA12](https://doi.org/10.26133/NEA12)), queried through the TAP service with `default_flag = 1`. That flag selects one self-consistent parameter set per planet.
- **Filter** (`ARCHIVE_FILTER` in `src/data/parse.js`): the star's T_eff, radius and mass are all known; the orbit can be located (semi-major axis, or period plus stellar mass); and the planet is small (radius < 4 R⊕, or, for radial-velocity-only planets with no measured radius, mass < 10 M⊕). For planets without a measured radius, the radius stays **unknown**. It is never estimated.
- **Refresh:** weekly, at build time, by GitHub Actions. The app reads the bundled snapshot and never calls the archive directly. This keeps it fast, offline-capable and free of CORS problems.
- **Kept with each value:** the archive reference names (`pl_refname`, `st_refname`), the asymmetric uncertainties, and a list of every field that was missing or derived (for example, *a* computed from the period via Kepler's third law).

**Acknowledgment.** The archive asks users of its data to credit it. In paraphrase: this project uses the NASA Exoplanet Archive, which Caltech operates under contract with NASA as part of the Exoplanet Exploration Program. For the exact wording and the current preferred citation (Christiansen et al. 2025, *Planetary Science Journal* 6, 186, [doi:10.3847/PSJ/ade3c2](https://doi.org/10.3847/PSJ/ade3c2)), see the archive's [acknowledgment page](https://exoplanetarchive.ipac.caltech.edu/docs/acknowledge.html).

Star-type presets come from Pecaut & Mamajek (2013) and E. Mamajek's online dwarf-star table. The Sun preset uses the IAU 2015 nominal solar values. Habitable-zone limits come from Kopparapu et al. (2014). Full citations are in [ASSUMPTIONS.md](ASSUMPTIONS.md).

## License

`package.json` declares **MIT**, but the repository has no `LICENSE` file yet. The owner should add one (GitHub: *Add file → Create new file → `LICENSE` → Choose a license template → MIT*). Until then the licensing terms are ambiguous. Archive data is subject to the archive's own acknowledgment request (above).

## More documentation

- [ASSUMPTIONS.md](ASSUMPTIONS.md): science audit of every equation, constant and threshold, plus a study guide
- [CHANGELOG.md](CHANGELOG.md): release history and model decisions
- [docs/mobile.md](docs/mobile.md): turning the web build into an iOS/Android app with Capacitor
- [docs/agents-workflow.md](docs/agents-workflow.md): how the agents divided the work
- [validation/VALIDATION_REPORT.md](validation/VALIDATION_REPORT.md): independent validation (known values, limiting cases, Solar System comparisons)
- [DESIGN.md](DESIGN.md): original design document and adaptation notes
- [AGENTS.md](AGENTS.md): file ownership, frozen signatures, ground rules
