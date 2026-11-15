# Verification — 2026-11-15

> Historical audit before the hybrid implementation. The canonical frontend now uses `/api/science/*`; see [current hybrid behavior and verification](HYBRID_BACKEND.md). Legacy endpoint differences below are intentionally retained as diagnostic evidence.

## Verdict

The static application's tested scientific calculations agree with both the Python engine and an independent numerical implementation. **Frontend/backend interchangeability fails.** The frontend still reads static assets rather than API routes. This report does not certify 100% correctness or physical mission accuracy.

Scope: local `main` checkout including pre-existing uncommitted UI edits. Dataset SHA-256: `0bbc60591c01d55a86dea65640230b95a08f7de2a1a921a280f5691bf6af8584`. No deployment performed.

## Evidence

- [Actual API versus frontend results](verification/api-parity.json): 780 visibility comparisons (130 configurations × six windows), 260 local links and two independent Compare results. Visibility tests compare the real production TypeScript metrics against FastAPI responses; the full window also checks every series value. Windows include the first/last half hour and equivalent UTC−03 timestamps. Eight incompatibilities are recorded, and the command intentionally exits 1.
- [Independent calculation](verification/independent-science.json): 374,660 Sun/Earth samples, 3,120 metric fields, 260 links, 74,075 reconstructed DEM profile samples and 104 height-monotonicity comparisons. Own interpolation, integration, spherical chord, bilinear terrain and ranking calculations; no application engine imports. Run twice by an independent subagent.
- Regression suites: 46 Python tests and 41 JavaScript tests. Extended-date tests cover all 130 configurations through May 1, selected monthly/cross-month windows, and binary data integrity.
- Production TypeScript/Vite build checked separately. Build warns about the large JavaScript chunk; functional tests are not a performance certification.

## Confirmed incompatibilities

| Case | Frontend | API |
|---|---|---|
| November 29–December 5, December, April (both sites) | Supported | HTTP 422 |
| Ridge A optimization, demo constraints | 130 supplied, 17 feasible, r256c256 at 5 m | 25 positions; 45 evaluated after prefilter, 6 feasible, same recommendation |
| Ridge B optimization, demo constraints | 130 supplied, 11 feasible, r160c352 at 10 m | 26 positions; 75 evaluated after prefilter, 9 feasible, r182c329 at 5 m |

The API builds a different candidate grid, so its optimizer is not a drop-in equivalent. The API currently reads only the original November ephemerides. Existing frontend tests that compare engines on an identical candidate grid do not demonstrate endpoint equivalence.

## Fixes made during validation

Missing/malformed ephemeris observations now return 503 instead of crashing or misclassifying corrupt cached data as a user error. Validation checks structure, sample count, increasing timezone-aware timestamps and finite numerical directions.

Nine new regression tests cover this fix and existing deduplication, plus invalid dates/constraints, NaN/Infinity, equivalent timezone offsets, zero-distance search, missing data and genuinely infeasible searches.

## Reproduce

From the repository root (Node 22.18+ and the project's Python environment):

```sh
.venv/bin/python -m unittest discover -s tests -v
SITEFORGE_TEST_PYTHON=.venv/bin/python node --test tests/*.mjs
npm run build --prefix frontend
.venv/bin/python scripts/verify_independent_science.py --output docs/verification/independent-science.json
.venv/bin/python scripts/verify_api_parity.py docs/verification/api-parity.json
```

The final command must remain red while incompatibilities exist. Do not interpret its nonzero exit as a broken test harness or suppress it in CI.

## Unverified and limitations

FastAPI was exercised through in-process ASGI HTTP requests (TestClient), not a listening network server. Browser automation was blocked by an occupied browser profile; starting a local server was denied by the sandbox. Existing running development servers belong to other checkouts and were not used as evidence for this checkout. No visual navigation, live frontend-to-backend integration, deployed service or load test is certified.

The independent verifier uses cached celestial directions and horizon sectors as inputs. It reconstructs local-link terrain from the original local DEM, but does not independently recalculate the full regional horizon or NASA/JPL acquisition. Numerical agreement verifies the stated sampled model, not the correctness of all source data or physical assumptions.

## Two stages and controlled optimizer diagnosis

Stage 1 compares fixed landing points (monthly mode tests heights at each same point). Stage 2 keeps the lander fixed but moves the combined solar/communications station. The optimizer discrepancy above compares Stage 2 with Stage 2; it is not explained by comparing different product stages.

The same 512 × 512 DEM is used, but candidate coordinates differ:

| Path | Candidate row/column indices |
|---|---|
| Static frontend, either lander | {128,192,256,320,384} × {128,192,256,320,384}, plus (160,352) |
| API, Ridge A / 1000 m / grid_size 5 | {56,156,256,356,456} × the same columns |
| API, Ridge B / 1000 m / grid_size 5 | {4,93,182,271,360} × {152,240,329,418,507}, plus (160,352) |

Only the lander's coordinate is common between each API grid and the frontend grid. The frontend reports all input configurations as evaluated; the backend counts only successful evaluations after slope/distance filtering, so those counters must not be compared directly.

[Controlled input experiment](verification/optimizer-inputs.json) recalculates the DEM-based optimizer using (1) API grid/site reference, (2) static grid/site reference and (3) static grid/nearest-site reference. Changing only to the static grid reproduces the frontend's 17 and 11 feasible configurations and its 5 m / 10 m recommendations. Switching the ephemeris reference convention does not change those recommendations in this scenario. This isolates the observed recommendation difference to the search space, not the optimizer's arithmetic.

A further counterexample feeds the API's winning configuration into the actual production TypeScript optimizer as one extra candidate. Its result is recorded under `frontend_counterexample` in the same evidence. Thus an absent candidate can be distinguished from a candidate that the frontend computes incorrectly.

Reproduce:

```sh
.venv/bin/python scripts/diagnose_optimizer_inputs.py docs/verification/optimizer-inputs.json
```

A separate stage-transition caveat: the Compare timeline's “Engineer this site” button selects the site and tab, but does not copy that comparison's date window into Designer. Each has its own observation window. The controlled experiment uses identical November dates throughout, so this does not cause the demonstrated optimizer discrepancy.

Correction to an intermediate finding: duplicate optimizer heights were already deduplicated by the engine. A proposed rejection was removed after reproducing the original behavior. No duplicate-height production fix was retained.
