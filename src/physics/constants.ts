/**
 * Physical and astronomical constants — OWNED BY AGENT 0 (contract file).
 *
 * The design doc asks for Astropy constants. The app runs in the browser, so
 * these values are transcribed from exactly the sets Astropy uses by default
 * (CODATA 2018 and IAU 2015 Resolution B3 nominal values), so a future Python
 * reference engine using Astropy will agree to full precision.
 *
 * Convention: every value is SI. Names carry no unit suffix because SI is the
 * only internal unit system (see DESIGN.md §Units).
 *
 * Do not edit these values without a CHANGELOG entry and a cited source.
 */

/** Gravitational constant [m^3 kg^-1 s^-2]. CODATA 2018. */
export const G = 6.6743e-11;

/** Stefan–Boltzmann constant [W m^-2 K^-4]. CODATA 2018 (exact, derived). */
export const SIGMA_SB = 5.670374419e-8;

/** Astronomical unit [m]. IAU 2012 Resolution B2 (exact). */
export const AU = 1.495978707e11;

/** Nominal solar radius [m]. IAU 2015 B3. */
export const R_SUN = 6.957e8;

/** Nominal solar luminosity [W]. IAU 2015 B3. */
export const L_SUN = 3.828e26;

/** Solar mass [kg] = (GM)_sun nominal / G, as in Astropy (IAU 2015 + CODATA 2018). */
export const M_SUN = 1.988409870698051e30;

/** Nominal solar effective temperature [K]. IAU 2015 B3. */
export const T_SUN = 5772;

/** Nominal equatorial Earth radius [m]. IAU 2015 B3. */
export const R_EARTH = 6.3781e6;

/** Earth mass [kg] = (GM)_earth nominal / G, as in Astropy. */
export const M_EARTH = 5.972167867791379e24;

/** Nominal equatorial Jupiter radius [m]. IAU 2015 B3. */
export const R_JUPITER = 7.1492e7;

/** Jupiter mass [kg] = (GM)_jup nominal / G, as in Astropy. */
export const M_JUPITER = 1.8981245973360505e27;

/** Moon mass [kg]. NASA GSFC Moon Fact Sheet (not an Astropy constant). */
export const M_MOON = 7.346e22;

/** Earth–Moon mean distance (semi-major axis) [m]. NASA GSFC Moon Fact Sheet. */
export const EARTH_MOON_DISTANCE = 3.844e8;

/** Standard gravity [m s^-2]. CGPM 1901 (exact). Used only for display ratios. */
export const G_EARTH_STANDARD = 9.80665;

/** Seconds per day. */
export const DAY = 86400;

/** Julian year [s] (365.25 d). IAU convention. */
export const YEAR = 365.25 * DAY;

/** Standard atmosphere [Pa]. */
export const ATM_PA = 101325;

/** 1 bar [Pa]. */
export const BAR_PA = 1e5;

/** Water triple point: temperature [K] and pressure [bar] (IAPWS). */
export const WATER_TRIPLE_POINT_K = 273.16;
export const WATER_TRIPLE_POINT_BAR = 0.00611657;

/** Present-day solar constant at 1 AU [W m^-2], derived: L_SUN / (4π AU²). */
export const S_EARTH = L_SUN / (4 * Math.PI * AU * AU);
