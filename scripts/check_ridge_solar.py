"""Audit the published November solar-center result at Ridge A."""
import json
from pathlib import Path
import sys

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from siteforge.engine import Terrain, angular_interpolate, windows


def main():
    data = ROOT / "data"
    with np.load(data / "terrain.npz") as local, np.load(data / "regional-terrain.npz") as regional:
        terrain = Terrain(**{key: local[key] for key in (
            "elevation_m", "longitude_deg", "latitude_deg", "pixel_size_m", "radius_m"
        )}, regional=dict(regional))
    site = next(site for site in json.loads((data / "sites.json").read_text()) if site["id"] == "ridge-a")
    ephemeris = json.loads((data / "ephemeris/ridge-a_sun.json").read_text())["records"]
    azimuth = [sample["azimuth_deg"] for sample in ephemeris]
    elevation = np.array([sample["elevation_deg"] for sample in ephemeris])
    times = [sample["timestamp_utc"] for sample in ephemeris]
    print(f"{times[0]} through {times[-1]} · {len(times)} samples")
    print("| Azimuth bin | Height (m) | Visible (h) | Minimum center clearance (°) |")
    print("|---:|---:|---:|---:|")
    for bins in (180, 360, 720, 1440):
        for height in (0, 2, 5, 10, 20):
            profile = terrain.horizon(site["row"], site["col"], height, bins=bins)
            clearance = elevation - angular_interpolate(azimuth, profile["elevation_deg"])
            total = windows(times, clearance > 0)["total_hours"]
            print(f"| {360 / bins:g}° | {height} | {total:g} | {clearance.min():+.4f} |")


if __name__ == "__main__":
    main()
