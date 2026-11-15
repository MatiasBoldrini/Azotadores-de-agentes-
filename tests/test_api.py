"""API contracts tested with explicitly synthetic, temporary-only fixtures."""
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np
from fastapi.testclient import TestClient

from siteforge import api


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.patch = patch.object(api, "DATA", self.root)
        self.patch.start()
        self.clear_caches()
        self.client = TestClient(api.app)

    def tearDown(self):
        self.clear_caches()
        self.patch.stop()
        self.tmp.cleanup()

    def clear_caches(self):
        api.terrain.cache_clear()
        api.sites.cache_clear()
        api.ephemeris.cache_clear()

    def fixture(self):
        rows, cols = np.indices((101, 101))
        np.savez(self.root / "terrain.npz", elevation_m=np.zeros((101, 101)),
                 longitude_deg=(cols-50)*.0002, latitude_deg=(rows-50)*.0002,
                 pixel_size_m=5., radius_m=1737400.)
        sites = [dict(id="ridge-a", name="SYNTHETIC TEST ONLY", row=50, col=50,
                      longitude_deg=0., latitude_deg=0., elevation_m=0.)]
        (self.root / "sites.json").write_text(json.dumps(sites))
        (self.root / "terrain-metadata.json").write_text(json.dumps({"classification": "SYNTHETIC TEST ONLY"}))
        (self.root / "ephemeris").mkdir()
        records = [dict(timestamp_utc=f"2026-11-01T0{h}:00:00+00:00", azimuth_deg=90., elevation_deg=5.) for h in range(3)]
        for body in ("sun", "earth"):
            (self.root / "ephemeris" / f"ridge-a_{body}.json").write_text(json.dumps(dict(source="SYNTHETIC TEST ONLY", records=records)))

    def test_missing_data_is_not_replaced(self):
        self.assertFalse(self.client.get("/api/health").json()["data_available"])
        self.assertEqual(self.client.get("/api/terrain").status_code, 503)
        self.assertEqual(self.client.get("/api/sites").status_code, 503)

    def test_visibility_and_comparison(self):
        self.fixture()
        response = self.client.post("/api/visibility", json={"site_id": "ridge-a", "height_m": 2})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["metrics"]["sun"]["total_hours"], 2.)
        self.assertEqual(len(response.json()["horizon"]["elevation_deg"]), 360)
        response = self.client.post("/api/compare", json={"sites": [{"site_id": "ridge-a"}, {"site_id": "ridge-a", "height_m": 20}]})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(len(response.json()), 2)

    def test_input_and_cache_bounds(self):
        self.fixture()
        for payload in ({"height_m": 3}, {"row": 50}, {"row": 101, "col": 50},
                        {"start": "2026-10-01T00:00:00Z", "end": "2026-11-01T02:00:00Z"},
                        {"start": "2026-11-01T00:10:00Z", "end": "2026-11-01T02:00:00Z"},
                        {"start": "2026-11-01T00:00:00", "end": "2026-11-01T02:00:00"}):
            response = self.client.post("/api/visibility", json={"site_id": "ridge-a", **payload})
            self.assertEqual(response.status_code, 422, response.text)
        self.assertEqual(self.client.post("/api/visibility", json={"site_id": "unknown"}).status_code, 404)

    def test_optimize_feasible_and_infeasible(self):
        self.fixture()
        response = self.client.post("/api/optimize", json={"site_id": "ridge-a", "grid_size": 3, "heights": [0, 2], "constraints": {"max_distance_m": 100}})
        self.assertEqual(response.status_code, 200, response.text)
        result = response.json()
        self.assertEqual(result["status"], "feasible")
        self.assertGreater(result["evaluated_configurations"], 1)
        self.assertIn("analysis", result)
        response = self.client.post("/api/optimize", json={"site_id": "ridge-a", "grid_size": 3, "heights": [0], "constraints": {"max_distance_m": 100, "require_local_link": True}})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertIn(response.json()["status"], ("feasible", "infeasible"))

    def test_terrain_and_local_link(self):
        self.fixture()
        result = self.client.get("/api/terrain?stride=4")
        self.assertEqual(result.status_code, 200, result.text)
        self.assertEqual(result.json()["original_shape"], [101, 101])
        result = self.client.post("/api/local-link", json={"lander": {"site_id": "ridge-a", "height_m": 2}, "station": {"site_id": "ridge-a", "row": 51, "col": 51, "height_m": 2}})
        self.assertEqual(result.status_code, 200, result.text)
        self.assertTrue(result.json()["visible"])


if __name__ == "__main__":
    unittest.main()
