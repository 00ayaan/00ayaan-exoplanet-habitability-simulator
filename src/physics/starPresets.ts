/**
 * Star-type presets — OWNED BY AGENT 1 (Star).
 *
 * One representative star per StarType for hypothetical-planet mode.
 *
 * Main-sequence values (O, B, A, F, K, M) are taken row-for-row from a single
 * source: Pecaut & Mamajek (2013, ApJS 208, 9) as maintained by E. Mamajek in
 * "A Modern Mean Dwarf Stellar Color and Effective Temperature Sequence"
 * (EEM_dwarf_UBVIJHK_colors_Teff.txt, version 2022.04.16): columns Teff,
 * R_Rsun, Msun and logL (luminosity_Lsun = 10^logL, rounded to 3 s.f.).
 *
 * The G preset is exactly the IAU 2015 nominal Sun (5772 K, 1 R☉, 1 M☉,
 * 1 L☉) rather than the table's G2V row (5770 K, 1.012 R☉), so that the
 * Earth validation case reproduces S = 1 and ≈ 288 K exactly.
 *
 * Consistency with Stefan–Boltzmann, (R/R☉)²(T/T☉)⁴ vs tabulated L:
 *   O5V +0.1 %, B5V +4.9 %, A0V +0.9 %, F5V −0.9 %, K5V −1.0 %, M3V +0.2 %.
 * The tabulated L is kept (it is the source's value); the B5V offset comes
 * from the table's own rounding/bolometric corrections and is within tolerance.
 *
 * These are typical values for a class — real stars of the same class vary.
 */
import type { Star, StarType } from './types';

const MAMAJEK_REF =
  'Pecaut & Mamajek (2013, ApJS 208, 9); E. Mamajek, "A Modern Mean Dwarf Stellar Color and Effective Temperature Sequence", table v2022.04.16';

export const STAR_PRESETS: Readonly<Record<StarType, Star>> = Object.freeze({
  M: Object.freeze({
    name: 'Typical M dwarf (M3V)',
    spectralType: 'M',
    teff_K: 3430,
    radius_Rsun: 0.361,
    mass_Msun: 0.37,
    luminosity_Lsun: 0.0162, // 10^-1.79
    source: 'preset:M',
    reference: `${MAMAJEK_REF}, row M3V`,
  }),
  K: Object.freeze({
    name: 'Typical K dwarf (K5V)',
    spectralType: 'K',
    teff_K: 4440,
    radius_Rsun: 0.701,
    mass_Msun: 0.7,
    luminosity_Lsun: 0.174, // 10^-0.76
    source: 'preset:K',
    reference: `${MAMAJEK_REF}, row K5V`,
  }),
  G: Object.freeze({
    name: 'Sun-like star (G2V, the Sun)',
    spectralType: 'G',
    teff_K: 5772,
    radius_Rsun: 1,
    mass_Msun: 1,
    luminosity_Lsun: 1,
    source: 'preset:G',
    reference: 'IAU 2015 Resolution B3 nominal solar values (Prša et al. 2016, AJ 152, 41)',
  }),
  F: Object.freeze({
    name: 'Typical F dwarf (F5V)',
    spectralType: 'F',
    teff_K: 6550,
    radius_Rsun: 1.473,
    mass_Msun: 1.33,
    luminosity_Lsun: 3.63, // 10^0.56
    source: 'preset:F',
    reference: `${MAMAJEK_REF}, row F5V`,
  }),
  A: Object.freeze({
    name: 'Typical A dwarf (A0V)',
    spectralType: 'A',
    teff_K: 9700,
    radius_Rsun: 2.193,
    mass_Msun: 2.18,
    luminosity_Lsun: 38.0, // 10^1.58
    source: 'preset:A',
    reference: `${MAMAJEK_REF}, row A0V`,
  }),
  B: Object.freeze({
    name: 'Typical B dwarf (B5V)',
    spectralType: 'B',
    teff_K: 15700,
    radius_Rsun: 3.36,
    mass_Msun: 4.7,
    luminosity_Lsun: 589, // 10^2.77; Stefan–Boltzmann from R, Teff gives 618 (+4.9 %)
    source: 'preset:B',
    reference: `${MAMAJEK_REF}, row B5V`,
  }),
  O: Object.freeze({
    name: 'Typical O dwarf (O5V)',
    spectralType: 'O',
    teff_K: 41400,
    radius_Rsun: 11.45,
    mass_Msun: 43,
    luminosity_Lsun: 347000, // 10^5.54
    source: 'preset:O',
    reference: `${MAMAJEK_REF}, row O5V`,
  }),
  WD: Object.freeze({
    name: 'Typical DA white dwarf (0.6 M☉, 10 000 K)',
    spectralType: 'WD',
    teff_K: 10000,
    radius_Rsun: 0.0125,
    mass_Msun: 0.6,
    luminosity_Lsun: 0.00141, // (R/R☉)²(T/T☉)⁴
    source: 'preset:WD',
    reference:
      'Mean DA mass ≈ 0.6 M☉: Kepler et al. (2007, MNRAS 375, 1315); Tremblay et al. (2016, MNRAS 461, 2100). ' +
      'Radius ≈ 0.0125 R☉ for 0.6 M☉ at 10 000 K from standard C/O cooling models (Fontaine, Brassard & Bergeron 2001, PASP 113, 409) — needs human verification. ' +
      'Teff 10 000 K is an illustrative choice; L computed from R and Teff via Stefan–Boltzmann.',
  }),
});

export const STAR_TYPE_LABELS: Readonly<Record<StarType, string>> = Object.freeze({
  M: 'M — red dwarf',
  K: 'K — orange dwarf',
  G: 'G — Sun-like',
  F: 'F — yellow-white dwarf',
  A: 'A — white main-sequence',
  B: 'B — blue-white main-sequence',
  O: 'O — hot blue main-sequence',
  WD: 'WD — white dwarf',
});

/**
 * Return a fresh copy of the preset for a star type (safe to mutate).
 *
 * @throws RangeError if `type` is not a known StarType.
 */
export function getStarPreset(type: StarType): Star {
  const preset = STAR_PRESETS[type];
  if (!preset) throw new RangeError(`Unknown star type: ${String(type)}`);
  return { ...preset };
}
