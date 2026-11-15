"""Check the static monthly exports against the offline NASA source cache."""
import json
import unittest

from scripts.export_monthly_site_scan import PUBLIC_DATA, build, encode


class MonthlySiteScanTests(unittest.TestCase):
    def test_exports_round_trip_from_retained_horizons_responses(self):
        rebuilt, ephemeris = build()
        published = json.loads((PUBLIC_DATA / 'monthly-site-scan.json').read_bytes())
        for month, expected in zip(rebuilt['months'], published['months'], strict=True):
            for site_id, site in month['sites'].items():
                # Allow insignificant slope variation across NumPy builds.
                slope = expected['sites'][site_id]['slope_deg']
                self.assertAlmostEqual(site['slope_deg'], slope, places=9)
                site['slope_deg'] = slope
        self.assertEqual(json.loads(encode(rebuilt)), published)
        self.assertEqual(encode(ephemeris), (PUBLIC_DATA / 'monthly-site-ephemeris.json').read_bytes())

    def test_month_bounds_and_default_fixed_site_minimums(self):
        scan = json.loads((PUBLIC_DATA / 'monthly-site-scan.json').read_bytes())
        months = scan['months']
        self.assertEqual([month['id'] for month in months],
                         ['2026-11', '2026-12', '2027-01', '2027-02', '2027-03', '2027-04'])
        self.assertEqual([month['duration_hours'] for month in months], [720, 744, 744, 672, 744, 720])
        for previous, current in zip(months, months[1:]):
            self.assertEqual(previous['end_utc'], current['start_utc'])
        self.assertEqual(months[0]['start_utc'], '2026-11-01T00:00:00+00:00')
        self.assertEqual(months[-1]['end_utc'], '2027-05-01T00:00:00+00:00')
        self.assertEqual([
            tuple(month['sites'][site_id]['minimum_height_m'] for site_id in ('ridge-a', 'ridge-b'))
            for month in months
        ], [(5, 10), (5, 10), (5, 10), (10, 10), (10, 20), (None, None)])
        april_a = months[-1]['sites']['ridge-a']['heights'][-1]
        self.assertEqual((april_a['height_m'], april_a['sun_hours'], april_a['earth_hours'],
                          april_a['both_longest_outage_hours']), (20, 495, 386, 325))
