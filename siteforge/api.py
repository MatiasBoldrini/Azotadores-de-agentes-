"""Local, offline-first API. Scientific data are never replaced by test fixtures."""
from __future__ import annotations

import json
import os
from datetime import datetime
from functools import lru_cache
from pathlib import Path
from typing import Any, Literal

import numpy as np
from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from pydantic import BaseModel, ConfigDict, Field, model_validator

ROOT = Path(__file__).resolve().parents[1]
DATA = Path(os.environ.get("SITEFORGE_DATA_DIR", ROOT / "data"))
HEIGHTS = (0, 2, 5, 10, 20)


class RequestModel(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class Point(RequestModel):
    site_id: str = "ridge-a"
    row: int | None = Field(default=None, ge=0)
    col: int | None = Field(default=None, ge=0)
    height_m: Literal[0, 2, 5, 10, 20] = 0

    @model_validator(mode="after")
    def paired_cell(self):
        if (self.row is None) != (self.col is None):
            raise ValueError("row and col must be supplied together")
        return self


class AnalysisRequest(Point):
    start: datetime | None = None
    end: datetime | None = None

    @model_validator(mode="after")
    def valid_window(self):
        if (self.start is None) != (self.end is None):
            raise ValueError("start and end must be supplied together")
        if self.start is not None:
            if self.start.tzinfo is None or self.end.tzinfo is None:
                raise ValueError("Dates must include UTC offset, for example Z")
            if self.end <= self.start:
                raise ValueError("end must be after start")
        return self


class CompareRequest(RequestModel):
    sites: list[AnalysisRequest] = Field(min_length=2, max_length=2)


class LinkRequest(RequestModel):
    lander: Point
    station: Point


class Constraints(RequestModel):
    min_sun_percent: float = Field(default=0, ge=0, le=100)
    min_earth_percent: float = Field(default=0, ge=0, le=100)
    max_sun_outage_hours: float = Field(default=744, ge=0, le=8760)
    max_earth_outage_hours: float = Field(default=744, ge=0, le=8760)
    max_distance_m: float = Field(default=1000, ge=0, le=5000)
    max_slope_deg: float = Field(default=30, ge=0, le=90)
    require_local_link: bool = False


class OptimizeRequest(AnalysisRequest):
    constraints: Constraints = Field(default_factory=Constraints)
    heights: list[Literal[0, 2, 5, 10, 20]] = Field(default_factory=lambda: list(HEIGHTS), min_length=1, max_length=5)
    grid_size: int = Field(default=5, ge=2, le=9)


class SiteResponse(BaseModel):
    id: str
    name: str
    row: int
    col: int
    longitude_deg: float
    latitude_deg: float
    elevation_m: float
    slope_deg: float | None = None


class HealthResponse(BaseModel):
    status: str
    mode: str
    data_available: bool
    algorithm_version: str


class PositionResponse(BaseModel):
    row: int
    col: int
    longitude_deg: float
    latitude_deg: float
    elevation_m: float
    slope_deg: float | None


class IntervalResponse(BaseModel):
    start_utc: str
    end_utc: str
    duration_hours: float


class MetricResponse(BaseModel):
    total_hours: float
    duration_hours: float
    longest_outage_hours: float
    longest_visible_hours: float
    intervals: list[IntervalResponse]
    outages: list[IntervalResponse]
    interval_count: int
    max_step_hours: float


class HorizonResponse(BaseModel):
    azimuth_deg: list[float]
    elevation_deg: list[float]
    height_m: float
    algorithm: str
    coverage: str
    interpolated_bins: int
    angular_bin_width_deg: float
    method: str


class SeriesResponse(BaseModel):
    timestamp_utc: list[str]
    sun_azimuth_deg: list[float]
    earth_azimuth_deg: list[float]
    sun_elevation_deg: list[float]
    earth_elevation_deg: list[float]
    sun_horizon_deg: list[float]
    earth_horizon_deg: list[float]
    sun_visible: list[bool]
    earth_visible: list[bool]
    both_visible: list[bool]


class AnalysisResponse(BaseModel):
    position: PositionResponse
    height_m: float
    horizon: HorizonResponse
    series: SeriesResponse
    metrics: dict[str, MetricResponse]
    algorithm: str
    classification: str
    limitations: list[str]
    provenance: dict[str, Any]


class LinkResponse(BaseModel):
    visible: bool
    distance_m: float
    elevation_difference_m: float
    min_clearance_m: float
    profile: list[dict[str, float]]
    method: str | None = None


def read_json(path: Path):
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError) as error:
        raise HTTPException(503, f"Required scientific data unavailable: {path.name}") from error


@lru_cache(maxsize=1)
def terrain():
    from siteforge.engine import Terrain
    try:
        regional=None
        if (DATA / "regional-terrain.npz").exists():
            with np.load(DATA / "regional-terrain.npz", allow_pickle=False) as source:
                regional={k:source[k].copy() for k in source.files}
        with np.load(DATA / "terrain.npz", allow_pickle=False) as grid:
            return Terrain(grid["elevation_m"], grid["longitude_deg"], grid["latitude_deg"],
                           pixel_size_m=float(grid["pixel_size_m"]), radius_m=float(grid["radius_m"]), regional=regional)
    except (OSError, ValueError, KeyError) as error:
        raise HTTPException(503, "Real LOLA terrain has not been acquired or is invalid") from error


@lru_cache(maxsize=1)
def sites():
    result = read_json(DATA / "sites.json")
    return result["sites"] if isinstance(result, dict) else result


def site(site_id):
    found = next((s for s in sites() if s["id"] == site_id), None)
    if found is None:
        raise HTTPException(404, "Unknown site")
    return found


def point(request: Point):
    selected = site(request.site_id)
    row, col = (selected["row"], selected["col"]) if request.row is None else (request.row, request.col)
    grid = terrain()
    if not (0 <= row < grid.elevation_m.shape[0] and 0 <= col < grid.elevation_m.shape[1]):
        raise HTTPException(422, "Selected point is outside the acquired terrain")
    if not np.isfinite(grid.elevation_m[row, col]):
        raise HTTPException(422, "Selected point has no valid terrain data")
    return row, col


@lru_cache(maxsize=8)
def ephemeris(site_id: str, body: str):
    site(site_id)
    filename = f"{site_id}_{body}.json"
    result = read_json(DATA / "ephemeris" / filename)
    try:
        samples = result["records"]
        if not isinstance(samples, list) or len(samples) < 2:
            raise ValueError("At least two observations are required")
        previous = None
        for sample in samples:
            instant = datetime.fromisoformat(sample["timestamp_utc"])
            if instant.tzinfo is None or (previous is not None and instant <= previous):
                raise ValueError("Observation timestamps must be aware and strictly increasing")
            for key in ("azimuth_deg", "elevation_deg"):
                value = sample[key]
                if isinstance(value, bool) or not isinstance(value, (int, float)) or not np.isfinite(value):
                    raise ValueError("Observation directions must be finite numbers")
            previous = instant
    except (KeyError, TypeError, ValueError) as error:
        raise HTTPException(503, f"Required scientific data invalid: {filename}") from error
    return result


def records(request: AnalysisRequest, body: str):
    cached = ephemeris(request.site_id, body)["records"]
    if request.start is None:
        return cached
    begin, end = request.start, request.end
    first, last = (datetime.fromisoformat(cached[i]["timestamp_utc"]) for i in (0, -1))
    if begin < first or end > last:
        raise HTTPException(422, f"Requested dates are outside the cached interval {first.isoformat()} to {last.isoformat()}")
    selected = [record for record in cached if begin <= datetime.fromisoformat(record["timestamp_utc"]) <= end]
    if len(selected) < 2:
        raise HTTPException(422, "Window must contain at least two cached time samples")
    if datetime.fromisoformat(selected[0]["timestamp_utc"]) != begin or datetime.fromisoformat(selected[-1]["timestamp_utc"]) != end:
        raise HTTPException(422, "Window boundaries must align with the cached 30-minute samples")
    return selected


def local_records(request: AnalysisRequest, body: str, row: int, col: int):
    from siteforge.engine import reproject_ephemeris
    source = site(request.site_id)
    samples = records(request, body)
    if row == source["row"] and col == source["col"]:
        return samples
    grid = terrain()
    return reproject_ephemeris(samples, source["longitude_deg"], source["latitude_deg"],
                               float(grid.longitude_deg[row, col]), float(grid.latitude_deg[row, col]))


def provenance(request: AnalysisRequest, row: int, col: int):
    source = site(request.site_id)
    grid = terrain()
    distance = float(np.linalg.norm(grid.xyz[row, col] - grid.xyz[source["row"], source["col"]]))
    return dict(site_id=request.site_id, terrain="NASA LOLA Connecting Ridge", ephemeris="JPL Horizons cached observer table",
                regional_terrain=read_json(DATA / "regional-metadata.json") if (DATA / "regional-metadata.json").exists() else None,
                ephemeris_sources={body: ephemeris(request.site_id, body).get("source") for body in ("sun", "earth")},
                reference_distance_m=distance,
                positional_approximation="Body direction transformed through body-fixed Cartesian axes into target true ENU. Translational parallax and equipment-height parallax omitted.",
                earth_parallax_bound_deg=float(np.degrees(np.arctan2(distance+request.height_m, 350_000_000))),
                earth_distance_bound_m=350_000_000,
                classification=["NASA-derived calculation", "Geometric-only estimate", "Incomplete coverage"])


def analyze(request: AnalysisRequest):
    row, col = point(request)
    result = terrain().evaluate(row, col, request.height_m, local_records(request, "sun", row, col), local_records(request, "earth", row, col))
    result["provenance"] = provenance(request, row, col)
    return result


app = FastAPI(title="SITE//FORGE", version="0.1.0", description="Reproducible lunar terrain visibility; geometric estimates, not mission certification.")
app.add_middleware(GZipMiddleware, minimum_size=1000, compresslevel=4)
allowed_origins = [origin.strip() for origin in os.environ.get("SITEFORGE_ALLOWED_ORIGINS", "").split(",") if origin.strip()]
if allowed_origins:
    if any(origin == "*" or not origin.startswith(("https://", "http://")) for origin in allowed_origins):
        raise ValueError("SITEFORGE_ALLOWED_ORIGINS must list exact HTTP(S) origins")
    app.add_middleware(CORSMiddleware, allow_origins=allowed_origins, allow_methods=["GET", "POST"],
                       allow_headers=["Content-Type"], allow_credentials=False)


@app.exception_handler(ValueError)
async def invalid_scientific_input(request, error):
    from fastapi.responses import JSONResponse
    return JSONResponse(status_code=422, content={"detail": str(error)})


@app.get("/api/health", response_model=HealthResponse)
def health():
    available = (DATA / "terrain.npz").exists() and (DATA / "sites.json").exists()
    return dict(status="ok", mode="cached scientific" if available else "data unavailable", data_available=available,
                algorithm_version="siteforge-0.1")


@app.get("/api/sites", response_model=list[SiteResponse])
def get_sites():
    return sites()


@app.get("/api/datasets")
def datasets():
    return read_json(DATA / "terrain-metadata.json")


@app.get("/api/terrain")
def get_terrain(site_id: str | None = None, stride: int = Query(4, ge=1, le=32)):
    if site_id is not None:
        site(site_id)
    grid = terrain()
    def values(array):
        view = array[::stride, ::stride]
        return np.where(np.isfinite(view), view, None).tolist()
    return dict(elevation_m=values(grid.elevation_m), longitude_deg=values(grid.longitude_deg),
                latitude_deg=values(grid.latitude_deg), pixel_size_m=grid.pixel_size_m, stride=stride,
                original_shape=list(grid.elevation_m.shape), radius_m=grid.radius_m,
                source="NASA LOLA", vertical_exaggeration=1, coverage=grid.coverage)


@app.get("/api/ephemeris")
def get_ephemeris(site_id: str, start: datetime | None = None, end: datetime | None = None):
    request = AnalysisRequest(site_id=site_id, start=start, end=end)
    return {body: records(request, body) for body in ("sun", "earth")}


@app.post("/api/horizon", response_model=HorizonResponse)
def get_horizon(request: Point):
    row, col = point(request)
    return terrain().horizon(row, col, request.height_m)


@app.post("/api/visibility", response_model=AnalysisResponse)
def visibility(request: AnalysisRequest):
    return analyze(request)


@app.post("/api/compare", response_model=list[AnalysisResponse])
def compare(request: CompareRequest):
    return [analyze(item) for item in request.sites]


@app.post("/api/local-link", response_model=LinkResponse)
def local_link(request: LinkRequest):
    return terrain().local_link(point(request.lander), point(request.station), request.lander.height_m, request.station.height_m)


@app.post("/api/optimize")
def optimization(request: OptimizeRequest):
    from siteforge.engine import optimize
    grid = terrain()
    lander = point(request)
    radius_cells = int(np.ceil(request.constraints.max_distance_m / grid.pixel_size_m))
    rows = np.unique(np.linspace(max(4, lander[0]-radius_cells), min(grid.valid.shape[0]-5, lander[0]+radius_cells), request.grid_size).astype(int))
    cols = np.unique(np.linspace(max(4, lander[1]-radius_cells), min(grid.valid.shape[1]-5, lander[1]+radius_cells), request.grid_size).astype(int))
    candidates = sorted(set([(int(row), int(col)) for row in rows for col in cols if grid.valid[row, col]] + [lander]))
    candidate_ephemeris = {cell: {body: local_records(request, body, *cell) for body in ("sun", "earth")} for cell in candidates}
    sun = records(request, "sun")
    duration = (datetime.fromisoformat(sun[-1]["timestamp_utc"]) - datetime.fromisoformat(sun[0]["timestamp_utc"])).total_seconds()/3600
    constraints = request.constraints.model_dump()
    constraints["min_sun_hours"] = duration * constraints.pop("min_sun_percent") / 100
    constraints["min_earth_hours"] = duration * constraints.pop("min_earth_percent") / 100
    result = optimize(grid, candidates, candidate_ephemeris, lander, constraints, request.heights)
    baseline_request = request.model_dump(include=set(AnalysisRequest.model_fields))
    baseline_request["height_m"] = 0
    baseline = analyze(AnalysisRequest(**baseline_request))
    result["baseline"] = baseline
    result["provenance"] = provenance(request, *lander)
    result["search"] = dict(grid_size=request.grid_size, heights_m=request.heights, coverage="Bounded local DEM grid plus lander position", lander_height_m=2)
    if result["recommended"] is not None:
        best = result["recommended"]
        best_request = AnalysisRequest(**{**baseline_request, "row": best["position"]["row"], "col": best["position"]["col"], "height_m": int(best["height_m"])})
        result["analysis"] = analyze(best_request)
        result["improvement_hours"] = {key: best["metrics"][key]["total_hours"] - baseline["metrics"][key]["total_hours"] for key in ("sun", "earth", "both")}
    return result


@app.get("/api/scenarios")
def scenarios():
    result = []
    for selected in sites():
        cached = ephemeris(selected["id"], "sun")["records"]
        result.append(dict(id=selected["id"], name=selected["name"], site_id=selected["id"],
                           start=cached[0]["timestamp_utc"], end=cached[-1]["timestamp_utc"], heights_m=HEIGHTS))
    return result


@app.get("/api/scenarios/{scenario_id}", response_model=AnalysisResponse)
def scenario(scenario_id: str):
    return analyze(AnalysisRequest(site_id=scenario_id))


@app.get("/api/methodology")
def methodology():
    return dict(title="Scientific Method", mode="Cached scientific mode", heights_m=HEIGHTS,
                sources=[{"name": "NASA LOLA high-resolution south-pole DEM", "url": "https://pgda.gsfc.nasa.gov/products/78"},
                         {"name": "NASA LOLA regional south-pole DEM", "url": "https://pgda.gsfc.nasa.gov/products/90"},
                         {"name": "JPL Horizons", "url": "https://ssd.jpl.nasa.gov/horizons/manual.html"}],
                classifications=["Real NASA data", "NASA-derived calculation", "Engineering assumption", "Geometric-only estimate", "Incomplete coverage"],
                limitations=[terrain().coverage,
                             "Visibility uses body centers and discrete 30-minute samples; shorter events may be missed.",
                             "Solar exposure is not electrical output. Earth visibility is not a radio link budget.",
                             "Allowed station heights are engineering assumptions, not structural feasibility assessments.",
                             "Optimization searches a finite candidate grid; it does not prove a global optimum."],
                provenance=read_json(DATA / "terrain-metadata.json"),
                regional_provenance=read_json(DATA / "regional-metadata.json") if (DATA / "regional-metadata.json").exists() else None)


from siteforge.hybrid import router as science_router
from siteforge.agent import router as agent_router
app.include_router(science_router)
app.include_router(agent_router)


DIST = ROOT / "dist"
if DIST.is_dir():
    app.mount("/", StaticFiles(directory=DIST, html=True), name="frontend")
