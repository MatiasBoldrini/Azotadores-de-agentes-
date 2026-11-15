"""HTTP boundary checks; all modified scientific files are temporary fixtures."""
import json
import unittest

from fastapi.testclient import TestClient
from siteforge import api
import test_api as fixture_module


class ApiEdgeCases(unittest.TestCase):
    def setUp(self):
        self.fixture = fixture_module.ApiTests()
        self.fixture.setUp()
        self.addCleanup(self.fixture.tearDown)
        self.fixture.fixture()
        self.client = TestClient(api.app, raise_server_exceptions=False)

    def test_get_rejects_invalid_windows(self):
        windows = [
            {"start": "2026-11-01T00:00:00Z"},
            {"end": "2026-11-01T02:00:00Z"},
            {"start": "2026-11-01T02:00:00Z", "end": "2026-11-01T00:00:00Z"},
            {"start": "2026-11-01T00:00:00Z", "end": "2026-11-01T00:00:00Z"},
            {"start": "2026-11-01T00:00:00", "end": "2026-11-01T02:00:00"},
            {"start": "not-a-date", "end": "2026-11-01T02:00:00Z"},
            {"start": "2026-10-31T00:00:00Z", "end": "2026-11-01T02:00:00Z"},
            {"start": "2026-11-01T00:10:00Z", "end": "2026-11-01T02:00:00Z"},
        ]
        for window in windows:
            with self.subTest(window=window):
                r = self.client.get("/api/ephemeris", params={"site_id": "ridge-a", **window})
                self.assertEqual(r.status_code, 422, r.text)

    def test_timezone_equivalent_windows_have_identical_results(self):
        results = []
        for start, end in [("2026-11-01T00:00:00Z", "2026-11-01T02:00:00Z"),
                           ("2026-10-31T21:00:00-03:00", "2026-10-31T23:00:00-03:00")]:
            r = self.client.post("/api/visibility", json={"start": start, "end": end})
            self.assertEqual(r.status_code, 200, r.text)
            results.append(r.json())
        self.assertEqual(*results)

    def test_duplicate_heights_do_not_duplicate_ranked_configurations(self):
        results = []
        for heights in [[0, 2], [0, 2, 2]]:
            r = self.client.post("/api/optimize", json={"heights": heights, "constraints": {"max_distance_m": 0}})
            self.assertEqual(r.status_code, 200, r.text)
            result = r.json()
            self.assertEqual(result["evaluated_configurations"], 2)
            self.assertEqual(result["feasible_count"], 2)
            results.append({key: result[key] for key in ("recommended", "alternatives")})
        self.assertEqual(*results)

    def test_invalid_search_constraints_are_rejected(self):
        for payload in [{"heights": []}, {"heights": [3]}, {"grid_size": 10},
                        {"constraints": {"max_distance_m": -1}},
                        {"constraints": {"min_sun_percent": 101}},
                        {"constraints": {"max_slope_deg": 91}}, {"unexpected": True}]:
            with self.subTest(payload=payload):
                r = self.client.post("/api/optimize", json=payload)
                self.assertEqual(r.status_code, 422, r.text)

    def test_nonfinite_request_numbers_are_rejected_without_server_error(self):
        for value in ["NaN", "Infinity", "-Infinity"]:
            r = self.client.post("/api/optimize", content='{"constraints":{"max_distance_m":' + value + '}}',
                                 headers={"content-type": "application/json"})
            self.assertEqual(r.status_code, 422, r.text)

    def test_missing_ephemeris_returns_service_unavailable(self):
        (self.fixture.root / "ephemeris/ridge-a_sun.json").unlink()
        r = self.client.post("/api/visibility", json={})
        self.assertEqual(r.status_code, 503, r.text)

    def test_zero_distance_search_only_evaluates_the_lander(self):
        r = self.client.post("/api/optimize", json={"heights": [0, 2], "constraints": {"max_distance_m": 0}})
        self.assertEqual(r.status_code, 200, r.text)
        result = r.json()
        self.assertEqual(result["candidate_count"], 1)
        self.assertEqual(result["evaluated_configurations"], 2)
        self.assertEqual(result["recommended"]["height_m"], 0)

    def test_impossible_requirements_do_not_fabricate_a_recommendation(self):
        path = self.fixture.root / "ephemeris/ridge-a_earth.json"
        data = json.loads(path.read_text())
        for record in data["records"]:
            record["elevation_deg"] = -80
        path.write_text(json.dumps(data))
        r = self.client.post("/api/optimize", json={"constraints": {"max_distance_m": 0, "min_earth_percent": 100}})
        self.assertEqual(r.status_code, 200, r.text)
        result = r.json()
        self.assertEqual(result["status"], "infeasible")
        self.assertEqual(result["feasible_count"], 0)
        self.assertIsNone(result["recommended"])
        self.assertEqual(result["alternatives"], [])
        self.assertNotIn("analysis", result)

    def test_corrupt_ephemeris_is_a_data_error_not_a_user_error(self):
        path = self.fixture.root / "ephemeris/ridge-a_sun.json"
        valid = json.loads(path.read_text())
        malformed = [{}, {"records": []}, {"records": [valid["records"][0]]},
                     {"records": [valid["records"][0], valid["records"][0]]},
                     {"records": list(reversed(valid["records"]))},
                     {"records": [{**record, "azimuth_deg": None} for record in valid["records"]]},
                     {"records": [{**record, "elevation_deg": float("nan")} for record in valid["records"]]},
                     {"records": [{**record, "timestamp_utc": "2026-11-01T00:00:00"} for record in valid["records"]]}]
        for data in malformed:
            with self.subTest(data=data):
                path.write_text(json.dumps(data))
                api.ephemeris.cache_clear()
                for method, url, kwargs in [("get", "/api/ephemeris", {"params": {"site_id": "ridge-a"}}),
                                            ("post", "/api/visibility", {"json": {}})]:
                    r = getattr(self.client, method)(url, **kwargs)
                    self.assertEqual(r.status_code, 503, r.text)
                    self.assertIn("scientific data invalid", r.text)


if __name__ == "__main__":
    unittest.main()
