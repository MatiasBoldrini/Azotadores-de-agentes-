"""The 3D close-up tile must be the engine's own terrain, not a separate dataset."""
import unittest,json
from pathlib import Path
import numpy as np
ROOT=Path(__file__).resolve().parents[1]
class Site01TileTest(unittest.TestCase):
 def setUp(self):
  self.meta=json.loads((ROOT/'public/site01/meta.json').read_text())
  self.tile=np.fromfile(ROOT/'public/site01/elevation.f32','<f4').reshape(self.meta['shape'])
 def test_tile_is_the_engine_terrain(self):
  engine=np.load(ROOT/'data/terrain.npz')['elevation_m']
  self.assertEqual(self.tile.shape,engine.shape)
  np.testing.assert_array_equal(self.tile,engine.astype('<f4'))
 def test_snapshot_terrain_is_a_stride_of_the_tile(self):
  snapshot=json.loads((ROOT/'public/data/snapshot.json').read_text())
  terrain=snapshot['terrain'];stride=terrain['stride']
  self.assertEqual(list(self.tile.shape),terrain['original_shape'])
  np.testing.assert_array_equal(self.tile[::stride,::stride],np.array(terrain['elevation_m'],dtype='<f4'))
  for site in snapshot['sites']:
   self.assertEqual(self.tile[site['row'],site['col']],np.float32(site['elevation_m']))
  for a in snapshot['analyses']:
   p=a['position'];self.assertEqual(self.tile[p['row'],p['col']],np.float32(p['elevation_m']))
 def test_provenance_matches_snapshot(self):
  provenance=json.loads((ROOT/'public/data/snapshot.json').read_text())['methodology']['provenance']
  for key in ('source','source_sha256','window','transform','pixel_size_m'):
   self.assertEqual(self.meta[key],provenance[key],key)
if __name__=='__main__':unittest.main()
