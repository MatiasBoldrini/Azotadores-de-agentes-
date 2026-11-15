"""Integration checks against the retained official NASA data, never fixtures."""
import unittest,json
from pathlib import Path
import numpy as np
from siteforge.horizons import parse_response
from siteforge.engine import Terrain
ROOT=Path(__file__).resolve().parents[1]
class RealDataTest(unittest.TestCase):
 def test_raw_horizons_roundtrip(self):
  files=list((ROOT/'data/ephemeris').glob('*.json'))
  self.assertGreaterEqual(len(files),4)
  for p in files:
   value=json.loads(p.read_text())
   self.assertEqual(parse_response(value['raw']),value['records'])
   self.assertEqual(len(value['records']),1441)
   self.assertIn('1737.4',value['raw']['result'])
   self.assertIn('MEAN_ME',value['raw']['result'])
 def test_real_height_visibility_monotonic(self):
  data=np.load(ROOT/'data/terrain.npz')
  terrain=Terrain(**{k:data[k] for k in ('elevation_m','longitude_deg','latitude_deg','pixel_size_m','radius_m')})
  if (ROOT/'data/regional-terrain.npz').exists():
   terrain=Terrain(**{k:data[k] for k in ('elevation_m','longitude_deg','latitude_deg','pixel_size_m','radius_m')},regional=dict(np.load(ROOT/'data/regional-terrain.npz')))
  site=json.loads((ROOT/'data/sites.json').read_text())[0]
  eph={n:json.loads((ROOT/f"data/ephemeris/{site['id']}_{n}.json").read_text())['records'] for n in ('sun','earth')}
  base=terrain.evaluate(site['row'],site['col'],0,eph['sun'],eph['earth'])
  raised=terrain.evaluate(site['row'],site['col'],20,eph['sun'],eph['earth'])
  self.assertEqual(base['metrics']['sun']['duration_hours'],720)
  self.assertGreater(raised['metrics']['sun']['total_hours'],base['metrics']['sun']['total_hours'])
  self.assertGreater(raised['metrics']['earth']['total_hours'],base['metrics']['earth']['total_hours'])
if __name__=='__main__':unittest.main()
