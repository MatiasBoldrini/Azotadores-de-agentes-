# Acceptance gates

Every scientific result must come from the cached NASA observations and the documented calculation. Synthetic fixtures are test-only. Passing software tests is not mission certification.

| Gate | Required evidence |
|---|---|
| Real terrain | Original URL, checksum, GeoTIFF CRS, valid crop, units |
| Reference alignment | LOLA MOON_ME/DE421 and Horizons header; altitude datum |
| Ephemerides | Raw NASA responses, exact request, UTC timestamps, Sun and Earth |
| Scientific experiment | Coordinates, dates, base/elevated metrics, reproducible plot |
| Horizon | Curved lunar geometry, true north azimuth, coverage warning |
| Temporal metrics | Intervals bounded by requested window; no extra endpoint duration |
| Designer | Actual recalculation after position or height change |
| Optimizer | Multiple candidates; hard constraints; honest infeasible state |
| Browser | Real terrain, comparison, designer, optimizer, timeline, methodology |
| Offline | Disconnect upstream service use; repeat using stored real data |
| Distribution | Reproducible install/build/run; public deployment if available |

## Official challenge verification

On 2026-11-14 the search-indexed official challenge description was available at
https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/ .
It asks for comparing landing sites and dates and showing Sun/Earth positions relative to the horizon.
Direct page retrieval returned HTTP 502. The current Resources tab and full submission rules therefore remain unverified.
NASA PGDA product 78 and JPL Horizons documentation were directly accessible.
No claim of event eligibility or official NASA certification is made.

## Completed verification

All local product gates above have evidence in `validation_report.md`, `docs/BROWSER_VALIDATION.md`, and the executed Python/JavaScript suites. The static product was tested with no Python application backend. Terrain positioning is explicitly restricted to 26 precalculated candidate cells; date selection is restricted to November 2026. The finite optimum is not a global or certified optimum.

GitHub is the distribution target for this version. Public deployment is outside the current scope. The official event resource/rule verification and independent matched scientific benchmark remain incomplete. No claim of 100% scientific certainty is made.
