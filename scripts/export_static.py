"""Export real cached calculations for a serverless, fully offline demo.

Run from the repository root: .venv/bin/python scripts/export_static.py
No live acquisition, synthetic fallback, or cloud backend is involved.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from siteforge import api


def export(output: Path, grid_size=5):
    grid = api.terrain()
    sites = api.sites()
    # The outer quarter is deliberately excluded: azimuth coverage deteriorates
    # near DEM boundaries. Every remaining horizon still has a coverage check.
    rows = np.linspace(grid.valid.shape[0]//4, 3*grid.valid.shape[0]//4, grid_size).astype(int)
    cols = np.linspace(grid.valid.shape[1]//4, 3*grid.valid.shape[1]//4, grid_size).astype(int)
    cells = sorted(set([(int(r), int(c)) for r in rows for c in cols if grid.valid[r,c]] + [(s["row"],s["col"]) for s in sites]))
    candidates, analyses, rejected = [], [], []
    links = {s["id"]: {} for s in sites}
    for index, (row, col) in enumerate(cells):
        candidate_id = f"r{row}c{col}"
        reference = min(sites, key=lambda s: np.linalg.norm(grid.xyz[row,col]-grid.xyz[s["row"],s["col"]]))
        candidate = dict(id=candidate_id, **grid.point(row,col), reference_site_id=reference["id"])
        valid_count = 0
        for height in api.HEIGHTS:
            request = api.AnalysisRequest(site_id=reference["id"], row=row, col=col, height_m=height)
            try:
                result = api.analyze(request)
            except ValueError as error:
                rejected.append(dict(candidate_id=candidate_id, height_m=height, reason=str(error)))
                continue
            result["candidate_id"] = candidate_id
            # Check export schema before writing production data.
            api.AnalysisResponse.model_validate(result)
            analyses.append(result)
            valid_count += 1
            for lander in sites:
                links[lander["id"]][f"{candidate_id}-{height}"] = grid.local_link((lander["row"],lander["col"]), (row,col), 2., height)
        if valid_count:
            candidates.append(candidate)
        print(f"Calculated {index+1}/{len(cells)} candidates ({len(analyses)} configurations)", flush=True)
    if not analyses:
        raise RuntimeError("No real scientific analyses could be exported")
    for selected in sites:
        selected["candidate_id"] = f"r{selected['row']}c{selected['col']}"
        selected["slope_deg"] = grid.point(selected["row"],selected["col"])["slope_deg"]
    payload = dict(schema_version=1, generated_utc=datetime.now(timezone.utc).isoformat(),
                   terrain=api.get_terrain(stride=4), sites=sites, methodology=api.methodology(),
                   scenarios=api.scenarios(), analyses=analyses, links=links,
                   candidates=candidates, rejected=rejected,
                   static_mode="All terrain, horizons, body directions and local links are precomputed from NASA data. Time-window metrics and finite-search ranking may be recomputed from these cached samples.",
                   heights_m=list(api.HEIGHTS), lander_height_m=2,
                   objective="height_m / 20 + distance_m / 1000 + slope_deg / 90",
                   objective_kind="Dimensionless engineering preference, not physical cost")
    output.parent.mkdir(parents=True, exist_ok=True)
    encoded = json.dumps(payload, separators=(",", ":"), allow_nan=False).encode()
    output.write_bytes(encoded)
    digest = hashlib.sha256(encoded).hexdigest()
    output.with_suffix(".sha256").write_text(digest+"  "+output.name+"\n")
    print(json.dumps(dict(output=str(output), bytes=len(encoded), sha256=digest,
                          candidates=len(candidates), configurations=len(analyses))))
    return payload


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "public" / "data" / "snapshot.json")
    parser.add_argument("--grid-size", type=int, default=5, choices=range(2,10))
    args = parser.parse_args()
    export(args.output, args.grid_size)
