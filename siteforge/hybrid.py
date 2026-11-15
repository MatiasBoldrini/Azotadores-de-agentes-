"""Canonical online science over the same finite search space as the static app.

The snapshot defines candidate identities, never the calculated metrics. Horizons,
visibility, integration and local links are calculated from the real DEM and raw
JPL observer responses. A single dataset instance bounds cached geometry and
reprojected directions; a lock protects Terrain's mutable geometry cache.
"""
from __future__ import annotations

import gzip
import hashlib
import json
import os
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from pathlib import Path
from threading import RLock

import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field, model_validator

from siteforge import engine

ROOT = Path(__file__).resolve().parents[1]
SNAPSHOT = ROOT / "public" / "data" / "snapshot.json"
START = datetime(2026, 11, 1, tzinfo=timezone.utc)
SPLICE = datetime(2026, 12, 1, tzinfo=timezone.utc)
END = datetime(2027, 5, 1, tzinfo=timezone.utc)
STEP = timedelta(minutes=30)
router = APIRouter(prefix="/api/science", tags=["Canonical science"])


class WindowRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    start: datetime
    end: datetime
    snapshot_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    candidate_ids: list[str] | None = Field(default=None, min_length=1, max_length=26)

    @model_validator(mode="after")
    def supported_window(self):
        if self.start.tzinfo is None or self.end.tzinfo is None:
            raise ValueError("Dates must include a UTC offset")
        self.start = self.start.astimezone(timezone.utc)
        self.end = self.end.astimezone(timezone.utc)
        if not START <= self.start < self.end <= END:
            raise ValueError("Window must be within 2026-11-01 through 2027-05-01")
        if (self.start - START) % STEP or (self.end - START) % STEP:
            raise ValueError("Window boundaries must align with 30-minute observations")
        if self.candidate_ids is not None and len(set(self.candidate_ids)) != len(self.candidate_ids):
            raise ValueError("Candidate identifiers must be unique")
        return self


class SearchConstraints(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    minSun: float = Field(ge=0, le=100)
    minEarth: float = Field(ge=0, le=100)
    maxOutage: float = Field(ge=0, le=8760)
    maxDistance: float = Field(ge=0, le=5000)
    maxSlope: float = Field(ge=0, le=90)
    requireLink: bool


class OptimizeRequest(WindowRequest):
    site_id: str
    constraints: SearchConstraints

    @model_validator(mode="after")
    def complete_search(self):
        if self.candidate_ids is not None:
            raise ValueError("Optimization always evaluates the complete canonical candidate set")
        return self


class ScientificDataset:
    def __init__(self, data_path: str, snapshot_path: str):
        self.data = Path(data_path)
        encoded = Path(snapshot_path).read_bytes()
        self.digest = hashlib.sha256(encoded).hexdigest()
        snapshot = json.loads(encoded)
        if snapshot["schema_version"] != 1 or snapshot["heights_m"] != [0, 2, 5, 10, 20]:
            raise ValueError("Unsupported canonical snapshot schema")
        self.heights = tuple(snapshot["heights_m"])
        self.candidates = snapshot["candidates"]
        self.sites = {site["id"]: site for site in snapshot["sites"]}
        if len(self.candidates) != 26 or len({c["id"] for c in self.candidates}) != 26:
            raise ValueError("Canonical snapshot must contain 26 unique candidates")
        with np.load(self.data / "regional-terrain.npz", allow_pickle=False) as source:
            regional = {key: source[key].copy() for key in source.files}
        with np.load(self.data / "terrain.npz", allow_pickle=False) as source:
            self.grid = engine.Terrain(source["elevation_m"], source["longitude_deg"], source["latitude_deg"],
                                       float(source["pixel_size_m"]), float(source["radius_m"]), regional)
        for point in [*self.candidates, *self.sites.values()]:
            actual = self.grid.point(point["row"], point["col"])
            if any(abs(actual[key] - point[key]) > 1e-9 for key in ("longitude_deg", "latitude_deg", "elevation_m")):
                raise ValueError("Canonical snapshot and DEM coordinates differ")
        self.lock = RLock()
        self.tables = {}  # At most two sites × two bodies.
        self.directions = {}  # At most 26 candidates × two bodies.
        self.links = {}  # At most two landers × 130 configurations.

    def table(self, site_id, body):
        key = site_id, body
        if key not in self.tables:
            # This validator reparses raw JPL output and checks observer coordinates,
            # cadence, body, lunar reference frame and exact expected coverage.
            from scripts.export_monthly_site_scan import validate_table
            site = self.sites[site_id]
            original = json.loads((self.data / "ephemeris" / f"{site_id}_{body}.json").read_bytes())
            first = validate_table(original, site, body, START.date(), SPLICE.date())
            if first != original["records"]:
                raise ValueError("Raw November observations differ from their cache")
            extended = json.loads(gzip.decompress((self.data / "ephemeris" / "monthly" / f"{site_id}_{body}.json.gz").read_bytes()))
            remaining = validate_table(extended, site, body, SPLICE.date(), END.date())
            if first[-1] != remaining[0]:
                raise ValueError("Raw observation splice is discontinuous")
            self.tables[key] = first + remaining[1:]
        return self.tables[key]

    def records(self, candidate, body, first, last):
        key = candidate["id"], body
        if key not in self.directions:
            site = self.sites[candidate["reference_site_id"]]
            records = self.table(site["id"], body)
            if (candidate["row"], candidate["col"]) != (site["row"], site["col"]):
                records = engine.reproject_ephemeris(records, site["longitude_deg"], site["latitude_deg"],
                                                    candidate["longitude_deg"], candidate["latitude_deg"])
            self.directions[key] = records
        return self.directions[key][first:last + 1]

    def calculate(self, request):
        first, last = (request.start - START) // STEP, (request.end - START) // STEP
        chosen = None if request.candidate_ids is None else set(request.candidate_ids)
        if chosen is not None and not chosen <= {c["id"] for c in self.candidates}:
            raise HTTPException(422, "Unknown canonical candidate identifier")
        result = []
        for candidate in self.candidates:
            if chosen is not None and candidate["id"] not in chosen:
                continue
            sun = self.records(candidate, "sun", first, last)
            earth = self.records(candidate, "earth", first, last)
            for height in self.heights:
                analysis = self.grid.evaluate(candidate["row"], candidate["col"], height, sun, earth)
                analysis["candidate_id"] = candidate["id"]
                analysis["provenance"] = {"mode": "backend-calculated", "reference_site_id": candidate["reference_site_id"],
                                          "snapshot_sha256": self.digest, "ephemeris": "Validated raw NASA/JPL observer responses",
                                          "terrain": "NASA LOLA local and regional DEM"}
                result.append(analysis)
        return result

    def link(self, site_id, analysis):
        key = site_id, analysis["candidate_id"], analysis["height_m"]
        if key not in self.links:
            lander = self.sites[site_id]
            station = analysis["position"]
            self.links[key] = self.grid.local_link((lander["row"], lander["col"]),
                                                   (station["row"], station["col"]), 2, analysis["height_m"])
        return self.links[key]


@lru_cache(maxsize=1)
def load_dataset(data_path: str, snapshot_path: str):
    return ScientificDataset(data_path, snapshot_path)


def dataset_for(request):
    from siteforge import api
    try:
        dataset = load_dataset(str(api.DATA.resolve()), str(Path(os.environ.get("SITEFORGE_SNAPSHOT_PATH", SNAPSHOT)).resolve()))
    except (OSError, ValueError, KeyError, TypeError, IndexError) as error:
        raise HTTPException(503, "Canonical scientific dataset unavailable or invalid") from error
    if request.snapshot_sha256 != dataset.digest:
        raise HTTPException(409, "Snapshot version mismatch; use the matching static dataset")
    return dataset


def metadata(request, dataset):
    return dict(schema_version=1, snapshot_sha256=dataset.digest,
                start=request.start.isoformat(), end=request.end.isoformat())


@router.post("/window")
def window(request: WindowRequest):
    dataset = dataset_for(request)
    try:
        with dataset.lock:
            analyses = dataset.calculate(request)
    except (OSError, ValueError, KeyError, TypeError, IndexError) as error:
        raise HTTPException(503, "Required canonical science source unavailable or invalid") from error
    return {**metadata(request, dataset), "analyses": analyses}


@router.post("/optimize")
def optimize(request: OptimizeRequest):
    dataset = dataset_for(request)
    if request.site_id not in dataset.sites:
        raise HTTPException(422, "Unknown canonical site identifier")
    try:
        with dataset.lock:
            analyses = dataset.calculate(request)
            c = request.constraints
            feasible = []
            for analysis in analyses:
                link = dataset.link(request.site_id, analysis)
                sun, earth = analysis["metrics"]["sun"], analysis["metrics"]["earth"]
                slope = analysis["position"]["slope_deg"]
                if (sun["total_hours"] < sun["duration_hours"] * c.minSun / 100 or
                    earth["total_hours"] < earth["duration_hours"] * c.minEarth / 100 or
                    max(sun["longest_outage_hours"], earth["longest_outage_hours"]) > c.maxOutage or
                    link["distance_m"] > c.maxDistance or slope is None or slope > c.maxSlope or
                    (c.requireLink and not link["visible"])):
                    continue
                score = analysis["height_m"] / 20 + link["distance_m"] / 1000 + slope / 90
                feasible.append((score, analysis["height_m"], analysis["position"]["row"], analysis["position"]["col"],
                                 f"{analysis['candidate_id']}-{analysis['height_m']:g}"))
            feasible.sort()
    except (OSError, ValueError, KeyError, TypeError, IndexError) as error:
        raise HTTPException(503, "Required canonical science source unavailable or invalid") from error
    keys = [item[-1] for item in feasible[:5]]
    return {**metadata(request, dataset), "site_id": request.site_id, "evaluated": len(analyses),
            "feasible": len(feasible), "recommended": keys[0] if keys else None, "alternatives": keys}
