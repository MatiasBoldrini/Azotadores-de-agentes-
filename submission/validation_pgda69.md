# SITE//FORGE vs NASA PGDA product 69 (long-term polar illumination maps)

Prepared Sun 2026-11-15 ~11:00 ART. Repo state: `/tmp/azrepo` at `be703b5` (main). The repo was not modified; a separate venv (`.venv-val`, untracked) was used to run the engine.

## TL;DR

Apples-to-apples here means: same 18.6-year window, hourly samples, and the PGDA visibility definition ("any part of the disc above terrain"). Comparison at 0 m (PGDA publishes surface maps only), at 462 points spread over the 2.56 km Connecting Ridge study crop:

| Quantity | n | Mean diff (ours − NASA) | Median | MAE | RMSE | Pearson r | Share within ±5 pp |
|---|---:|---:|---:|---:|---:|---:|---:|
| **Earth visibility** | 462 | **+0.14 pp** | −0.20 pp | 1.83 pp | 5.06 pp | **0.978** | 90% |
| **Sun illumination** | 462 | +1.13 pp | −0.63 pp | 5.28 pp | 9.83 pp | **0.633** | 74% |

- **Earth:** strong agreement.
- **Sun:** unbiased on average but only moderate point-by-point agreement. Large scatter shows up in steep, mostly dark 60 m cells: where PGDA is below 20%, we are +24 pp on average (n=32). Where PGDA is between 40% and 60% (n=299), MAE is 3.2 pp.
- **At our two named sites (0 m, 18.6 y, any-disc):**
  - Ridge A: Sun 42.07% vs 38.54% (**+3.53 pp**), Earth 40.40% vs 33.85% (**+6.55 pp**).
  - Ridge B: Sun 30.76% vs 40.61% (**−9.85 pp**), Earth 57.80% vs 58.00% (**−0.20 pp**).

  So the per-site agreement is mixed. Only Ridge B's Earth value is a tight match.

## Inputs

- **NASA PGDA 69** (Mazarico et al. 2011, Icarus 211:1066; product page https://pgda.gsfc.nasa.gov/products/69). Files, both 5058×5058 int16 in 60 m south polar stereographic projection (R = 1737.4 km, lon0 = 0°, true scale at the pole), with scale 0.00004 (DN 25000 = 1):
  - `AVGVISIB_85S_060M_201608.TIF` (average solar-disc visibility)
  - `AVGVISIB_85S_060M_201608_EARTH.TIF` (average Earth-disc visibility)

  Downloaded from https://pgda.gsfc.nasa.gov/data/MoonIllumination/ (34 MB + 25 MB). PDS labels were also downloaded. Per the labels and the product page, both maps are computed on `LDEM_85S_060M` and averaged over hourly timesteps spanning ~18.6 years. A pixel counts as lit or visible if any fraction of the disc is visible. Surface only: no 2 m or 10 m height products are published in PGDA 69.
- **SITE//FORGE engine** (`siteforge/engine.py`, `sphere-enu-sector-regional-v2`):
  - Terrain: LOLA Site01 5 m DEM crop (PGDA 78) plus regional LOLA 80 m terrain to 150 km (PGDA 90).
  - Horizon: 1° azimuth bins.
  - Visibility: production rule (body center above horizon).
- **Ephemeris:** JPL Horizons, `CENTER=coord@301` at Ridge A (−89.463158°, −137.501985° E, 1.944767 km). Sun (10) and Earth (399), quantity 4, airless, **hourly, 2009-01-01 to 2029-01-01** UTC. Reference frame in the Horizons headers is MEAN_ME, the same as the production fetch. Directions for other points are rotated with the repo's own `reproject_ephemeris`. Translation parallax is neglected: under 0.0005° for Earth at 3 km separation.

## Method

1. **Windows.**
   - **18.6 y:** 2009-07-13 17:00 → 2028-02-18 08:00 UTC, 163,048 hourly samples. This is a full nodal cycle. The PGDA label start time is 2009-07-13, but NASA does not publish the exact calendar span of the 18.6-year run, so the window is matched in length, not necessarily in dates.
   - **6 months:** 2026-11-01 → 2027-05-01, the app's period.
   - **November 2026.**
2. **Visibility definitions.**
   - **center:** production, elevation > horizon.
   - **any-disc:** elevation + angular radius > horizon, matching PGDA. Constant radii are used: Sun 0.2666°, Earth 0.95°. The real radii vary by about ±2% (Sun) and ±7% (Earth), which is not modeled.
3. **Sampling the PGDA rasters.**
   - **Points:** project lat/lon to polar stereographic coordinates (x = ρ sin λ, y = ρ cos λ, ρ = 2R tan((90°+φ)/2)) and take the containing 60 m cell. Bilinear values and the 3×3 range are also recorded.
   - **Ridge A:** x = −10,997.5 m, y = −12,002.5 m, row 2729, col 2345. This matches the repo's own extraction (DN 9636 Sun, 8463 Earth).
   - **Ridge B:** row 2721, col 2353.
   - **Grid:** every 2nd PGDA pixel whose center falls in the 5 m crop. For each one, the nearest 5 m cell (within 14 m of the pixel center) is evaluated: 462 points.
   - **Registration check:** shifting the PGDA grid by ±1–2 pixels lowers r for both Sun and Earth. The zero shift is best, so there is no registration error.
4. **Engine sanity check.** With these hourly samples, November 2026 center visibility at Ridge A is 59.03% Sun / 27.64% Earth. Production (30-minute samples) gives 426/720 h = 59.17% and 199/720 h = 27.64%. So the long run reproduces the app.

## Results

### Named sites: PGDA value (containing cell; bilinear in brackets; 3×3 range)

| Site | PGDA Sun | PGDA Earth |
|---|---|---|
| Ridge A | 38.54% [40.72%] (22.2–54.2%) | 33.85% [37.19%] (18.8–46.6%) |
| Ridge B | 40.61% [35.74%] (29.6–60.7%) | 58.00% [57.99%] (57.6–58.0%) |

The 3×3 ranges show that at Ridge A, PGDA itself changes by about ±16 pp across neighboring 60 m cells. A ridge crest is exactly where sub-pixel terrain matters.

### SITE//FORGE at the named sites, all heights (percent of time)

PGDA has no height products, so the 2/5/10/20 m rows are **not** comparable to NASA. They are shown only to place the 0 m comparison in context.

| Site | h (m) | Sun center 18.6y | Sun any-disc 18.6y | Earth center 18.6y | Earth any-disc 18.6y | Sun center 6 mo | Earth center 6 mo |
|---|---:|---:|---:|---:|---:|---:|---:|
| Ridge A | 0 | 38.69 | 42.07 | 35.55 | 40.40 | 40.84 | 29.60 |
| Ridge A | 2 | 47.56 | 53.41 | 44.28 | 48.85 | 50.55 | 38.14 |
| Ridge A | 5 | 65.44 | 70.28 | 50.66 | 55.21 | 67.89 | 45.70 |
| Ridge A | 10 | 84.41 | 89.24 | 53.25 | 57.86 | 85.87 | 48.50 |
| Ridge A | 20 | 91.23 | 94.89 | 53.34 | 57.94 | 93.05 | 48.55 |
| Ridge B | 0 | 28.03 | 30.76 | 53.18 | 57.80 | 27.99 | 48.34 |
| Ridge B | 2 | 33.06 | 37.35 | 53.19 | 57.80 | 34.19 | 48.34 |
| Ridge B | 5 | 42.58 | 46.82 | 53.20 | 57.81 | 44.15 | 48.34 |
| Ridge B | 10 | 60.96 | 67.04 | 53.20 | 57.82 | 64.39 | 48.34 |
| Ridge B | 20 | 83.29 | 87.65 | 53.23 | 57.84 | 85.82 | 48.37 |

### Differences at 0 m (ours − PGDA, percentage points)

| Site | Sun any-disc 18.6y | Earth any-disc 18.6y | Sun center 18.6y | Earth center 18.6y | Sun center 6 mo | Earth center 6 mo |
|---|---:|---:|---:|---:|---:|---:|
| Ridge A | **+3.53** | **+6.55** | +0.15 | +1.70 | +2.30 | −4.25 |
| Ridge B | **−9.85** | **−0.20** | −12.58 | −4.82 | −12.62 | −9.66 |

Bold marks the matched definition. The Ridge A center-definition Sun value (+0.15 pp) looks impressive, but it uses a different visibility definition from NASA's. **Do not cite it as the match.**

### Grid (462 points, 0 m)

| Window / definition | Body | Mean diff | Median | MAE | RMSE | r | within ±5 pp |
|---|---|---:|---:|---:|---:|---:|---:|
| 18.6 y / any-disc (matched) | Sun | +1.13 | −0.63 | 5.28 | 9.83 | 0.633 | 74% |
| 18.6 y / any-disc (matched) | Earth | +0.14 | −0.20 | 1.83 | 5.06 | 0.978 | 90% |
| 18.6 y / center | Sun | −1.40 | −2.92 | 6.50 | 10.15 | 0.605 | 65% |
| 18.6 y / center | Earth | −3.86 | −4.80 | 4.89 | 6.79 | 0.973 | 75% |
| 6 mo / center (app window) | Sun | −0.15 | −1.89 | 5.86 | 9.91 | 0.621 | 70% |
| 6 mo / center (app window) | Earth | −7.46 | −9.54 | 8.17 | 9.99 | 0.965 | 26% |

**Sun, matched case, binned by PGDA value:**

| PGDA value | n | Mean diff | MAE |
|---|---:|---:|---:|
| < 20% | 32 | +24.4 pp | 25.1 pp |
| 20–40% | 119 | +2.3 pp | 4.6 pp |
| 40–60% | 299 | −1.3 pp | 3.2 pp |
| > 60% | 12 | −11.7 pp | 11.7 pp |

**Earth, binned by PGDA value:**

| PGDA value | n | MAE |
|---|---:|---:|
| < 20% | 132 | 2.2 pp |
| 20–40% | 55 | 5.5 pp |
| 40–60% | 275 | 0.9 pp |

Scatter plot: `/workspace/siteforge/validation_pgda69_scatter.png`.

### Resolution sensitivity (diagnostic)

The 5 m crop was replaced with 60 m block means (12×12 cells), keeping the regional terrain. At 0 m, any-disc, 18.6 y, Sun goes to 79.8% at Ridge A and 72.9% at Ridge B, versus PGDA's 38.5% and 40.6%. A crude 60 m smoothing of our DEM therefore does *not* reproduce PGDA. Near-field metre-scale and sub-60 m terrain dominates ground-level Sun at these crest points, and the result depends strongly on how near-field terrain is represented. This also means the Ridge A agreement is partly sensitive to which DEM is used. The production rule (5 m crop) is what we compared.

## Why Sun agrees less well than Earth (likely reasons, not proven)

1. **Different DEMs and resolution.**
   - PGDA uses the 2016 60 m LDEM. We use the newer 5 m Site01 product near the point.
   - Grazing sunlight at about 89.5°S sits within ±1.6° of the horizon all the time, so tenths of a degree of horizon change move the fraction by tens of pp.
   - Earth sits higher at times (up to about 7° libration), so it is less sensitive.
   - PGDA's own value swings ±16 pp between neighboring cells at Ridge A.
2. **Point vs cell.** Each of our values is one 5 m spot. PGDA represents a 60 m cell. Steep cells (PGDA < 20%) can contain a sunlit micro-crest; this is the largest error bucket.
3. **Horizon discretization.**
   - We use 1° sectors with cell-center maxima. Ridge A ground-level Sun changes 411 → 470.5 h in November across 2° → 0.25° bins (repo `validation_report.md`).
   - We use 80 m regional terrain, block peaks beyond 30 km, and nothing beyond 150 km. PGDA's horizon method differs.
4. **Window dates.** The 18.6 y length is matched, but the exact PGDA calendar span is not published on the product page. The labels say 2009–2013, which looks like LOLA data-acquisition metadata.
5. **Constant disc radii** in the any-disc rule.
6. **Height:** PGDA is surface only, so no NASA reference exists for our mast heights.

## What this does and does not show

- **It shows:** over a full nodal cycle, our geometry pipeline reproduces NASA's long-term Earth-visibility map closely across the study area (r = 0.978, bias +0.1 pp). The Sun map is reproduced without mean bias but with ~10 pp RMSE scatter.
- **It does not show:**
  - that our 6-month or November hour counts are accurate to any stated number;
  - that the mast-height results are validated (NASA has no height maps here);
  - that the per-site Sun values are within a few pp. Ridge B is off by about −10 pp.

## Reproduce

```sh
cd /tmp/azrepo && python3 -m venv .venv-val && .venv-val/bin/pip install -r requirements.txt
python3 /workspace/siteforge/validation_pgda69/fetch.py      # Horizons hourly 2009-2028 at Ridge A
.venv-val/bin/python /workspace/siteforge/validation_pgda69/analyze.py 2   # sites + 462-point grid -> results.json
.venv-val/bin/python /workspace/siteforge/validation_pgda69/coarse.py      # resolution diagnostic
```

Scripts expect the rasters in `/workspace/pgda69/` and the ephemeris in `/workspace/pgda69/eph/`.
