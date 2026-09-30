/**
 * UI-development MOCKS for the engine. Plausible numbers with the correct
 * SimulationOutput / Catalog shapes so the UI can be built before the real
 * pipeline lands. NOT the physics of record — Agent 8 swaps real modules in via
 * src/ui/engine.ts and this file becomes dev-only.
 */
import type {
  Atmosphere,
  Catalog,
  HabitabilityCheck,
  HabitabilityResult,
  OrbitSample,
  Planet,
  Result,
  SimulationInput,
  SimulationOutput,
  Star,
  StarType,
  TidalLocking,
  WaterPhase,
} from '../physics/types';
import { DEFAULT_ALBEDO, MODEL_ASSUMPTIONS } from '../physics/types';
import { G, SIGMA_SB, S_EARTH, M_SUN, L_SUN, M_EARTH, R_EARTH, AU } from '../physics/constants';

export const MOCK_EARTH_GREENHOUSE = 0.78;

function preset(type: StarType, name: string, teff_K: number, radius_Rsun: number, mass_Msun: number, luminosity_Lsun: number): Star {
  return { name, spectralType: type, teff_K, radius_Rsun, mass_Msun, luminosity_Lsun, source: `preset:${type}`, reference: 'mock preset' };
}

export const MOCK_STAR_PRESETS: Readonly<Record<StarType, Star>> = {
  M: preset('M', 'Typical M dwarf (mock)', 3430, 0.36, 0.37, 0.0162),
  K: preset('K', 'Typical K dwarf (mock)', 4440, 0.7, 0.7, 0.174),
  G: preset('G', 'Sun-like star (mock)', 5772, 1, 1, 1),
  F: preset('F', 'Typical F dwarf (mock)', 6550, 1.36, 1.33, 3.0),
  A: preset('A', 'Typical A star (mock)', 9700, 2.1, 2.3, 35),
  B: preset('B', 'Typical B star (mock)', 15700, 3.4, 4.4, 600),
  O: preset('O', 'Typical O star (mock)', 41400, 11, 40, 250000),
  WD: preset('WD', 'Typical white dwarf (mock)', 10000, 0.0126, 0.6, 0.0014),
};

export const MOCK_STAR_TYPE_LABELS: Readonly<Record<StarType, string>> = {
  M: 'M — red dwarf',
  K: 'K — orange dwarf',
  G: 'G — Sun-like',
  F: 'F — yellow-white dwarf',
  A: 'A — white main-sequence',
  B: 'B — blue-white main-sequence',
  O: 'O — hot blue main-sequence',
  WD: 'WD — white dwarf',
};

export function mockHypotheticalPlanet(a_AU: number): Planet {
  return { name: 'Hypothetical planet', mass_Mearth: 1, radius_Rearth: 1, a_AU, ecc: 0, moon: { kind: 'none' }, source: 'hypothetical' };
}

export function mockDefaultAtmosphere(): Atmosphere {
  return { surfacePressure_bar: 1, greenhouse: MOCK_EARTH_GREENHOUSE, albedo: DEFAULT_ALBEDO };
}

const r = <T>(value: T, unit: string, assumptions: string[] = []): Result<T> => ({ value, unit, assumptions });
const teq = (flux: number, A: number) => Math.pow((flux * (1 - A)) / (4 * SIGMA_SB), 0.25);

function solveKepler(M: number, e: number): number {
  let E = e < 0.8 ? M : Math.PI;
  for (let i = 0; i < 30; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  return E;
}

export function mockSimulate(input: SimulationInput): SimulationOutput {
  const { star, planet, atmosphere } = input;
  const L = (star.luminosity_Lsun ?? star.radius_Rsun ** 2 * (star.teff_K / 5772) ** 4) * L_SUN;
  const a = planet.a_AU * AU;
  const e = planet.ecc;
  const Mstar = star.mass_Msun * M_SUN;
  const flux = L / (4 * Math.PI * a * a);
  const S = flux / S_EARTH;
  const P = 2 * Math.PI * Math.sqrt(a ** 3 / (G * Mstar));
  const Teq = teq(flux, atmosphere.albedo);
  const eps = Math.min(1, Math.max(0, atmosphere.greenhouse));
  const Ts = Teq * Math.pow(2 / (2 - eps), 0.25);

  const n = input.orbitSamples ?? 180;
  const samples: OrbitSample[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const E = solveKepler(2 * Math.PI * t, e);
    const theta = 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2));
    const d = a * (1 - e * Math.cos(E));
    const f = L / (4 * Math.PI * d * d);
    samples.push({ timeFraction: t, trueAnomaly_rad: theta, distance_m: d, x_m: d * Math.cos(theta), y_m: d * Math.sin(theta), flux_W_m2: f, equilibriumTemp_K: teq(f, atmosphere.albedo) });
  }

  const g = planet.mass_Mearth != null && planet.radius_Rearth != null
    ? (G * planet.mass_Mearth * M_EARTH) / (planet.radius_Rearth * R_EARTH) ** 2 : null;
  let phase: WaterPhase = Ts < 273.15 ? 'ice' : Ts > 373.15 ? 'vapor' : 'liquid';
  if (atmosphere.surfacePressure_bar < 0.00611657) phase = 'no-liquid-below-triple-point';

  const Rp = planet.radius_Rearth != null ? planet.radius_Rearth * R_EARTH : null;
  const tideAcc = Rp != null ? (2 * G * Mstar * Rp) / a ** 3 : null;
  const earthTide = (2 * G * M_SUN * R_EARTH) / AU ** 3;
  const tideRel = tideAcc != null ? tideAcc / earthTide : null;
  const locking: TidalLocking = tideRel == null ? 'unknown' : tideRel > 1000 ? 'likely' : tideRel > 30 ? 'possible' : 'unlikely';

  const checks: HabitabilityCheck[] = [
    { id: 'temperature', label: 'Surface temperature', passed: Ts >= 273 && Ts <= 323, observed: `${Ts.toFixed(0)} K`, target: '273–323 K', reason: Ts < 273 ? 'Too cold for the preferred range.' : Ts > 323 ? 'Too hot for the preferred range.' : 'Within the preferred range.', weight: 'critical' },
    { id: 'liquidWater', label: 'Liquid water possible', passed: phase === 'liquid', observed: phase, target: 'liquid', reason: phase === 'liquid' ? 'Modeled water phase is liquid.' : `Modeled water phase is ${phase}.`, weight: 'critical' },
    { id: 'pressure', label: 'Surface pressure', passed: atmosphere.surfacePressure_bar >= 0.1 && atmosphere.surfacePressure_bar <= 10, observed: `${atmosphere.surfacePressure_bar.toPrecision(3)} bar`, target: '0.1–10 bar', reason: 'Mock pressure check.', weight: 'supporting' },
    { id: 'irradiation', label: 'Stellar irradiation', passed: S >= 0.25 && S <= 1.5, observed: `${S.toPrecision(3)} S⊕`, target: '0.25–1.5 S⊕', reason: 'Mock insolation check.', weight: 'supporting' },
    { id: 'tidal', label: 'Tidal environment', passed: locking === 'unknown' ? null : locking !== 'likely', observed: locking, target: 'not likely locked', reason: locking === 'unknown' ? 'Planet radius unknown — cannot evaluate.' : 'Mock tidal check.', weight: 'supporting' },
  ];
  const critFail = checks.some((c) => c.weight === 'critical' && c.passed === false);
  const anyFail = checks.some((c) => c.passed === false);
  const anyNull = checks.some((c) => c.passed === null);
  const habitability: HabitabilityResult = {
    status: critFail ? 'Uninhabitable' : anyFail ? 'Marginally Habitable' : 'Highly Habitable',
    checks,
    confidence: input.mode === 'hypothetical' || anyNull ? 'low' : 'medium',
    confidenceReasons: [
      'Atmosphere (pressure, greenhouse) is assumed from sliders, not measured.',
      ...(anyNull ? ['Some checks could not be evaluated (missing data).'] : []),
      'MOCK engine — numbers are placeholders.',
    ],
    disclaimer: 'This is a model-defined classification from a simplified physics model. It is not evidence that life exists.',
  };

  const provenance = [
    `Star: ${star.name} (${star.source})`,
    `Planet: ${planet.name} (${planet.source})`,
    ...(input.modifiedFields.length ? [`Modified from real data: ${input.modifiedFields.join(', ')}`] : []),
    'Engine: UI mock (src/ui/mock.ts)',
  ];

  return {
    input,
    star: { luminosity: r(L, 'W', [star.luminosity_Lsun != null ? 'Catalog/preset luminosity.' : 'L = 4πR²σT⁴.']) },
    orbit: {
      period: r(P, 's', ['Kepler’s third law; planet mass neglected.']),
      periapsis: r(a * (1 - e), 'm', ['r = a(1 − e).']),
      apoapsis: r(a * (1 + e), 'm', ['r = a(1 + e).']),
      samples,
    },
    stellarFlux: r(flux, 'W m^-2', ['Blackbody star; F = L/(4πa²).']),
    insolation: r(S, 'S_earth', ['Relative to Earth’s present solar flux.']),
    surfaceGravity: r(g, 'm s^-2', g == null ? ['Mass or radius unknown.'] : ['g = GM/R², spherical planet.']),
    equilibriumTemp: r(Teq, 'K', [`Bond albedo ${atmosphere.albedo} (assumed).`, 'Uniform redistribution.']),
    epsilon: r(eps, '', ['Mock: ε = greenhouse slider.']),
    surfaceTemp: r(Ts, 'K', ['SIMPLIFIED one-layer greenhouse model.', 'No pressure dependence.']),
    waterPhase: r(phase, '', ['Approximate thresholds 273.15 / 373.15 K.', 'Below triple-point pressure liquid is impossible.']),
    tides: {
      stellarAcceleration: r(tideAcc, 'm s^-2', ['Point-mass approximation a ≈ 2GMR/r³.']),
      stellarRelativeToEarth: r(tideRel, '', ['Relative to the Sun’s tide on Earth.']),
      moon: r(null, 'm s^-2', [planet.moon.kind === 'unknown' ? 'Moon status unknown — no exomoon assumed.' : 'No moon.']),
      locking: r(locking, '', ['Qualitative indicator only (DESIGN §17).']),
    },
    habitability,
    assumptions: [...MODEL_ASSUMPTIONS, `Orbit sampled at ${n} points uniform in time.`],
    provenance,
  };
}

export function mockCatalog(): Catalog {
  const mk = (id: string, sname: string, spt: string, teff: number, rs: number, ms: number, pname: string, m: number | null, rp: number | null, aAU: number, ecc: number, per: number, missing: string[]) => ({
    id,
    star: { name: sname, spectralType: spt, teff_K: teff, radius_Rsun: rs, mass_Msun: ms, luminosity_Lsun: null, source: 'nasa-exoplanet-archive', reference: 'fixture', uncertainties: { teff_K: { value: teff, errPlus: 50, errMinus: -50 } } },
    planet: { name: pname, mass_Mearth: m, radius_Rearth: rp, a_AU: aAU, ecc, orbitalPeriod_days: per, moon: { kind: 'unknown' as const }, source: 'nasa-exoplanet-archive' as const, reference: 'fixture', uncertainties: rp != null ? { radius_Rearth: { value: rp, errPlus: 0.03, errMinus: -0.03 } } : {} },
    missing,
  });
  return {
    generatedAt: '2026-09-01T00:00:00Z',
    source: 'dev fixture',
    isFixture: true,
    entries: [
      mk('fixture-b', 'Fixture Star A', 'M5.5 V', 3050, 0.15, 0.12, 'Fixture Planet A b', 1.07, 1.03, 0.049, 0.02, 11.2, []),
      mk('fixture-c', 'Fixture Star B', 'K2 V', 5000, 0.8, 0.85, 'Fixture Planet B c', null, 2.1, 0.8, 0.35, 280, ['pl_masse']),
      mk('fixture-d', 'Fixture Star C', 'G0 V', 5900, 1.1, 1.05, 'Fixture Planet C d', 300, null, 1.6, 0.6, 700, ['pl_rade']),
    ],
  };
}

export async function mockLoadCatalog(): Promise<Catalog> {
  return mockCatalog();
}
