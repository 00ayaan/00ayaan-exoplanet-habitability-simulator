# Validation report — Exoplanet Habitability Simulator, Prototype 1

Generated 2026-09-29 by `validation/generate-report.test.ts` (Agent 9, independent validation). Do not edit by hand — rerun `npx vitest run validation`.

Reference values are derived independently (validation/reference.ts: CODATA 2018, IAU 2015 nominal values, NASA GSFC planetary fact sheets, Kopp & Lean 2011, Kopparapu et al. 2014, IAPWS) — never from the implementation's own constants or formulas. Verdicts are computed: ✓ within tolerance; ⚠ outside tolerance but a documented limitation of the simplified model; ✗ bug (outside tolerance and not an accepted limitation).

**Summary:** 33 cases — 27 ✓, 6 ⚠ known limitation, 0 ✗ bug.

| Group | Case | Model | Reference | Reference source | Diff % | Verdict | Note |
|---|---|---|---|---|---|---|---|
| Earth | Solar constant at 1 AU | 1361 W m⁻² | 1361 W m⁻² | Kopp & Lean 2011 (1360.8 ± 0.5) | +0.03 | ✓ | tol ±0.1 % |
| Earth | T_eq, A = 0.30 | 254.6 K | 255 K | Textbook value (e.g. Pierrehumbert 2010) | -0.16 | ✓ | tol ±0.5 % |
| Earth | T_eq, A = 0.294 (NASA albedo) | 255.1 K | 254 K | NASA Earth fact sheet (black-body T) | +0.44 | ✓ | NASA 254.0 K implies A ≈ 0.306; hand calc with 0.294 gives 255.1 K |
| Earth | Orbital period, 1 AU, 1 M☉ | 365.256 d | 365.256 d | NASA Earth fact sheet (sidereal) | +0.0001 | ✓ | tol ±0.01 % |
| Earth | Surface gravity (1 M⊕, 1 R⊕) | 9.798 m s⁻² | 9.807 m s⁻² | CGPM standard gravity 9.80665 | -0.08 | ✓ | NASA mean 9.82 uses volumetric radius 6371 km |
| Earth | Surface T, Earth greenhouse | 288 K | 288 K | NASA Earth fact sheet | +0.0000 | ✓ | calibration target, not a prediction |
| Earth | Sun’s tide on Earth | 5.057e-7 m s⁻² | 5.057e-7 m s⁻² | Hand calc 2GM☉R⊕/AU³ (IAU GM☉) | +0.0000 | ✓ | tol ±0.01 % |
| Earth | Moon’s tide on Earth | 1.101e-6 m s⁻² | 1.100e-6 m s⁻² | Standard value; hand calc 1.10e-6 (NASA Moon sheet GM, 384 400 km) | +0.10 | ✓ | tol ±1.5 % |
| Earth | Sun/Moon tide ratio | 0.4592 | 0.46 | Classical ratio (NOAA Tides & Water Levels) | -0.16 | ✓ | tol ±2 % |
| Venus | Flux at 0.7233 AU | 2602 W m⁻² | 2601 W m⁻² | NASA Venus fact sheet | +0.0085 | ✓ | tol ±0.1 % |
| Venus | T_eq, A = 0.77 | 226.6 K | 226.6 K | NASA Venus fact sheet (black-body T) | +0.01 | ✓ | tol ±0.5 % |
| Venus | Surface T, A = 0.76, greenhouse = 1 (model max) | 272.4 K | 737 K | NASA Venus fact sheet | -63.04 | ⚠ known limitation | One-layer model caps warming at 2^¼ ≈ 1.19 × T_eq; a 92-bar CO₂ atmosphere is optically thick in many layers |
| Venus | Surface T, A = 0.76, Earth greenhouse | 259.1 K | 737 K | NASA Venus fact sheet | -64.84 | ⚠ known limitation | Same cap; greenhouse slider is not tied to pressure or composition |
| Mars | Flux at 1.5238 AU | 586.2 W m⁻² | 586.2 W m⁻² | NASA Mars fact sheet | +0.0033 | ✓ | tol ±0.1 % |
| Mars | T_eq, A = 0.25 | 209.8 K | 209.8 K | NASA Mars fact sheet (black-body T) | +0.01 | ✓ | tol ±0.5 % |
| Mars | Surface T, greenhouse = 0 | 209.8 K | 210 K | NASA Mars fact sheet (~210 K; current sheet ~214 K) | -0.08 | ✓ | tol ±3 % |
| Mars | Surface T, Earth greenhouse (default slider) | 237.4 K | 210 K | NASA Mars fact sheet | +13.03 | ⚠ known limitation | Greenhouse strength is independent of pressure: a 0.006-bar atmosphere gets Earth’s 1-bar warming |
| Habitable zone | Recent-Venus limit for the 5772 K Sun | 1.774 S⊕ | 1.774 S⊕ | Kopparapu et al. 2014 Table 1 (1.776 at 5780 K) | +0.0000 | ✓ | tol ±0.01 % |
| Limits | T_s/T_eq at greenhouse = 1 | 1.189 | 1.189 | One-layer grey model (analytic) | +0.0000 | ✓ | tol ±0.000001 % |
| Limits | T_s/T_eq at greenhouse = 0 | 1 | 1 | Analytic | +0.0000 | ✓ | tol ±0.000001 % |
| Limits | Insolation at 1000 AU | 1.000e-6 S⊕ | 1.000e-6 S⊕ | Inverse-square law | +0.0000 | ✓ | tol ±0.000001 % |
| Limits | T_eq, A = 0 (black body) | 278.3 K | 278.3 K | Hand calc [S/(4σ)]^¼ (≈ 278.3 K) | +0.0000 | ✓ | tol ±0.01 % |
| Limits | Period ratio e = 0.99 / e = 0 | 1 | 1 | Kepler III (independent of e) | +0.0000 | ✓ | tol ±1e-9 % |
| Classification | Earth status | Highly Habitable | Highly Habitable | Reality / DESIGN §25 | — | ✓ |  |
| Classification | Earth water phase | liquid | liquid | Reality | — | ✓ |  |
| Classification | Venus status (A 0.76, 92 bar, greenhouse 1) | Uninhabitable | Uninhabitable | Reality (737 K, no liquid) | — | ✓ | Fixed bug: was Marginally Habitable (capped T_s ≈ 272 K fell inside the 253–373 K extended band); new Uninhabitable rule |
| Classification | Venus status (A 0.76, 92 bar, Earth greenhouse) | Uninhabitable | Uninhabitable | Reality (737 K, no liquid) | — | ✓ | Fixed bug: was Marginally Habitable (same rule gap) |
| Classification | Venus water phase (greenhouse 1) | ice | vapor | Reality (737 K ≫ boiling) | — | ⚠ known limitation | Consequence of the one-layer temperature cap (model says ice) |
| Classification | Mars status (0.006 bar) | Uninhabitable | Uninhabitable | Reality / triple point (IAPWS) | — | ✓ |  |
| Classification | Mars water phase (0.006 bar) | no-liquid-below-triple-point | no-liquid-below-triple-point | IAPWS triple point 611.657 Pa | — | ✓ |  |
| Limits | Albedo = 1 (valid input): water phase, status | ice, Uninhabitable | ice, Uninhabitable | AGENTS.md rule 9 (only A outside [0,1] is invalid) | — | ✓ | Fixed bug: previously threw in waterPhase() on T = 0 K |
| Limits | e = 0.99 changes habitability vs e = 0 | no change | changes | Mean flux ∝ 1/√(1−e²) ≈ 7.1×; periapsis flux 10⁴× | — | ⚠ known limitation | Headline flux/T/classification use a, not the orbit-averaged or periapsis flux |
| Limits | Water phase at ~411 K, 100 bar | vapor | liquid | IAPWS saturation T at 100 bar ≈ 584 K | — | ⚠ known limitation | Fixed 373.15 K boiling threshold, no Clausius–Clapeyron curve yet |

## Bugs (✗)

None.

## Known limitations confirmed (⚠)

- **Surface T, A = 0.76, greenhouse = 1 (model max)** — model 272.4 K vs 737 K. One-layer model caps warming at 2^¼ ≈ 1.19 × T_eq; a 92-bar CO₂ atmosphere is optically thick in many layers
- **Surface T, A = 0.76, Earth greenhouse** — model 259.1 K vs 737 K. Same cap; greenhouse slider is not tied to pressure or composition
- **Surface T, Earth greenhouse (default slider)** — model 237.4 K vs 210 K. Greenhouse strength is independent of pressure: a 0.006-bar atmosphere gets Earth’s 1-bar warming
- **Venus water phase (greenhouse 1)** — model ice vs vapor. Consequence of the one-layer temperature cap (model says ice)
- **e = 0.99 changes habitability vs e = 0** — model no change vs changes. Headline flux/T/classification use a, not the orbit-averaged or periapsis flux
- **Water phase at ~411 K, 100 bar** — model vapor vs liquid. Fixed 373.15 K boiling threshold, no Clausius–Clapeyron curve yet

## Also verified by the test suite (not tabulated)

- e → 0 continuity (e = 1e-9 ≡ e = 0); e = 0.99 samples satisfy Kepler’s equation, the orbit equation and focus geometry; time-averaged sampled flux = F(a)/√(1−e²).
- Property sweep over 8 star presets × 11 distances × 6 pressures × 5 greenhouse values: every numeric output finite or explicitly null; flux ∝ a⁻², T_s ∝ a^−½, T_s monotonic in a, greenhouse and albedo; stellar tide ∝ M★/a³.
- Unknown mass/radius never throws; dependent outputs are null and confidence drops to low. Invalid inputs (e ≥ 1, a ≤ 0, A ∉ [0,1], greenhouse ∉ [0,1], P < 0, NaN) throw RangeError.
- Star presets’ tabulated L agree with R²(T/T☉)⁴ within 5 %.
