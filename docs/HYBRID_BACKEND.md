# Hybrid scientific backend

The application now tries its FastAPI scientific backend first. On network errors, HTTP errors, a 45-second deadline or invalid/incompatible responses it uses the verified NASA-derived local dataset. The UI flags fallback mode with **Using backup NASA data**. JSON exports record which calculation path provided each result. These are real derived calculations, never invented mock measurements.

## Run the complete application

From the repository root with the existing Python environment:

```sh
npm ci --prefix frontend
npm run build --prefix frontend
.venv/bin/python -m uvicorn siteforge.api:app --host 127.0.0.1 --port 8000
```

Open http://127.0.0.1:8000. FastAPI serves the built frontend, assets and API on the same origin. For development, run that backend and `npm run dev --prefix frontend`; Vite proxies `/api` to port 8000.

A Dockerfile packages both services as one application. It has not been built in the restricted test environment; dependency download/container runtime still needs deployment verification.

```sh
docker build -t siteforge .
docker run --rm -p 8000:8000 siteforge
```

For a frontend on a separate origin, build it with `VITE_API_BASE_URL=https://your-backend.example` and start the backend with `SITEFORGE_ALLOWED_ORIGINS=https://your-frontend.example`. Origins are explicit and comma-separated; credentials are not enabled. Use HTTPS for both. No secret or NASA key is needed.

The existing Vercel configuration serves only static frontend files. It will correctly use fallback until a backend is hosted and its URL is configured. Adding these source files does not deploy a Python service to Vercel.

## Canonical contract

The frontend uses only `POST /api/science/window` and `POST /api/science/optimize`. These calculate from the local and regional DEM and validated raw JPL tables. They share the checked-in snapshot's 26 candidate positions, five heights, nearest ephemeris references and objective. Requests carry the snapshot SHA-256; another dataset version is rejected with 409. Dates span November 1, 2026 through May 1, 2027, on 30-minute boundaries. Both optimization paths have identical candidate-count semantics and top-five ordering.

The older `/api/visibility` and `/api/optimize` interfaces remain development/legacy interfaces with their own local-grid semantics. They are not used by this frontend. Earlier diagnostic reports documenting their differences remain historical evidence, not the current hybrid contract.

Both online and offline modes currently select among the **same 26 evaluated positions**. This release does not enable arbitrary station coordinates; doing so without a matching fallback would change the optimization problem during an outage.

Backend geometry/directions/links are cached in a bounded dataset instance, and mutable geometry is protected by a lock. Large HTTP responses use gzip compression. An initial full November calculation was measured at about 7.6 seconds before HTTP compression; request duration and resource consumption depend on the deployment machine. The optimizer response itself is compact.

## Failure and state behavior

- Initial terrain/snapshot is loaded and SHA-256 checked before use. Monthly direction files have individual integrity checks.
- Window responses must match requested candidates, dates and dataset; arrays, geometry, visibility flags and integrated metrics are validated. Invalid payloads are never labeled backend success.
- Optimizer response identities, feasibility, alternatives and counts are checked against the exact current inputs.
- Cancelling/changing a request prevents its late response from overwriting the current window or recommendation. Cancellation is not treated as a reason to start fallback.
- Fallback only evaluates covered dates and positions. Missing/corrupt fallback data produces an explicit error and does not substitute November or synthetic numbers.
- Monthly fallback downloads have a 15-second deadline. Cancelling a selection stops waiting without letting late data overwrite it; failed/timed-out downloads can be retried.
- Subsequent selections/searches try the backend again, allowing recovery.
- Compare → Designer carries the selected timeline's site and dates. Monthly selected values are backend-first; the historical monthly overview remains explicitly labeled precomputed.
- JSON exports include calculation source, optimizer source and dataset checksum.

## Reproduce validation

```sh
.venv/bin/python -m unittest discover -s tests -v
SITEFORGE_TEST_PYTHON=.venv/bin/python node --test tests/*.mjs
npm run build --prefix frontend
.venv/bin/python scripts/verify_hybrid_roundtrip.py
```

[Roundtrip evidence](verification/hybrid-roundtrip.json) consumes real FastAPI responses with the production TypeScript client, forces backend failure, checks fallback equality and recovery. These are in-process HTTP and client-module tests, not browser automation or proof of a deployed service. The browser profile was unavailable and socket creation was denied in the execution sandbox. End-to-end visual checks, container execution and deployment remain unverified here.

## Final local validation result

[Summary](verification/hybrid-summary.json): 52 Python tests + 92 JavaScript tests passed (144 total), production build passed. [Serving checks](verification/hybrid-serving.json) verified HTML/assets, gzip and exact-origin CORS via TestClient. Browser UI and a deployed network service remain unverified.
