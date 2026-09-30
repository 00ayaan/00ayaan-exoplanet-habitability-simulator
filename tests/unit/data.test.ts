// Owner: Agent 6. Tests for the archive parser and loader (offline, fixture-based).
import { afterEach, describe, expect, it, vi } from 'vitest';
import fixture from '../../src/data/fixture.json';
import {
  ARCHIVE_COLUMNS, buildAdqlQuery, buildTapUrl, loadCatalog, parseArchiveRows, semiMajorAxisFromPeriod_AU,
} from '../../src/data/catalog';

type Row = Record<string, string | number | null>;
const rows = fixture.rows as Row[];
const GEN = '2026-01-01T00:00:00.000Z';
const byName = (name: string) => rows.find((r) => r.pl_name === name)!;
const one = (r: Row) => {
  const c = parseArchiveRows([r], GEN);
  expect(c.entries).toHaveLength(1);
  return c.entries[0]!;
};
const base: Row = {
  pl_name: 'Test b', hostname: 'Test', pl_orbper: 365.25, pl_orbsmax: 1, pl_orbeccen: 0.0167,
  pl_rade: 1, pl_masse: 1, st_teff: 5772, st_rad: 1, st_mass: 1, st_lum: 0,
  st_spectype: 'G2 V', st_age: 4.6, pl_refname: 'x', st_refname: 'y',
};

describe('parseArchiveRows', () => {
  it('parses every fixture row into the contract shape', () => {
    const c = parseArchiveRows(rows, GEN);
    expect(c.generatedAt).toBe(GEN);
    expect(c.isFixture).toBe(false);
    expect(c.entries).toHaveLength(rows.length);
    for (const e of c.entries) {
      expect(e.id).toMatch(/^[a-z0-9-]+$/);
      expect(e.star.source).toBe('nasa-exoplanet-archive');
      expect(e.planet.source).toBe('nasa-exoplanet-archive');
      expect(e.planet.a_AU).toBeGreaterThan(0);
      expect(e.planet.ecc).toBeGreaterThanOrEqual(0);
      expect(e.planet.rotationPeriod_days).toBeNull();
      expect(e.planet.reference).toContain('DEV FIXTURE');
    }
    expect(c.entries.map((e) => e.id)).toContain('teegarden-s-star-b');
  });

  it('missing mass → null and listed in missing', () => {
    const e = one(byName('Kepler-452 b'));
    expect(e.planet.mass_Mearth).toBeNull();
    expect(e.missing).toContain('pl_masse');
    expect(e.planet.radius_Rearth).toBeCloseTo(1.63, 6);
  });

  it('falls back to pl_bmasse and flags it as M sin i / best mass', () => {
    const e = one(byName('Proxima Cen b'));
    expect(e.planet.mass_Mearth).toBe(1.07);
    expect(e.planet.radius_Rearth).toBeNull();
    expect(e.missing).toEqual(expect.arrayContaining(['pl_masse', 'pl_rade']));
    expect(e.planet.derivedFields!.join(' ')).toMatch(/M sin i/);
  });

  it('keeps radius-less RV planets with mass < 10 M⊕: radius null, pl_rade missing', () => {
    for (const name of ['Proxima Cen b', "Teegarden's Star b"]) {
      const r = byName(name);
      expect(r.pl_rade).toBeNull();
      expect(r.pl_radj).toBeNull();
      expect(Number(r.pl_bmasse)).toBeLessThan(10);
      const e = one(r);
      expect(e.planet.radius_Rearth).toBeNull();
      expect(e.missing).toContain('pl_rade');
      expect(e.planet.mass_Mearth).toBe(r.pl_bmasse);
    }
    expect(parseArchiveRows(rows, GEN).entries.map((e) => e.id)).toEqual(
      expect.arrayContaining(['proxima-cen-b', 'teegarden-s-star-b']),
    );
  });

  it('pl_radj fallback converts Jupiter radii and marks derived', () => {
    const e = one({ ...base, pl_rade: null, pl_radj: 0.1 });
    expect(e.planet.radius_Rearth).toBeCloseTo((0.1 * 7.1492e7) / 6.3781e6, 6);
    expect(e.planet.derivedFields).toContain('radius_Rearth');
    expect(e.missing).toContain('pl_rade');
  });

  it('pl_massj fallback when masse and bmasse absent', () => {
    const e = one({ ...base, pl_masse: null, pl_massj: 0.01 });
    expect(e.planet.mass_Mearth).toBeCloseTo(3.178, 2);
    expect(e.planet.derivedFields).toContain('mass_Mearth');
  });

  it("derives a_AU from period via Kepler's third law (Earth–Sun ≈ 1 AU)", () => {
    expect(semiMajorAxisFromPeriod_AU(365.256363, 1)).toBeCloseTo(1.0, 3);
    const e = one({ ...base, pl_orbsmax: null });
    expect(e.planet.a_AU).toBeCloseTo(1.0, 3);
    expect(e.planet.derivedFields).toContain('a_AU');
    expect(e.missing).toContain('pl_orbsmax');
    expect(e.planet.uncertainties?.a_AU).toBeUndefined();
  });

  it('missing eccentricity → 0, flagged as assumed circular', () => {
    const e = one(byName('Kepler-186 f'));
    expect(e.planet.ecc).toBe(0);
    expect(e.missing).toContain('pl_orbeccen');
    expect(e.planet.derivedFields).toContain('ecc');
  });

  it('st_lum (log10 L☉) → luminosity; absent → null', () => {
    const e = one({ ...base, st_lum: -1, st_lumerr1: 0.1, st_lumerr2: -0.1 });
    expect(e.star.luminosity_Lsun).toBeCloseTo(0.1, 12);
    expect(e.star.uncertainties?.luminosity_Lsun?.errPlus).toBeGreaterThan(0);
    expect(e.star.uncertainties?.luminosity_Lsun?.errMinus).toBeLessThan(0);
    const n = one({ ...base, st_lum: null });
    expect(n.star.luminosity_Lsun).toBeNull();
    expect(n.missing).toContain('st_lum');
  });

  it('preserves uncertainties as Measured', () => {
    const e = one(byName('TRAPPIST-1 e'));
    expect(e.planet.uncertainties?.radius_Rearth).toEqual({ value: 0.92, errPlus: 0.013, errMinus: -0.012 });
    expect(e.planet.uncertainties?.mass_Mearth?.value).toBe(0.692);
  });

  it('strips HTML tags from references', () => {
    const e = one({ ...base, pl_refname: '<a refstr=X href=https://x.org target=ref>Agol et al. 2021</a>', st_refname: '<b>Doe</b> &amp; Roe' });
    expect(e.planet.reference).toBe('Agol et al. 2021');
    expect(e.star.reference).toBe('Doe & Roe');
    for (const f of parseArchiveRows(rows, GEN).entries) expect(f.planet.reference).not.toMatch(/[<>]/);
  });

  it('skips rows missing hard requirements without throwing', () => {
    const bad: Row[] = [
      { ...base, pl_name: 'NoTeff b', st_teff: null },
      { ...base, pl_name: 'NoRad b', st_rad: '' },
      { ...base, pl_name: 'NoOrbit b', pl_orbsmax: null, pl_orbper: null },
      { ...base, pl_name: 'NoSize b', pl_rade: null, pl_masse: null },
      { ...base, pl_name: null },
      { ...base, pl_name: 'Ok b' },
    ];
    const c = parseArchiveRows(bad, GEN);
    expect(c.entries.map((e) => e.planet.name)).toEqual(['Ok b']);
  });

  it('moon is always unknown', () => {
    for (const e of parseArchiveRows(rows, GEN).entries) expect(e.planet.moon).toEqual({ kind: 'unknown' });
  });

  it('accepts numeric strings', () => {
    const e = one({ ...base, st_teff: '5772', pl_rade: '1.5' });
    expect(e.star.teff_K).toBe(5772);
    expect(e.planet.radius_Rearth).toBe(1.5);
  });

  it('is deterministic and stably sorted regardless of input order', () => {
    const a = parseArchiveRows(rows, GEN);
    const b = parseArchiveRows([...rows].reverse(), GEN);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    const names = a.entries.map((e) => e.planet.name);
    expect(names).toEqual([...names].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0)));
  });
});

describe('ADQL query builder', () => {
  it('uses the ps table with default_flag and all required columns', () => {
    const q = buildAdqlQuery();
    expect(q).toMatch(/FROM ps /);
    expect(q).toContain('default_flag = 1');
    expect(q).toContain('(pl_rade < 4 OR (pl_rade IS NULL AND (pl_bmasse < 10 OR pl_masse < 10)))');
    expect(q).not.toMatch(/AND pl_rade < 4 /);
    const required = [
      'pl_name', 'hostname', 'pl_orbper', 'pl_orbpererr1', 'pl_orbpererr2', 'pl_orbsmax', 'pl_orbsmaxerr1',
      'pl_orbsmaxerr2', 'pl_orbeccen', 'pl_orbeccenerr1', 'pl_orbeccenerr2', 'pl_rade', 'pl_radeerr1',
      'pl_radeerr2', 'pl_radj', 'pl_masse', 'pl_masseerr1', 'pl_masseerr2', 'pl_massj', 'pl_bmasse',
      'pl_refname', 'st_spectype', 'st_teff', 'st_tefferr1', 'st_tefferr2', 'st_rad', 'st_raderr1',
      'st_raderr2', 'st_mass', 'st_masserr1', 'st_masserr2', 'st_lum', 'st_lumerr1', 'st_lumerr2',
      'st_age', 'st_met', 'st_refname', 'sy_pnum', 'disc_year',
    ];
    for (const col of required) expect(ARCHIVE_COLUMNS).toContain(col);
    const select = q.slice(0, q.indexOf(' FROM '));
    for (const col of required) expect(select.split(/[ ,]/)).toContain(col);
  });

  it('URL-encodes the query for the TAP sync endpoint with format=json', () => {
    const u = new URL(buildTapUrl());
    expect(u.origin + u.pathname).toBe('https://exoplanetarchive.ipac.caltech.edu/TAP/sync');
    expect(u.searchParams.get('format')).toBe('json');
    expect(u.searchParams.get('query')).toBe(buildAdqlQuery());
  });
});

describe('loadCatalog', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('fetches the relative snapshot path', async () => {
    const snap = parseArchiveRows(rows, GEN);
    const f = vi.fn(async () => new Response(JSON.stringify(snap), { status: 200 }));
    vi.stubGlobal('fetch', f);
    const c = await loadCatalog();
    expect((f.mock.calls[0] as unknown[])[0]).toBe('./data/exoplanets.json');
    expect(c.entries).toHaveLength(rows.length);
    expect(c.isFixture).toBe(false);
  });

  it('in DEV falls back to the flagged fixture when the snapshot is missing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })));
    const c = await loadCatalog();
    expect(c.isFixture).toBe(true);
    expect(c.source).toMatch(/DEV FIXTURE/);
    expect(c.entries.length).toBeGreaterThan(0);
  });

  it('in production returns an empty, non-fixture catalog when the snapshot is missing', async () => {
    vi.stubEnv('DEV', false);
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network'); }));
    const c = await loadCatalog();
    expect(c.isFixture).toBe(false);
    expect(c.entries).toEqual([]);
    expect(c.source).toMatch(/No NASA Exoplanet Archive snapshot/);
  });
});
