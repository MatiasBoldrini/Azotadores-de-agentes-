"""Synthetic parser fixtures only. No production NASA validation claimed."""
import unittest
from siteforge.horizons import parse_response

class ParserTests(unittest.TestCase):
    def test_valid_csv(self):
        result = parse_response({'result': '$$SOE\n 2026-Nov-01 00:00, , , 120.5, -2.1,\n$$EOE'})
        self.assertEqual(result[0]['elevation_deg'], -2.1)
        self.assertEqual(result[0]['timestamp_utc'], '2026-11-01T00:00:00+00:00')

    def test_rejects_invalid_tables(self):
        for payload in [{'error': 'invalid site'}, {'result': ''}, {'result': '$$SOE\n$$EOE'},
                        {'result': '$$SOE\n2026-Nov-01 00:00, , , nan, 2,\n$$EOE'},
                        {'result': '$$SOE\n2026-Nov-01 00:00, , , 12, 92,\n$$EOE'}]:
            with self.subTest(payload=payload), self.assertRaises(ValueError):
                parse_response(payload)

    def test_rejects_duplicate_times(self):
        row = '2026-Nov-01 00:00, , , 12, 2,\n'
        with self.assertRaises(ValueError):
            parse_response({'result': '$$SOE\n' + row * 2 + '$$EOE'})
