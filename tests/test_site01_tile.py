"""The 3D close-up tile must be the engine's own terrain, not a separate dataset."""
import unittest,json,hashlib
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
 def surround(self):
  s=self.meta['surround']
  for level in s['levels']:
   raw=(ROOT/'public/site01'/level['file']).read_bytes()
   self.assertEqual(hashlib.sha256(raw).hexdigest(),level['sha256'],level['file'])
   yield level,(s['offset_m']+np.frombuffer(raw,'<u2').astype(np.float64)*s['step_m']).reshape(level['shape'])
 def test_surround_is_the_same_source_file(self):
  s=self.meta['surround']
  self.assertEqual((s['source'],s['source_sha256']),(self.meta['source'],self.meta['source_sha256']))
  sources=(ROOT/'public/moon/SOURCES.txt').read_text()
  for level in s['levels']:self.assertIn(level['sha256'],sources)
  self.assertIn(s['source_sha256'],sources)
 def test_surround_levels_are_block_means_of_the_engine_window(self):
  engine=np.load(ROOT/'data/terrain.npz')['elevation_m'].astype(np.float64)
  px,x0,y0=self.meta['pixel_size_m'],self.meta['transform'][2],self.meta['transform'][5]
  n=engine.shape[0]
  for level,z in self.surround():
   p=level['pixel_size_m'];b=int(p/px)
   c,r=(x0-level['transform'][2])/p,(level['transform'][5]-y0)/p
   self.assertEqual((c,r),(int(c),int(r)),'block edges align with the 5 m window')
   expected=engine.reshape(n//b,b,n//b,b).mean(axis=(1,3))
   np.testing.assert_allclose(z[int(r):int(r)+n//b,int(c):int(c)+n//b],expected,atol=self.meta['surround']['step_m']/2+1e-6)
 def test_surround_covers_the_full_source_extent(self):
  levels=[l for l,_ in self.surround()]
  outer=levels[-1];shape=self.meta['surround']['source_shape']
  self.assertEqual(outer['source_window'],[0,0,shape[1],shape[0]])
  for inner,outer in zip(levels,levels[1:]):
   a,b=inner['transform'],outer['transform']
   self.assertGreater(a[2],b[2]);self.assertLess(a[5],b[5])
   self.assertLess(a[2]+a[0]*inner['shape'][1],b[2]+b[0]*outer['shape'][1])
if __name__=='__main__':unittest.main()
