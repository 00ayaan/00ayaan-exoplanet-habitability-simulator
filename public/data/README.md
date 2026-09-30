# public/data

`exoplanets.json` is **generated in CI**, not committed. The GitHub Actions deploy
workflow runs `npm run data:fetch` (`scripts/fetch-exoplanets.mjs`), which queries the
NASA Exoplanet Archive TAP service (Planetary Systems table `ps`, `default_flag = 1`,
filter documented in `src/data/parse.js` → `ARCHIVE_FILTER`), converts the rows with the
same parser the app uses, and writes a compact `Catalog` JSON here before `vite build`.

If the archive is unreachable the script exits non-zero without touching an existing
file. With no snapshot at all, the production app shows hypothetical mode only; `npm run dev`
falls back to `src/data/fixture.json` (approximate, hand-entered, flagged `isFixture: true`).

Run locally with `npm run data:fetch` (Node >= 22.18, network access to
exoplanetarchive.ipac.caltech.edu).
