/**
 * INDEPENDENT reference data and first-principles helpers — Agent 9 (Validation).
 *
 * Deliberately does NOT import src/physics/constants.ts, units.ts or any physics
 * function: every expected value in validation/ is derived here from published
 * constants and data, so a transcription error in the implementation cannot be
 * silently shared by its tests.
 *
 * Sources:
 *  - CODATA 2018 (NIST): G, σ.
 *  - IAU 2015 Resolution B3 nominal values: (GM)☉, L☉, R☉, (GM)⊕, R⊕ (equatorial).
 *  - IAU 2012 Resolution B2: astronomical unit (exact).
 *  - NASA GSFC Planetary Fact Sheets (nssdc.gsfc.nasa.gov/planetary/factsheet/), accessed 2026-09-29:
 *      Venus: a = 108.210e6 km, Bond albedo 0.77, 92 bar, mean T 737 K, black-body T 226.6 K
 *      Earth: a = 149.598e6 km, Bond albedo 0.294, 1.014 bar, mean T 288 K, black-body T 254.0 K,
 *             sidereal period 365.256 d, mean g 9.820 m/s²
 *      Mars:  a = 227.956e6 km, Bond albedo 0.250, 6.36 mbar (4.0–8.7 mbar), mean T ~214 K,
 *             black-body T 209.8 K
 *      Moon:  GM = 4902.800 km³/s², mass 0.07346e24 kg, semi-major axis 384 400 km
 *  - Kopp & Lean 2011, GRL 38, L01706: total solar irradiance 1360.8 ± 0.5 W m^-2.
 *  - Haus et al. 2016, Icarus 272, 178: Venus Bond albedo 0.76 (NASA sheet lists 0.77).
 *  - Kopparapu et al. 2014, ApJL 787, L29, Table 1: Recent-Venus S_eff⊙ = 1.776.
 *  - IAPWS: water triple point 273.16 K, 611.657 Pa.
 */

// ---------------------------------------------------------------------------
// Constants (independently transcribed)
// ---------------------------------------------------------------------------

export const REF = {
  G: 6.6743e-11, // CODATA 2018
  sigma: 5.670374419e-8, // CODATA 2018
  AU_m: 1.495978707e11, // IAU 2012 B2
  GM_sun: 1.3271244e20, // IAU 2015 B3 nominal (GM)☉ [m³ s⁻²]
  L_sun_W: 3.828e26, // IAU 2015 B3 nominal
  R_sun_m: 6.957e8, // IAU 2015 B3 nominal
  T_sun_K: 5772, // IAU 2015 B3 nominal
  GM_earth: 3.986004e14, // IAU 2015 B3 nominal (GM)⊕
  R_earth_eq_m: 6.3781e6, // IAU 2015 B3 nominal equatorial
  GM_moon: 4.9028e12, // NASA Moon fact sheet 4902.800 km³/s²
  moonDistance_m: 3.844e8, // NASA Moon fact sheet
  day_s: 86400,
  siderealYear_d: 365.256363, // IERS / NASA Earth fact sheet 365.256 d
  julianYear_d: 365.25,
  standardGravity: 9.80665, // CGPM 1901
  nasaEarthMeanGravity: 9.82, // NASA Earth fact sheet (mean, incl. rotation effects)
  TSI_KoppLean2011: 1360.8, // W m^-2 ± 0.5
  waterTriplePoint_bar: 0.00611657, // IAPWS 611.657 Pa
} as const;

export const G_M_SUN_KG = REF.GM_sun / REF.G;

// ---------------------------------------------------------------------------
// First-principles formulas (written independently of src/physics)
// ---------------------------------------------------------------------------

/** Radiative equilibrium temperature: σT⁴ = F(1−A)/4. */
export function refTeq(flux_W_m2: number, albedo: number): number {
  return Math.pow((flux_W_m2 * (1 - albedo)) / (4 * REF.sigma), 0.25);
}

/**
 * One-layer grey atmosphere (textbook, e.g. Pierrehumbert 2010 §3.5; Kasting & Catling):
 * surface σTs⁴ = absorbed + ε σTa⁴, layer ε σTs⁴ = 2 ε σTa⁴  ⇒  Ts⁴ = Teq⁴ · 2/(2−ε).
 */
export function refOneLayerTs(teq_K: number, epsilon: number): number {
  return teq_K * Math.pow(2 / (2 - epsilon), 0.25);
}

/** Flux from a star of luminosity L_Lsun at distance d_AU [W m^-2]. */
export function refFlux(L_Lsun: number, d_AU: number): number {
  const d = d_AU * REF.AU_m;
  return (L_Lsun * REF.L_sun_W) / (4 * Math.PI * d * d);
}

/** Kepler III in SI with total mass: P = 2π √(a³ / (G(M★+Mp))). */
export function refPeriod_d(a_AU: number, starMass_Msun: number, planetGM = 0): number {
  const a = a_AU * REF.AU_m;
  return (2 * Math.PI * Math.sqrt((a * a * a) / (REF.GM_sun * starMass_Msun + planetGM))) / REF.day_s;
}

/** Leading-order differential tidal acceleration 2GM R / r³, from GM directly. */
export function refTide(GM: number, R_m: number, r_m: number): number {
  return (2 * GM * R_m) / (r_m * r_m * r_m);
}

/** Kopparapu et al. 2014 Recent-Venus (optimistic inner) limit, Table 1 coefficients. */
export function refRecentVenusSeff(teff_K: number): number {
  const t = teff_K - 5780;
  return 1.776 + 2.136e-4 * t + 2.533e-8 * t * t - 1.332e-11 * t ** 3 - 3.097e-15 * t ** 4;
}

/** Percentage difference model vs reference. */
export function pctDiff(model: number, reference: number): number {
  return ((model - reference) / reference) * 100;
}

// ---------------------------------------------------------------------------
// Solar System reference planets (NASA fact sheets)
// ---------------------------------------------------------------------------

export interface RefPlanet {
  name: string;
  a_AU: number;
  bondAlbedo: number;
  albedoSource: string;
  surfacePressure_bar: number;
  pressureSource: string;
  meanSurfaceTemp_K: number;
  tempSource: string;
  nasaBlackBodyTemp_K: number;
  nasaBondAlbedo: number;
  /** What a planet like this is in reality, by the model's own definitions. */
  expectedStatus: 'Uninhabitable' | 'Highly Habitable';
}

export const VENUS: RefPlanet = {
  name: 'Venus',
  a_AU: 108.21e9 / REF.AU_m, // 0.72334
  bondAlbedo: 0.76,
  albedoSource: 'Haus et al. 2016 (NASA sheet: 0.77)',
  surfacePressure_bar: 92,
  pressureSource: 'NASA Venus fact sheet',
  meanSurfaceTemp_K: 737,
  tempSource: 'NASA Venus fact sheet',
  nasaBlackBodyTemp_K: 226.6,
  nasaBondAlbedo: 0.77,
  expectedStatus: 'Uninhabitable',
};

export const EARTH: RefPlanet = {
  name: 'Earth',
  a_AU: 1,
  bondAlbedo: 0.3,
  albedoSource: 'model default 0.30 (NASA sheet: 0.294)',
  surfacePressure_bar: 1,
  pressureSource: 'NASA Earth fact sheet (1.014 bar)',
  meanSurfaceTemp_K: 288,
  tempSource: 'NASA Earth fact sheet',
  nasaBlackBodyTemp_K: 254.0,
  nasaBondAlbedo: 0.294,
  expectedStatus: 'Highly Habitable',
};

export const MARS: RefPlanet = {
  name: 'Mars',
  a_AU: 227.956e9 / REF.AU_m, // 1.52378
  bondAlbedo: 0.25,
  albedoSource: 'NASA Mars fact sheet',
  surfacePressure_bar: 0.006,
  pressureSource: 'NASA Mars fact sheet (6.36 mbar mean, 4.0–8.7 mbar)',
  meanSurfaceTemp_K: 210,
  tempSource: 'NASA Mars fact sheet (~210 K commonly cited; current sheet ~214 K)',
  nasaBlackBodyTemp_K: 209.8,
  nasaBondAlbedo: 0.25,
  expectedStatus: 'Uninhabitable',
};
