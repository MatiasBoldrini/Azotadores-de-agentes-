# SELENARC

**Lunar Landing Site Navigator**

> **Hybrid backend update:** the application now tries the canonical FastAPI science endpoints and falls back to verified NASA-derived data if unavailable. Run the complete app and review the contract/tests in [Hybrid backend](docs/HYBRID_BACKEND.md). Older static-only descriptions below describe the original deployment; the existing Vercel hosting remains static until a backend URL is configured.

A hybrid lunar terrain explorer built around a reproducible NASA-data experiment, with backend calculations and a verified static fallback. Compare two Connecting Ridge locations and dates, change a combined station's position or height, inspect Sun/Earth visibility, and run a constrained discrete search. No live NASA request or Python server is needed during the demo.

**Live demo:** [siteforge-eight-wine.vercel.app](https://siteforge-eight-wine.vercel.app)

## Run the application

Requirements: Node.js 22.18+ (Node 26 tested), npm, and Python 3 for a local static server.

```sh
npm ci --prefix frontend
npm run build --prefix frontend
python3 -m http.server 4173 --bind 127.0.0.1 --directory dist
```

Open http://127.0.0.1:4173 . For development, `npm run dev --prefix frontend` serves the same cached dataset with live reload. No NASA API keys are needed. Same-origin backend operation requires no configuration; separate hosting uses `VITE_API_BASE_URL` and `SITEFORGE_ALLOWED_ORIGINS` as documented above.

The checked-in `public/data/snapshot.json` contains precomputed November 2026 results for 26 candidate positions × 5 heights. Designer and both Compare timelines open on November. Their date pickers cover 2026-11-01 through 2027-05-01 at UTC midnight. May 1 is the endpoint for April 30. Designer evaluates all 130 configurations for the selected window. The Compare timelines each use a fixed ground-level site and have independent date controls. Clicking terrain snaps to the nearest evaluated point. New dates outside this range or positions outside the grid require regenerating the cache.

## The reproducible discovery

At Ridge A during **2026-11-01 to 2026-12-01 UTC**, calculated Earth-center visibility increases from **199 h at 0 m** to **382 h at 10 m**. Raising the observer to 20 m gives the same 382 h. The distant horizon caps the benefit. Omitting regional terrain produced 480 h at 20 m—98 h of overestimation.

At 5 m, Ridge A has 720 h of solar-center exposure and 359.5 h of Earth-center visibility. With the demo's requirements (70% solar, 40% Earth, resource outages ≤360 h, distance ≤1 km, slope ≤20°, local line of sight required), the static optimizer finds 17 feasible configurations and recommends that 5 m co-located station under the stated cost function. A 240 h outage limit has no feasible configuration in the evaluated space.

These are sampled geometric estimates, **not mission certification**. DEM uncertainty, angular resolution, body-center approximation and finite coverage materially limit precision. The 30-minute timestep is not a claim of 30-minute accuracy.

See [scientific report](validation_report.md), [regional method](docs/REGIONAL_HORIZON.md), [IM-2 coverage check](docs/IM2_COVERAGE.md), and [browser verification](docs/BROWSER_VALIDATION.md).

## Prior work

SELENARC uses published mast-height illumination research as the basis for an interactive mission-month mast trade study. The geometric line-of-sight model uses the 5 m Site01 DEM and an 80 m regional DEM extending the horizon to 150 km. Monthly Compare reports the longest gap with either the Sun or Earth blocked and the lowest tested mast height that meets the limits at each fixed ridge point. The Infrastructure Designer ranks feasible configurations by a cost that combines mast height, installation distance, and terrain slope.

### Foundational science

- Mazarico, E., Neumann, G.A., Smith, D.E., Zuber, M.T., Torrence, M.H. (2011). Illumination conditions of the lunar polar regions using LOLA topography. *Icarus* 211(2), 1066–1081. [doi:10.1016/j.icarus.2010.10.030](https://doi.org/10.1016/j.icarus.2010.10.030). The polar illumination modeling behind the [PGDA product 69](https://pgda.gsfc.nasa.gov/products/69) maps.
- Gläser, P., Scholten, F., De Rosa, D., Marco Figuera, R., Oberst, J., Mazarico, E., Neumann, G.A., Robinson, M.S. (2014). Illumination conditions at the lunar south pole using high resolution Digital Terrain Models from LOLA. *Icarus* 243, 78–90. [doi:10.1016/j.icarus.2014.08.013](https://doi.org/10.1016/j.icarus.2014.08.013).
- Barker, M.K., Mazarico, E., Neumann, G.A., Smith, D.E., Zuber, M.T., Head, J.W. (2021). Improved LOLA elevation maps for south pole landing sites: Error estimates and their impact on illumination conditions. *Planetary and Space Science* 203, 105119. [doi:10.1016/j.pss.2020.105119](https://doi.org/10.1016/j.pss.2020.105119). The citation for NASA GSFC [PGDA product 78](https://pgda.gsfc.nasa.gov/products/78), whose 5 m Site01 (Connecting Ridge) DEM is our local terrain.
- Barker, M.K., Mazarico, E., Neumann, G.A., Smith, D.E., Zuber, M.T., Head, J.W., Sun, X. (2023). A New View of the Lunar South Pole from the Lunar Orbiter Laser Altimeter (LOLA). *The Planetary Science Journal* 4, 183. [doi:10.3847/PSJ/acf3e1](https://doi.org/10.3847/PSJ/acf3e1). The citation for [PGDA product 90](https://pgda.gsfc.nasa.gov/products/90), whose 80 m DEM supplies our regional horizon.

### Related tool for the same challenge

[Lunar Landing Site Navigator](https://esatakkasoglu.github.io/lunar-landing-site-navigator/) ([source](https://github.com/EsatAkkasoglu/lunar-landing-site-navigator)) is a public NASA Space Apps 2026 project for the same challenge. It is a click-anywhere south-pole explorer: users add points on the map, compare sites for Sun and Earth visibility with a 0–20 m mast, and scan landing dates across multiple months. Its terrain horizon uses LOLA topography at about 240 m resolution, and it compares its long-term Sun and Earth averages with the PGDA product 69 maps. It covers far more of the south-polar region than SELENARC. We cover a single 2.56 km Site01 crop, in exchange for 5 m local terrain and the mast trade described above.

### PGDA product 69: context, not paired validation

[PGDA product 69](https://pgda.gsfc.nasa.gov/products/69) publishes long-term average Sun and Earth visibility maps for the lunar poles. At Ridge A, at ground level (0 m):

| Body | PGDA 69 long-term average | SELENARC, November 2026 window |
|---|---:|---:|
| Sun | 38.544% | 59.167% (426 of 720 h) |
| Earth | 33.852% | 27.639% (199 of 720 h) |

These figures are not a paired validation. The two sources use different periods, models and definitions. PGDA 69 averages hourly samples over a lunar cycle of about 18.6 years on a 60 m surface map, and counts a step if any part of the disk is above the terrain. The SELENARC results in this table cover 2026-11-01 00:00 to 2026-12-01 00:00 UTC in 30-minute steps on the 5 m Site01 DEM with the regional horizon, and counts a step only if the body center is above the horizon. The differences cannot establish November accuracy or isolate a model bias. The [scientific report](validation_report.md#ridge-a-surface-comparison-with-long-term-nasa-maps) documents the raster extraction.

## Demo walkthrough

1. Open Ridge A, November 1 through December 1, 0 m. Observe 426 h solar / 199 h Earth and the outages.
2. Set 5 m, then 10 m, then 20 m. Watch the horizon and availability respond; Earth visibility plateaus at 10 m.
3. Click another terrain candidate or select it from the accessible position list. The local-link status and metrics change.
4. Run **Find optimal configuration**. Inspect the recommended station, alternatives, objective and hard constraints.
5. Expand **Search constraints** and change maximum resource outage to 240 h. Search again: no feasible configuration is fabricated.
6. Use **Compare** to select independent windows for Ridge A/B. Hover curves or use the main timeline slider to inspect samples.
7. Open **Science & Sources**, or **Export analysis** to download the complete selected result, baseline, link profile and provenance as JSON.

### What the terrain represents

The scene shows a 2.56 × 2.56 km crop of Connecting Ridge, about 16 km from the lunar south pole. Ridge A is at 89.46316° S, 137.50198° W, and Ridge B is at 89.48552° S, 137.61082° W. NASA's [LOLA Site01 elevation model](https://pgda.gsfc.nasa.gov/products/78) has 5 m pixel spacing and interpolates between laser tracks.

The main close-up mesh is that 5 m Site01 DEM itself: every 5 m sample of the evaluated window, set inside the rest of the same 16 km Site01 DEM drawn at 10 and 20 m. The 20 m mesh in the static dataset is only the wireframe overlay and the fallback while the 5 m tile loads or if it is unavailable: its 16,384 vertices match the source crop sampled every fourth pixel in each direction. The scene exaggerates the relief 4× and enlarges station markers for legibility. The scientific calculations use the original elevations and include [regional terrain for the horizon](docs/REGIONAL_HORIZON.md). The local link uses a 2 m lander reference and the availability baseline is at ground level.

The 3D scene currently hides the gray horizon mask. With the mask enabled, it shows the complete horizon from the selected station and mast height, including nearby and regional terrain. The mask and celestial markers use the same projection to keep visibility crossings aligned as the camera moves. The mask is closed underneath and visible from above.

With the mask enabled, a small red mark appears when distant terrain controls both contributing sectors and the selected body is blocked. Activate the mark to see the distance from the station to the original NASA source sample, and press Escape to close it. Terrain, curvature, mast and sightlines share the same 4× vertical transform.

Regenerate the distant ridge samples after changing the scientific snapshot or regional data with `.venv/bin/python scripts/export_distant_horizon.py`. The checked-in file covers all 130 position and height combinations. Verify the source samples, shell geometry and visibility crossings with `node --test tests/test_distant_horizon.mjs tests/test_station_horizon.mjs`.

## Architecture

- **Scientific pipeline:** Python / NumPy / Rasterio / PyProj. Curved lunar ECEF geometry, true ENU horizons, 30-minute temporal integration, bilinear terrain link clearance and constrained optimization.
- **Sources:** NASA LOLA local Site01 at 5 m; regional LOLA 80 m product with retained peaks beyond 30 km, coverage to 150 km; raw JPL Horizons Sun/Earth observer responses for two verified coordinates.
- **Static export:** `scripts/export_static.py` validates the result schemas, writes 130 configurations and their links, and records a SHA-256 checksum.
- **Product:** React, strict TypeScript, Vite, React Three Fiber / Three.js, locally packaged fonts, SVG scientific plots. Time-window integration and deterministic ranking mirror the Python engine and are tested for parity.
- **Scientific API:** FastAPI `/api/science/*` is the primary calculation path, using the same candidates and dates as the frontend fallback. Legacy `/api/*` endpoints remain separate development interfaces.

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

Backend for the hybrid application (also serves the built frontend):

```sh
.venv/bin/python -m uvicorn siteforge.api:app --host 127.0.0.1 --port 8000
```

Its OpenAPI interface is at `/docs`. The frontend uses `/api/science/window` and `/api/science/optimize`; older endpoints cover development-only terrain, sites, ephemerides, horizons, visibility, comparison, links and scenarios. Missing required data returns an explicit error, never substitute measurements. `SITEFORGE_DATA_DIR` optionally selects a different complete scientific dataset directory.

## Verification

```sh
.venv/bin/python -m unittest discover -s tests -v
SITEFORGE_TEST_PYTHON=.venv/bin/python node --test tests/test_frontend_brand.mjs tests/test_frontend_science.mjs tests/test_frontend_story.mjs tests/test_observation_ephemeris.mjs tests/test_mast_panorama.mjs tests/test_sky_dome.mjs
npm run build --prefix frontend
```

Unit fixtures are explicitly synthetic and isolated from production data. Real-data tests check raw response parsing, coordinates, regional provenance, altitude monotonicity, and cached metrics. JavaScript tests compare time integration and search against Python. Browser checks cover the actual Brave application, responsive layouts, the feasible and infeasible search flows, date changes and scene controls.

## Vercel deployment

Connect this GitHub repository in the Vercel project's Git settings. Keep the repository root as the Root Directory and set `main` as the branch tracked by the Production environment.

1. In Vercel, open **Settings → Git → Deploy Hooks** and create a hook for `main`.
2. In GitHub, open **Settings → Secrets and variables → Actions** and save the hook URL as the repository secret `VERCEL_DEPLOY_HOOK_URL`. Keep the URL out of the repository, since anyone with the URL can request a deployment.
3. After this configuration reaches `main`, each push to `main`, including pull request merges, runs the **Request Vercel production deploy** workflow. Vercel's Git integration stays connected with its automatic deploys disabled in `vercel.json`. Check the Vercel Deployments page for the build result after GitHub Actions reports that Vercel accepted the request.

Vercel installs dependencies from `frontend/package-lock.json` with `npm ci --prefix frontend`, runs the frontend build, and serves the `dist` directory. The static data cache ships with the application, so the build requires no secrets, server functions, or Python runtime.

## Limits and follow-up

- Terrain outside 150 km is omitted. Fine relief below the regional sampling resolution can be missed.
- The sector cell-center horizon is not a converged full-area ray tracer. The report quantifies observed angular sensitivity; no absolute scientific validation claim is made.
- Body centers, no solar disk fractions or eclipses. Exposure is not generated electrical power. Earth visibility and local line of sight are not an operational radio link.
- Only the 26 cached station cells and five heights are selectable. The optimum is finite-grid, not global.
- IM-2's actual landing location is outside the local Site01 product. This demo is Connecting Ridge and does not label it IM-2.
- The official challenge summary was verified; its Resources tab and current submission rules could not be directly retrieved (HTTP 502). Event eligibility remains for team review.

Next scientific work: converged ray tracing with DEM cell footprints, uncertainty propagation, broader terrain, solar disk/eclipses, richer temporal coverage and physical energy/radio models.

Implemented with assistance from OpenAI Codex. Independent prototype; NASA data use does not imply NASA endorsement. Original NASA product citations and processing limitations are retained in the reports and application.
