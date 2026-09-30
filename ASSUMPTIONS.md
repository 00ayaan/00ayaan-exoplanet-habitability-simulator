# ASSUMPTIONS — science audit of Prototype 1

This file lists **every equation, constant and threshold** the simulator uses, with:

- **Where:** file and function
- **Assumes:** what must be true for the equation to hold
- **Valid for:** the range where it is reasonable
- **Fails when:** known failure modes
- **Source:** where it comes from
- **Status:**
  - **cited**: the reviewer checked the source (primary paper, official table, or official data page)
  - **cited (secondary)**: confirmed only through a secondary source such as a review, textbook summary or Wikipedia; the primary source should be read
  - **needs human verification**: a model choice or a value the reviewer could not trace to a source

Reviewed 2026-09-29 by Agent 10 against commit `3656953`. Anything marked **needs human verification** is on the winter-break reading list ([Study guide](#study-guide)).

> The whole model predicts *physical conditions* under stated simplifications. It does not predict life. Passing every check means "inside the ranges this model chose", nothing more.

---

## 0. Global assumptions

These appear on screen through `MODEL_ASSUMPTIONS` in `src/physics/types.ts`, which comes from DESIGN.md §24.

| # | Assumption | What it means in practice |
|---|---|---|
| G1 | Planet is a sphere | No oblateness, no topography |
| G2 | Star is a blackbody | Spectral shape is ignored, except that the Kopparapu habitable-zone limits include it implicitly |
| G3 | Uniform heat redistribution | Day and night sides have the same temperature (the factor 4 in T_eq) |
| G4 | Fixed albedo A = 0.30 | Albedo does not respond to ice, clouds or the atmosphere |
| G5 | One-layer greenhouse | No radiative transfer, no spectral bands, no lapse rate, no clouds |
| G6 | Threshold water-phase model | Boiling point fixed at 373.15 K except below the triple point |
| G7 | Point-mass tides | Leading-order term only |
| G8 | Biology is not predicted | Temperature limits are borrowed from Earth life as context only |
| G9 | Atmosphere unknown | Pressure, greenhouse strength and albedo always come from sliders, even for real planets |
| G10 | Snapshot, not a time series | No stellar evolution, no climate history, no thermal inertia |

---

## 1. Constants (`src/physics/constants.ts`)

| Constant | Value | Source | Status |
|---|---|---|---|
| G | 6.6743e-11 m³ kg⁻¹ s⁻² | CODATA 2018 (Tiesinga et al. 2021, *Rev. Mod. Phys.* 93, 025010), the default in Astropy | cited |
| σ (Stefan–Boltzmann) | 5.670374419e-8 W m⁻² K⁻⁴ | CODATA 2018 (exact in the 2019 SI) | cited |
| AU | 1.495978707e11 m | IAU 2012 Resolution B2 (exact) | cited |
| R☉, L☉, T☉ | 6.957e8 m, 3.828e26 W, 5772 K | IAU 2015 Resolution B3 nominal values (Prša et al. 2016, *AJ* 152, 41) | cited |
| M☉, M⊕, M_J | (GM)_nominal / G | IAU 2015 B3 nominal GM ÷ CODATA 2018 G, the same way Astropy does it | cited |
| R⊕, R_J | 6.3781e6 m, 7.1492e7 m (equatorial) | IAU 2015 B3 | cited |
| M_moon | 7.346e22 kg | [NASA GSFC Moon Fact Sheet](https://nssdc.gsfc.nasa.gov/planetary/factsheet/moonfact.html) (0.07346 × 10²⁴ kg) | cited |
| Earth–Moon distance | 3.844e8 m | NASA GSFC Moon Fact Sheet (semi-major axis 0.3844 × 10⁶ km) | cited |
| Water triple point | 273.16 K, 0.00611657 bar (611.657 Pa) | IAPWS (Wagner & Pruß 2002, *J. Phys. Chem. Ref. Data* 31, 387; IAPWS R14-08) | cited |
| S⊕ | L☉/(4π AU²) ≈ 1361.17 W m⁻² | Derived from constants. The measured solar irradiance is 1361.0 W m⁻² ([NASA Earth Fact Sheet](https://nssdc.gsfc.nasa.gov/planetary/factsheet/earthfact.html)); they differ by about 0.01 % | cited |
| Year | 365.25 d (Julian year) | IAU convention | cited |

Note: the equatorial R⊕ is used everywhere, including for surface gravity. Earth's volumetric mean radius (6371 km) is 0.17 % smaller, so the model's Earth g comes out ≈ 9.80 m s⁻² instead of about 9.82 m s⁻². This does not matter at the level of this model.

---

## 2. Equations

### E1. Stellar luminosity (Stefan–Boltzmann)

- **Equation:** L = 4π R★² σ T_eff⁴
- **Where:** `src/physics/stellar.ts` → `luminosityFromRadiusTeff`
- **Assumes:** a spherical blackbody at T_eff. This holds *by definition* of T_eff for bolometric output, so the equation is exact given R and T_eff; the only uncertainty comes from the measured R and T_eff.
- **Valid for:** any star with a well-defined photosphere (in practice ~2 000–50 000 K).
- **Fails when:** R or T_eff are poorly measured. L ∝ T⁴, so a 5 % error in T_eff becomes a ~22 % error in L. Spotted or variable stars, and strongly oblate fast rotators, also break it.
- **Source:** standard. See Carroll & Ostlie, *An Introduction to Modern Astrophysics*, ch. 3.
- **Status:** cited (textbook identity)

### E2. Which luminosity to use

- **Rule:** use the catalog or preset L if present, otherwise compute E1.
- **Where:** `stellar.ts` → `resolveLuminosity`
- **Assumes:** the catalog L (`st_lum`, given in log₁₀ L☉) is consistent with the catalog R and T_eff. There is no cross-check.
- **Fails when:** the archive's L, R and T_eff come from different analyses. `default_flag = 1` should keep them consistent, but the model does not check.
- **Source:** model design (DESIGN §6)
- **Status:** cited (design rule)

### E3. Stellar flux (inverse-square law)

- **Equation:** F = L / (4π r²)
- **Where:** `stellar.ts` → `fluxAtDistance`; used at r = a in `simulate()` and at r(θ) in `sampleOrbit`
- **Assumes:** isotropic point source, no absorption between star and planet, r ≫ R★.
- **Fails when:** the planet is very close to the star (r of a few R★), where the star no longer looks like a point. The pipeline adds a note when periapsis ≤ R★.
- **Source:** standard (energy conservation)
- **Status:** cited (textbook identity)

### E4. Relative insolation

- **Equation:** S = F / S⊕ = (L/L☉) / (r/AU)²
- **Where:** `stellar.ts` → `relativeInsolation`
- **Assumes:** bolometric comparison only. A red dwarf's light is mostly infrared, which planets absorb differently; S ignores this. The Kopparapu habitable-zone limits (E20) put the spectral effect back in.
- **Status:** cited (textbook identity)

### E5. Orbital period (Kepler's third law)

- **Equation:** P = 2π √(a³ / (G (M★ + M_p)))
- **Where:** `src/physics/orbit.ts` → `orbitalPeriod`
- **Assumes:** two point masses, no other planets, Newtonian gravity.
- **Valid for:** any bound orbit. P does not depend on e.
- **Fails when:** planets strongly perturb each other (resonant chains), for close binaries, or for general-relativistic precession, which is negligible for period.
- **Note:** in real-planet mode the model computes its own P from a and the masses. The archive's measured period is shown separately in provenance. The two can disagree when a and M★ come from different analyses.
- **Source:** Murray & Dermott, *Solar System Dynamics* (1999), ch. 2; any intro mechanics text.
- **Status:** cited (textbook)

### E6. Orbit equation

- **Equation:** r(θ) = a (1 − e²) / (1 + e cos θ), star at one focus
- **Where:** `orbit.ts` → `distanceAtTrueAnomaly`
- **Assumes:** ideal Keplerian ellipse, 0 ≤ e < 1.
- **Status:** cited (textbook, Murray & Dermott ch. 2)

### E7. Periapsis and apoapsis

- **Equations:** r_peri = a(1 − e), r_apo = a(1 + e)
- **Where:** `orbit.ts` → `periapsis`, `apoapsis`
- **Status:** cited (textbook)

### E8. Kepler's equation and position along the orbit

- **Equations:** M = E − e sin E (solved for E); θ = 2 atan2(√(1+e) sin(E/2), √(1−e) cos(E/2)); r = a(1 − e cos E); x = a(cos E − e), y = a√(1−e²) sin E
- **Where:** `orbit.ts` → `solveKepler` (Newton–Raphson with a bisection fallback, tolerance 1e-12 rad), `sampleOrbit`
- **Assumes:** Keplerian two-body motion.
- **Valid for:** 0 ≤ e < 1. The solver is robust to e ≈ 0.99.
- **Source:** Murray & Dermott ch. 2. The starting guess E₀ = π for high e follows common practice. Unit tests check convergence.
- **Status:** cited (textbook)

### E9. Instantaneous flux and T_eq along the orbit

- **Equations:** F(θ) = L / (4π r(θ)²); T_eq(θ) = [F(θ)(1 − A)/(4σ)]^¼, sampled uniformly in time
- **Where:** `orbit.ts` → `sampleOrbit` (calls E3 and E11)
- **Assumes:** the planet's temperature responds *instantly* to changing flux (no thermal inertia).
- **Fails when:** almost always, for real planets. Oceans and atmospheres smooth out the swing, so the displayed T_eq range is an **upper bound** on the real swing (DESIGN §8).
- **Important:** the habitability checks use flux **at the semi-major axis a**. They do not use the orbit average or the extremes. The orbit-averaged flux is higher: ⟨F⟩ = L / (4π a² √(1 − e²)) (Williams & Pollard 2002, *Int. J. Astrobiology* 1, 61). At e = 0.6 that is 25 % more than at a, and the instantaneous T_eq swings from about 201 K to 403 K at 1 AU. The planet can still be labelled "Highly Habitable". See the [concerns](#known-scientific-concerns) below.
- **Status:** equations cited (textbook); the choice to classify at *a* is a model choice and **needs human verification**

### E10. Surface gravity

- **Equation:** g = G M_p / R_p²
- **Where:** `src/physics/planet.ts` → `surfaceGravity`
- **Assumes:** spherical, non-rotating planet; all mass inside R (shell theorem).
- **Fails when:** mass or radius is unknown, in which case the result is `null` and nothing is estimated. It is also wrong when the mass is only a minimum mass. For radial-velocity planets `pl_bmasse` can be M sin i, so g is then a **lower limit**; the provenance notes flag this.
- **Source:** Newton's law of gravitation, shell theorem
- **Status:** cited (textbook)

### E11. Equilibrium temperature

- **Equation:** T_eq = [F (1 − A) / (4σ)]^¼
- **Where:** `planet.ts` → `equilibriumTemperature`
- **Assumes:** absorbed energy is spread evenly over the whole sphere (factor 4 = sphere area ÷ disk area); fixed Bond albedo A; no internal heat; the planet emits as a blackbody (emissivity 1).
- **Valid for:** fast rotators, or planets with thick atmospheres that move heat around well. For a tidally locked bare rock the factor 4 should be closer to 2 (day side only), which raises the day-side T by 2^¼ ≈ 1.19×.
- **Fails when:** internal heat matters (young or tidally heated planets); albedo is far from 0.30 (Venus ≈ 0.77, fresh snow > 0.8).
- **Check:** Sun, 1 AU, A = 0.30 gives 254.6 K. The textbook value is ≈ 255 K.
- **Source:** Pierrehumbert, *Principles of Planetary Climate* (2010), §3.3 "Radiation balance of planets"; Seager, *Exoplanet Atmospheres* (2010).
- **Status:** cited (textbook)

### E12. Simplified one-layer greenhouse model

- **Equation:** T_s = [(1 − A) F / (4σ (1 − ε/2))]^¼ = T_eq · (2 / (2 − ε))^¼
- **Where:** `src/physics/atmosphere.ts` → `surfaceTemperature`
- **Assumes:** one isothermal atmospheric layer that is transparent to starlight and has infrared emissivity ε. The surface is a blackbody. No convection, clouds, lapse rate or spectral bands. **Surface pressure has no effect on temperature.**
- **Valid for:** teaching the *idea* of the greenhouse effect for thin to moderate atmospheres near Earth-like conditions.
- **Fails when:** the maximum possible warming is 2^¼ ≈ 1.19 × T_eq (ε = 1), so thick atmospheres cannot be modelled. **Venus cannot be reproduced:** the model gives at most ~270 K against ~737 K observed. Water-vapour feedback and runaway greenhouse are also missing (DESIGN §14).
- **Source:** the classic "one-layer" or "single-slab" model. See Pierrehumbert (2010) §3.5 "Partially absorbing atmospheres", and Catling & Kasting, *Atmospheric Evolution on Inhabited and Lifeless Worlds* (2017) §2.2 "Planetary energy balance and the greenhouse effect". The reviewer confirmed that both sections exist (from the books' tables of contents) but did not read the section text.
- **Status:** cited (secondary: section titles confirmed; derivation to be checked by the student)

### E13. Earth greenhouse calibration (`EARTH_GREENHOUSE` ≈ 0.7788)

- **Equation:** ε_⊕ = 2 [1 − (T_eq / 288 K)⁴], with T_eq = 254.6 K (Sun, 1 AU, A = 0.30). This gives 0.77877.
- **Where:** `atmosphere.ts` → `EARTH_GREENHOUSE`, computed at load time; used as the default by `simulate.ts` → `defaultAtmosphere`
- **Assumes:** Earth's global mean surface temperature is 288 K ([NASA Earth Fact Sheet](https://nssdc.gsfc.nasa.gov/planetary/factsheet/earthfact.html): "Average temperature 288 K (15 C)"), and A = 0.30.
- **Fails when:** it is used as "Earth-like" for another star. It is only the value that makes *this* model hit 288 K for *this* input; it is not a measured property of Earth's air. With Earth's measured Bond albedo of 0.294 the calibrated ε would come out slightly different.
- **Status:** cited (target temperature); calibration method is standard

### E14. Greenhouse slider → emissivity (ε = slider)

- **Mapping:** identity, ε = greenhouse ∈ [0, 1]
- **Where:** `atmosphere.ts` → `greenhouseToEpsilon`
- **Assumes:** nothing hidden. The slider *is* ε. It is not linked to CO₂ ppm or any gas amount.
- **Fails when:** a user reads "greenhouse strength 0.5" as "half of Earth's CO₂". It is not.
- **Source:** model choice (DESIGN §11 "the greenhouse slider can map to epsilon")
- **Status:** model choice (not a physical claim); the design decision is documented in CHANGELOG

### E15. Water phase

- **Rules:** P < 0.00611657 bar → no liquid possible. Otherwise T < 273.15 K → ice; 273.15–373.15 K → liquid; T > 373.15 K → vapour. There is an extra note when P is outside 0.5–2 bar.
- **Where:** `src/physics/water.ts` → `waterPhase` (the `thresholdModel` strategy)
- **Assumes:** pure water; the 1-atm melting and boiling points apply at every pressure above the triple point.
- **Valid for:** roughly 0.5–2 bar.
- **Fails when:**
  - **High pressure:** the boiling point rises (≈ 453 K at 10 bar), so 380–450 K at 10 bar is wrongly called "vapour".
  - **Low pressure:** the boiling point falls (≈ 319 K at 0.1 bar), so 320–373 K at 0.1 bar is wrongly called "liquid".
  - **Critical point:** above 647 K / 220.6 bar there is no liquid/vapour distinction. This is not modelled.
  - **High-pressure ices:** not modelled.
  - **Salty water:** salt lowers the freezing point. Not modelled.
- **Source:** melting and boiling points at 1 atm; triple point from IAPWS (Wagner & Pruß 2002; IAPWS R14-08 for the melting and sublimation curves). The boiling points quoted in the code header (≈ 453 K at 10 bar, ≈ 354 K at 0.5 bar) match standard steam tables.
- **Status:** thresholds cited; the 0.5–2 bar "near 1 bar" window is a model choice and **needs human verification**

### E16. Tidal acceleration

- **Equation:** a_tide ≈ 2 G M R_p / r³
- **Where:** `src/physics/tides.ts` → `tidalAcceleration`; called with r = a for the stellar tide and r = d for the moon tide
- **Assumes:** leading term of the expansion of GM/r² across the planet (R_p ≪ r); point masses; circular separation. For an eccentric orbit the tide at periapsis is (1 − e)⁻³ times larger.
- **Check:** Sun on Earth gives 5.05e-7 m s⁻²; Moon on Earth gives 1.1e-6 m s⁻², about 2.2× the solar tide. Both match textbook values.
- **Source:** DESIGN §15; Murray & Dermott ch. 4
- **Status:** cited (textbook)

### E17. Stellar tide relative to Earth

- **Equation:** ratio = a_tide / (2 G M☉ R⊕ / AU³)
- **Where:** `tides.ts` → `stellarTideRelativeToEarth`
- **Status:** cited (definition)

### E18. Moon tide

- **Rule:** `unknown` → null ("no exomoon assumed"); `none` → null; `custom` → E16 with M_moon and d
- **Where:** `tides.ts` → `moonTide`
- **Note:** real planets always have moon status `unknown`. Hypothetical planets use `none`. No UI control for a custom moon exists yet.
- **Status:** cited (design rule DESIGN §16)

### E19. Tidal-locking indicator (qualitative)

- **Equation (internal only; never displayed):** t_lock ≈ ω₀ a⁶ I Q / (3 G M★² k₂ R_p⁵), with I = α M_p R_p²
- **Where:** `tides.ts` → `despinTimescale_yr` (private) and `tidalLockingIndicator`
- **Decision order:**
  1. A measured rotation within 5 % of the orbital period → *likely*.
  2. A measured rotation that is not synchronous → *unlikely*.
  3. Unknown mass or radius → *unknown*.
  4. Otherwise compare t_lock with the system age.
- **Assumes:** constant Q (no frequency dependence), a rocky planet, a circular orbit, no atmospheric tides, no spin–orbit resonances (Mercury's 3:2), no other perturbers.
- **Valid for:** order-of-magnitude answers only. The code says the timescale may be off by a factor of ~100 or more. Secondary sources say the formula is "inaccurate, even to factors of ten".
- **Fails when:** the planet is not rocky (a mini-Neptune with a 10 M⊕ minimum mass), the orbit is eccentric (pseudo-synchronous rotation), or a thick atmosphere drives Venus-like thermal tides.
- **Check:** Earth around the Sun (4.6 Gyr) → *unlikely*. Earth-equivalent orbit around the M3V preset → *likely*. Around the K5V preset → *possible*. These match the qualitative picture in Barnes (2017).
- **Source:** the formula is attributed to Gladman et al. (1996), *Icarus* 122, 166–192, eq. 9, which itself comes from Peale (1977). The reviewer confirmed the paper's citation and that the formula is its eq. 9 through a secondary source ([Wikipedia: Tidal locking](https://en.wikipedia.org/wiki/Tidal_locking)), not the primary PDF. Barnes (2017), *Celest. Mech. Dyn. Astron.* 129, 509 ([arXiv:1708.02981](https://arxiv.org/abs/1708.02981)), is confirmed to exist and to conclude that tidal locking is likely for many habitable-zone planets of GKM dwarfs. The reviewer did **not** confirm that Barnes uses this same formula.
- **Status:** formula cited (secondary); parameters below **need human verification**

---

## 3. Tidal-model constants (`src/physics/tides.ts`)

| Constant | Value | Code says | Reviewer's finding | Status |
|---|---|---|---|---|
| `ASSUMED_Q` | 100 | "Gladman et al. 1996 use Q ≈ 100 for rocky bodies" | Q ~ 100 is a common order-of-magnitude value for rocky bodies. The reviewer could not confirm that Gladman et al. adopt 100. | **needs human verification** |
| `ASSUMED_K2` | 0.3 | "Gladman et al. 1996 rocky-body value ≈ 0.3" | Secondary sources say Gladman et al. use a **rigidity μ** (≈ 3×10¹⁰ N m⁻² for rock) and derive k₂ from it, rather than fixing k₂ = 0.3. Earth's k₂ ≈ 0.3 is a reasonable choice, but the attribution may be wrong. | **needs human verification** |
| `ASSUMED_ALPHA` | 0.33 | Earth ≈ 0.33 | NASA Earth Fact Sheet: I/MR² = 0.3308. Correct for Earth, but it is *assumed* for every planet. | cited (for Earth) |
| `INITIAL_ROTATION_PERIOD_S` | 12 h | — | A secondary summary of Gladman et al. says they assume "one revolution every 12 hours" initially. | cited (secondary) |
| `SYNC_TOLERANCE` | 5 % | — | Model choice | **needs human verification** |
| Age-known bins | likely if t < age; possible if t < 10 × age | — | Model choice | **needs human verification** |
| `LIKELY_BELOW_YR` / `POSSIBLE_BELOW_YR` (age unknown) | 1e9 yr / 1e11 yr | — | Model choice. 1e11 yr is ~7× the age of the universe, so "possible" covers a very wide range. | **needs human verification** |

---

## 4. Habitable zone (Kopparapu et al. 2014)

### E20. Habitable-zone flux limits

- **Equation:** S_eff = S_eff☉ + a T★ + b T★² + c T★³ + d T★⁴, with T★ = T_eff − 5780 K
- **Where:** `src/physics/habitability.ts` → `habitableZoneLimits`; coefficients in `thresholds.json → irradiation`
- **Assumes:** Kopparapu's 1-D, cloud-free climate model for a **1 M⊕** planet with an H₂O/CO₂/N₂ atmosphere. The pass range is the *optimistic* HZ (Early Mars ≤ S ≤ Recent Venus). The conservative HZ is reported in the reason text.
- **Valid for:** 2600 K ≤ T_eff ≤ 7200 K. Outside this range the code **clamps** T_eff to the nearest edge, sets confidence to at most *medium* and says so.
- **Fails when:**
  - O, B, A stars and white dwarfs: T_eff is clamped to 7200 K, so the limits are extrapolated far outside what the fit covers.
  - Planets far from 1 M⊕: the pipeline always uses the 1 M⊕ fit, although real catalog planets go up to ~10 M⊕. Kopparapu (2014) shows that the inner edge moves with planet mass.
  - Planets in eccentric orbits (see E9).
  - Kopparapu's model is itself 1-D and cloud-free. 3-D models with clouds put the inner edge closer to the star for slow rotators.
- **Source:** Kopparapu et al. (2014), *ApJL* 787, L29 ([arXiv:1404.5292](https://arxiv.org/abs/1404.5292)). This builds on Kopparapu et al. (2013), *ApJ* 765, 131 (erratum *ApJ* 770, 82).
- **Status:** **cited**. The reviewer checked every coefficient against Table 1 of arXiv:1404.5292:

| Limit (role in model) | S_eff☉ | a | b | c | d | Status |
|---|---|---|---|---|---|---|
| Recent Venus (inner, optimistic, **pass limit**) | 1.776 | 2.136e-4 | 2.533e-8 | −1.332e-11 | −3.097e-15 | cited |
| Runaway Greenhouse 1 M⊕ (inner, conservative, text only) | 1.107 | 1.332e-4 | 1.58e-8 | −8.308e-12 | −1.931e-15 | cited |
| Maximum Greenhouse (outer, conservative, text only) | 0.356 | 6.171e-5 | 1.698e-9 | −3.198e-12 | −5.575e-16 | cited |
| Early Mars (outer, optimistic, **pass limit**) | 0.32 | 5.547e-5 | 1.526e-9 | −2.874e-12 | −5.011e-16 | cited |
| `teffOffset` 5780 K | | | | | | cited |
| `teffValidRange` 2600–7200 K | | | | | | cited |

Using the optimistic HZ (rather than the conservative one) as the pass limit is a **model choice** and **needs human verification**.

---

## 5. Habitability thresholds (`src/physics/thresholds.json`)

| Key | Value | Role | Source | Status |
|---|---|---|---|---|
| `temperature.preferred.min` | 273.15 K (0 °C) | pass lower bound (critical) | freezing point of pure water at 1 atm | cited |
| `temperature.preferred.max` | 323.15 K (50 °C) | pass upper bound (critical) | Tansey & Brock (1972), *PNAS* 69, 2426 put the eukaryote upper limit at ≈ 60 °C. 50 °C is a "conservative model value" chosen by Agent 5. The paper is confirmed to exist. A 2025 bioRxiv preprint reports a geothermal amoeba growing at higher temperature (not peer-reviewed; not checked by the reviewer). | **needs human verification** |
| `temperature.extended.min` | 253.15 K (−20 °C) | decides how badly the temperature check fails; part of the Uninhabitable rule | Clarke et al. (2013), *PLoS ONE* 8, e66207, "A low temperature limit for life on Earth" (≈ −20 °C for cell division). The paper is confirmed to exist. | cited |
| `temperature.extended.max` | 373.15 K (100 °C) | same | boiling point at 1 atm | cited |
| `temperature.knownLifeUpperLimit` | 395.15 K (122 °C) | context in reason text only | Takai et al. (2008), *PNAS* 105, 10949 (*Methanopyrus kandleri* strain 116, 122 °C under high pressure). Confirmed. | cited |
| `pressure.preferred.min` | 0.1 bar | pass lower bound (supporting) | Model choice. Correctly noted as ≈ 16× the triple-point pressure; water boils near 46 °C at 0.1 bar, which matches steam tables. | **needs human verification** |
| `pressure.preferred.max` | 10 bar | pass upper bound (supporting) | Model choice. The note correctly says this is *not* a biological limit. | **needs human verification** |
| `tidal.extremeStellarTideRelEarth` | 10 000 × Earth's solar tide | flags extreme tides (supporting) | Model choice; the reviewer found no literature threshold. For comparison: the Moon's tide on Earth is ~2.2×; an Earth-equivalent orbit around the M3V preset gives ~180×, and around the white-dwarf preset ~11 000× (flagged). | **needs human verification** |
| `confidence.lowConfidenceMissingFieldPatterns` | mass / radius / eccentricity / semi-major-axis substrings | lowers confidence | Model choice | model choice (no citation expected) |
| `rules.*` (Highly / Marginal / Uninhabitable, confidence) | see file | combination logic | Model design following DESIGN §18–20 | model choice (no citation expected) |

### E21. Classification rule

- **Where:** `habitability.ts` → `combineChecks`, `classifyHabitability`
- **Rule:**
  - *Uninhabitable* if water is below the triple point, OR (no liquid water AND T is outside −20 to 100 °C).
  - *Highly Habitable* if every check that can be evaluated passes and neither critical check is unknown.
  - Otherwise *Marginally Habitable*.
- **Assumes:** the critical checks (temperature, liquid water) matter more than the supporting ones (pressure, starlight, tides). A failed supporting check can only move a planet down to *Marginal*.
- **Consequences worth knowing:**
  - In Prototype 1 the atmosphere is **always** user-assumed, so confidence is never *high*. The best possible is *medium*.
  - The star's type and lifetime are not checked. An O-star or B-star planet set at an Earth-equivalent distance comes out *Highly Habitable (medium confidence)*, although an O star lives only a few million years. See concerns.
- **Status:** model choice following DESIGN §18–19; the weighting **needs human verification**

---

## 6. Star presets (`src/physics/starPresets.ts`)

The reviewer checked the main-sequence rows against E. Mamajek's table, "A Modern Mean Dwarf Stellar Color and Effective Temperature Sequence", version 2022.04.16 ([online](https://www.pas.rochester.edu/~emamajek/EEM_dwarf_UBVIJHK_colors_Teff.txt)), which extends Pecaut & Mamajek (2013), *ApJS* 208, 9. L = 10^logL.

| Preset | T_eff (K) | R (R☉) | M (M☉) | L (L☉) | Table row (T, logL, R, M) | Status |
|---|---|---|---|---|---|---|
| M | 3430 | 0.361 | 0.37 | 0.0162 | M3V: 3430, −1.79, 0.361, 0.37 | cited |
| K | 4440 | 0.701 | 0.70 | 0.174 | K5V: 4440, −0.76, 0.701, 0.70 | cited |
| G | 5772 | 1 | 1 | 1 | IAU 2015 nominal Sun (not the table's G2V: 5770 K, 1.012 R☉). Chosen on purpose so Earth reproduces S = 1 | cited |
| F | 6550 | 1.473 | 1.33 | 3.63 | F5V: 6550, 0.56, 1.473, 1.33 | cited |
| A | 9700 | 2.193 | 2.18 | 38.0 | A0V: 9700, 1.58, 2.193, 2.18 | cited |
| B | 15700 | 3.36 | 4.7 | 589 | B5V: 15700, 2.77, 3.36, 4.7 | cited |
| O | 41400 | 11.45 | 43 | 347 000 | O5V: 41400, 5.54, 11.45, 43 | cited |
| WD | 10 000 | 0.0125 | 0.6 | 0.00141 | Mean DA mass ≈ 0.6 M☉ (Kepler et al. 2007, *MNRAS* 375, 1315; Tremblay et al. 2016, *MNRAS* 461, 2100). The reviewer confirmed Tremblay et al. 2016 exists. R = 0.0125 R☉ is attributed to C/O cooling models (Fontaine, Brassard & Bergeron 2001, *PASP* 113, 409) but was not checked. T_eff = 10 000 K is illustrative. L = (R/R☉)²(T/T☉)⁴ = 0.00141 is arithmetically correct. | mass cited; **radius needs human verification**; T_eff is a model choice |

Assumes: one "typical" star stands for a whole spectral class. Real stars of the same class vary by tens of percent. The B5V table L is 4.9 % below the Stefan–Boltzmann value from its own R and T_eff; the code keeps the table value.

---

## 7. Other constants and model choices

| Item | Where | Value | Source | Status |
|---|---|---|---|---|
| `DEFAULT_ALBEDO` | `types.ts` | 0.30 | Earth's Bond albedo is 0.294 (NASA Earth Fact Sheet); DESIGN §10 | cited (as Earth-like) |
| Earth calibration target | `atmosphere.ts` | 288 K | NASA Earth Fact Sheet | cited |
| Default pressure | `simulate.ts` → `defaultAtmosphere` | 1 bar | Earth's surface pressure is 1.014 bar (NASA Earth Fact Sheet) | cited (as Earth-like) |
| Hypothetical planet | `simulate.ts` → `hypotheticalPlanet` | 1 M⊕, 1 R⊕, e = 0, no moon | DESIGN §8 | model choice |
| Orbit samples | `simulate.ts` | 180 | UI smoothness | model choice |
| Near-1-bar window | `water.ts` | 0.5–2 bar | — | **needs human verification** |

### E22. Data-derived quantities (`src/data/parse.js`)

| Derivation | Equation | Assumes | Status |
|---|---|---|---|
| a from period | a = [G M★ P² / 4π²]^(1/3) | planet mass ≪ M★ (less than 0.003 % error for Earth-mass planets around the Sun) | cited (Kepler III) |
| Radius from Jupiter units | R⊕ = R_J × (R_J/R⊕) | IAU equatorial radii | cited |
| Mass fallback | `pl_masse` → `pl_bmasse` → `pl_massj` | `pl_bmasse` may be **M sin i**, a minimum mass; flagged in `derivedFields` | cited (archive column definitions) |
| Luminosity | L = 10^`st_lum`; errors converted from dex to linear offsets | archive `st_lum` is log₁₀(L/L☉) | cited |
| Missing eccentricity | e = 0 assumed; flagged | circular unless reported | model choice (flagged in UI) |

---

## Known scientific concerns

Ordered by how much they affect the results the user sees.

1. **Eccentric orbits are classified at a only.** Temperature, water phase and habitable-zone checks all use flux at the semi-major axis. At e = 0.6 around the Sun at 1 AU the instantaneous T_eq swings from 201 to 403 K, yet the planet is labelled "Highly Habitable". Better options: use the orbit-averaged flux (Williams & Pollard 2002), or add a check on the periapsis and apoapsis extremes.
2. **O, B and A stars and white dwarfs can come out "Highly Habitable".** Kopparapu's fit is clamped at 7200 K, and there is no stellar-lifetime or UV check. An O5V star lives only a few Myr, which is far too short for planets to cool, let alone for life. Suggestion: add a "star type outside model validity" supporting check, or cap these stars at *Marginal*.
3. **The water phase ignores pressure except at the triple point.** At 10 bar, 380–450 K is called vapour, though water would be liquid. At 0.1 bar, 320–373 K is called liquid, though water would boil. The fix is already planned: a Clausius–Clapeyron or IAPWS saturation curve, swapped in through the `PhaseModel` strategy in `water.ts`.
4. **The one-layer greenhouse cannot produce thick-atmosphere worlds** (maximum 1.19 × T_eq). A planet can never be too hot *because* of its atmosphere, so a Venus analogue looks too cold. The code states this limit, but users should be told in the UI as well.
5. **Pressure and temperature are disconnected.** The pressure slider changes only the water phase and the pressure check, never temperature. This matches DESIGN §12 ("do not invent a pressure→temperature equation"), but users may expect thicker air to mean warmer.
6. **A single 1 M⊕ habitable-zone fit is used for planets up to 10 M⊕**, some of which may be mini-Neptunes. Radius < 4 R⊕ includes sub-Neptunes, which probably have no rocky surface.
7. **Tidal-locking parameters and bins are uncertain** (Section 3). The attribution of k₂ = 0.3 to Gladman et al. may be inaccurate.
8. **Confidence is never "high" in Prototype 1** because the atmosphere is always assumed. This is intended, but the UI should explain it so users don't think something is broken.

---

## Study guide

A winter-break reading plan: for each assumption, what to read and what to check. Start with the ⭐ items. Books marked (library) are university textbooks; ask a school or public library, or look for lecture notes that cover the same material.

| # | Topic / assumption | Read | Then verify or do |
|---|---|---|---|
| 1 ⭐ | Blackbody, Stefan–Boltzmann, T_eq (E1, E3, E11) | Pierrehumbert, *Principles of Planetary Climate* (Cambridge 2010), ch. 3 §3.2–3.3 (library); or Carroll & Ostlie, *An Introduction to Modern Astrophysics*, ch. 3 | Derive T_eq = [F(1−A)/4σ]^¼ yourself. Why 4? What changes for a tidally locked planet (use 2)? Reproduce 255 K for Earth |
| 2 ⭐ | One-layer greenhouse (E12–E14) | Pierrehumbert ch. 3 §3.5 "Partially absorbing atmospheres"; Catling & Kasting, *Atmospheric Evolution on Inhabited and Lifeless Worlds* (Cambridge 2017) ch. 2 §2.2 | Derive T_s = T_eq(2/(2−ε))^¼ from the energy balance of surface and layer. Show that the maximum is 2^¼. Explain why Venus breaks it (ch. 13 of Catling & Kasting covers Venus and the runaway greenhouse) |
| 3 ⭐ | Habitable zone (E20) | Kopparapu et al. 2013 (*ApJ* 765, 131; [arXiv:1301.6674](https://arxiv.org/abs/1301.6674)) and 2014 (*ApJL* 787, L29; [arXiv:1404.5292](https://arxiv.org/abs/1404.5292)); Catling & Kasting ch. 15 §15.1; historical background: Kasting, Whitmire & Reynolds 1993 (*Icarus* 101, 108) | Re-check the Table 1 coefficients. Decide: optimistic or conservative HZ as the pass limit? What does the paper say about other planet masses and about T_eff outside 2600–7200 K? |
| 4 | Orbits (E5–E9) | Murray & Dermott, *Solar System Dynamics* (1999) ch. 2 (library); any university mechanics text on Kepler problems | Derive ⟨F⟩ ∝ 1/(a²√(1−e²)). Read Williams & Pollard 2002 (*Int. J. Astrobiology* 1, 61) on eccentric habitable planets, then propose how the model should handle e > 0 (concern 1) |
| 5 ⭐ | Water phase (E15) | IAPWS releases (free at [iapws.org](https://iapws.org)): R14-08 (melting and sublimation curves) and the IAPWS-95 saturation curve (Wagner & Pruß 2002); any chemistry text on phase diagrams and Clausius–Clapeyron | Plot water's phase diagram. Implement a Clausius–Clapeyron boiling curve and compare it with steam-table values at 0.1, 1 and 10 bar (≈ 319, 373, 453 K). This is the planned replacement for `thresholdModel` |
| 6 | Tides and tidal locking (E16–E19, Section 3) | Gladman et al. 1996 (*Icarus* 122, 166), eq. 9 and the discussion of Q and μ; Peale 1977; Barnes 2017 (*CeMDA* 129, 509; [arXiv:1708.02981](https://arxiv.org/abs/1708.02981)); Murray & Dermott ch. 4–5 | Check: does Gladman use k₂ = 0.3 or a rigidity μ? Which Q? Is the initial spin 12 h? Does Barnes use the same timescale formula? Replace or confirm the 5 %, 10× age, 1e9 and 1e11 yr bins |
| 7 | Temperature limits for life (thresholds.json) | Tansey & Brock 1972 (*PNAS* 69, 2426); Clarke et al. 2013 (*PLoS ONE* 8, e66207); Takai et al. 2008 (*PNAS* 105, 10949); a review of extremophile limits (e.g. Rothschild & Mancinelli 2001, *Nature* 409, 1092; the reviewer did not check this citation) | Decide whether 50 °C is the right "preferred" upper limit. Check whether newer results (e.g. the 2025 amoeba preprint) change the eukaryote limit |
| 8 | Pressure limits (thresholds.json) | Catling & Kasting ch. 1–2 (atmospheric structure); read about Mars (0.006 bar) and Venus (92 bar) | Is 0.1–10 bar defensible? What sets a lower limit other than the triple point (for example UV shielding and atmospheric escape)? |
| 9 | Star presets (Section 6) | Pecaut & Mamajek 2013 (*ApJS* 208, 9) and Mamajek's online table; for white dwarfs: Tremblay et al. 2016 and the Montreal white-dwarf cooling models | Confirm the WD radius of 0.0125 R☉ for 0.6 M☉ at 10 000 K. Look up main-sequence lifetimes (t ∝ M/L) and propose a lifetime check (concern 2) |
| 10 | Stellar spectra and habitability | Catling & Kasting ch. 15; Kopparapu 2013 §3 (why cooler stars have lower S limits) | Explain in your own words why the HZ limits depend on T_eff (the reason text says "redder light is absorbed more easily") |
| 11 | Data and uncertainties | NASA Exoplanet Archive [column definitions](https://exoplanetarchive.ipac.caltech.edu/docs/API_PS_columns.html) and Christiansen et al. 2025 (*PSJ* 6, 186) | Understand `default_flag`, M sin i (`pl_bmasse`) and err1/err2. Plan Monte Carlo uncertainty propagation (DESIGN §20) |
| 12 | Validation | [validation/VALIDATION_REPORT.md](validation/VALIDATION_REPORT.md) | For every mismatch listed there, trace which assumption above causes it |

After each item: update this file (change the status to **cited** with the page or equation number, or record the corrected value), change `thresholds.json` `status` fields to match, and add a CHANGELOG entry for any change to model values.
