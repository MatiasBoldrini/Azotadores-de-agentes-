# SITE//FORGE

**Don't find the perfect landing site. Engineer one!**

A working, fully static lunar terrain explorer built around a reproducible NASA-data experiment. Compare two Connecting Ridge locations and dates, change a combined station's position or height, inspect Sun/Earth visibility, and run a constrained discrete search. No live NASA request or Python server is needed during the demo.

## Run the application

Requirements: Node.js 22.18+ (Node 26 tested), npm, and Python 3 for a local static server.

```sh
npm ci --prefix frontend
npm run build --prefix frontend
python3 -m http.server 4173 --bind 127.0.0.1 --directory dist
```

Open http://127.0.0.1:4173 . For development, `npm run dev --prefix frontend` serves the same cached dataset with live reload. The app has no environment variables or API keys.

The checked-in `public/data/snapshot.json` contains real precalculated results for 26 candidate positions × 5 heights. The browser derives interval metrics and performs a real finite search over these results. New positions outside that grid or dates outside November 2026 require regenerating the cache. Clicking terrain snaps to the nearest evaluated point and states that behavior.

## The reproducible discovery

At Ridge A during **2026-11-01 to 2026-12-01 UTC**, calculated Earth-center visibility increases from **199 h at 0 m** to **382 h at 10 m**. Raising the observer to 20 m gives the same 382 h. The distant horizon caps the benefit. Omitting regional terrain produced 480 h at 20 m—98 h of overestimation.

At 5 m, Ridge A has 720 h of solar-center exposure and 359.5 h of Earth-center visibility. With the demo's requirements (70% solar, 40% Earth, resource outages ≤360 h, distance ≤1 km, slope ≤20°, local line of sight required), the static optimizer finds 17 feasible configurations and recommends that 5 m co-located station under the stated cost function. A 240 h outage limit has no feasible configuration in the evaluated space.

These are sampled geometric estimates, **not mission certification**. DEM uncertainty, angular resolution, body-center approximation and finite coverage materially limit precision. The 30-minute timestep is not a claim of 30-minute accuracy.

See [scientific report](validation_report.md), [regional method](docs/REGIONAL_HORIZON.md), [IM-2 coverage check](docs/IM2_COVERAGE.md), and [browser verification](docs/BROWSER_VALIDATION.md).

## Demo walkthrough

1. Open Ridge A, November 1 through December 1, 0 m. Observe 426 h solar / 199 h Earth and the outages.
2. Set 5 m, then 10 m, then 20 m. Watch the horizon and availability respond; Earth visibility plateaus at 10 m.
3. Click another terrain candidate or select it from the accessible position list. The local-link status and metrics change.
4. Run **Find optimal configuration**. Inspect the recommended station, alternatives, objective and hard constraints.
5. Expand **Search constraints** and change maximum resource outage to 240 h. Search again: no feasible configuration is fabricated.
6. Use **Compare** to select independent windows for Ridge A/B. Hover curves or use the main timeline slider to inspect samples.
7. Open **Science & Sources**, or **Export analysis** to download the complete selected result, baseline, link profile and provenance as JSON.

The scene shows a 2.56 × 2.56 km crop of Connecting Ridge, about 16 km from the lunar south pole. Ridge A is at 89.46316° S, 137.50198° W, and Ridge B is at 89.48552° S, 137.61082° W. NASA's [LOLA Site01 elevation model](https://pgda.gsfc.nasa.gov/products/78) has 5 m pixel spacing and interpolates between laser tracks.

All 16,384 terrain vertices in the static dataset match the source crop sampled every fourth pixel in each direction, giving a 20 m display mesh. The scene exaggerates the relief 4× and enlarges station markers for legibility. The scientific calculations use the original elevations and include [regional terrain for the horizon](docs/REGIONAL_HORIZON.md). The local link uses a 2 m lander reference and the availability baseline is at ground level.

## Architecture

- **Scientific pipeline:** Python / NumPy / Rasterio / PyProj. Curved lunar ECEF geometry, true ENU horizons, 30-minute temporal integration, bilinear terrain link clearance and constrained optimization.
- **Sources:** NASA LOLA local Site01 at 5 m; regional LOLA 80 m product with retained peaks beyond 30 km, coverage to 150 km; raw JPL Horizons Sun/Earth observer responses for two verified coordinates.
- **Static export:** `scripts/export_static.py` validates the result schemas, writes 130 configurations and their links, and records a SHA-256 checksum.
- **Product:** React, strict TypeScript, Vite, React Three Fiber / Three.js, locally packaged fonts, SVG scientific plots. Time-window integration and deterministic ranking mirror the Python engine and are tested for parity.
- **Optional API:** FastAPI exposes the scientific engine for development. The delivered frontend does not depend on it.

Vite replaces the initially suggested Next.js because the revised requirement is a completely static Vercel deployment. It avoids unnecessary server behavior while preserving React/TypeScript and the independent Python scientific engine. Plain CSS supplies the custom visual system; no UI template or NASA logo is used.

## Reproduce the science

Python 3.12+ recommended; Python 3.14.7 was tested on this machine.

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
# The derived NPZ terrain files and raw Horizons responses are already included.
.venv/bin/python scripts/validate_real_data.py
.venv/bin/python scripts/export_static.py
```

To acquire fresh source data (requires internet):

```sh
.venv/bin/python scripts/download_lola.py
.venv/bin/python scripts/prepare_data.py
.venv/bin/python scripts/acquire_ephemeris.py
.venv/bin/python scripts/acquire_regional.py
.venv/bin/python scripts/validate_real_data.py
.venv/bin/python scripts/export_static.py
npm run build --prefix frontend
```

The original local TIFF (~41 MB) is excluded from Git and reproducibly downloadable. Regional acquisition reads only a bounded window of the NASA cloud-optimized GeoTIFF. Cached raw responses retain exact query parameters and original result text. Provenance includes reference frame, radii, timestamps, source URLs and checksums.

Optional API:

```sh
.venv/bin/python -m uvicorn siteforge.api:app --host 127.0.0.1 --port 8000
```

Its OpenAPI interface is at `/docs`; endpoints cover terrain, sites, ephemerides, horizons, visibility, comparison, local links, optimization, scenarios and methodology. Missing required data returns an explicit error, never substitute measurements. `SITEFORGE_DATA_DIR` optionally selects a different complete scientific dataset directory.

## Verification

```sh
.venv/bin/python -m unittest discover -s tests -v
SITEFORGE_TEST_PYTHON=.venv/bin/python node --test tests/test_frontend_science.mjs
npm run build --prefix frontend
```

Unit fixtures are explicitly synthetic and isolated from production data. Real-data tests check raw response parsing, coordinates, regional provenance, altitude monotonicity, and cached metrics. JavaScript tests compare time integration and search against Python. Browser checks cover the actual Brave application, responsive layouts, the feasible and infeasible search flows, date changes and scene controls.

## Vercel deployment

Connect this GitHub repository in the Vercel project's Git settings. Keep the repository root as the Root Directory and set `main` as the branch tracked by the Production environment. Once the repository is connected and this configuration is on `main`, direct pushes and pull request merges into `main` trigger production deployments. `vercel.json` enables automatic deployments only for `main`.

Vercel installs dependencies from `frontend/package-lock.json` with `npm ci --prefix frontend`, runs the frontend build, and serves the `dist` directory. The static data cache ships with the application, so the deployment requires no secrets, server functions, or Python runtime.

## Limits and follow-up

- Terrain outside 150 km is omitted. Fine relief below the regional sampling resolution can be missed.
- The sector cell-center horizon is not a converged full-area ray tracer. The report quantifies observed angular sensitivity; no absolute scientific validation claim is made.
- Body centers, no solar disk fractions or eclipses. Exposure is not generated electrical power. Earth visibility and local line of sight are not an operational radio link.
- Only the 26 cached station cells and five heights are selectable. The optimum is finite-grid, not global.
- IM-2's actual landing location is outside the local Site01 product. This demo is Connecting Ridge and does not label it IM-2.
- The official challenge summary was verified; its Resources tab and current submission rules could not be directly retrieved (HTTP 502). Event eligibility remains for team review.

Next scientific work: converged ray tracing with DEM cell footprints, uncertainty propagation, broader terrain, solar disk/eclipses, richer temporal coverage and physical energy/radio models.

Implemented with assistance from OpenAI Codex. Independent prototype; NASA data use does not imply NASA endorsement. Original NASA product citations and processing limitations are retained in the reports and application.
