"""Regression checks on acquired NASA regional data; no synthetic substitute."""
import hashlib
import json
from pathlib import Path
import unittest
import numpy as np
from siteforge.engine import Terrain

ROOT=Path(__file__).resolve().parents[1]

@unittest.skipUnless((ROOT/'data/regional-terrain.npz').exists(),'NASA regional data not acquired')
class RegionalRealDataTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with np.load(ROOT/'data/terrain.npz') as d:
            params={k:d[k].copy() for k in ('elevation_m','longitude_deg','latitude_deg','pixel_size_m','radius_m')}
        with np.load(ROOT/'data/regional-terrain.npz') as d:
            regional={k:d[k].copy() for k in d.files}
        cls.local=Terrain(**params)
        cls.combined=Terrain(**params,regional=regional)
        cls.sites=json.loads((ROOT/'data/sites.json').read_text())

    def test_regional_checksum_and_provenance(self):
        metadata=json.loads((ROOT/'data/regional-metadata.json').read_text())
        actual=hashlib.sha256((ROOT/'data/regional-terrain.npz').read_bytes()).hexdigest()
        self.assertEqual(actual,metadata['sha256'])
        self.assertEqual(metadata['frame'],'MOON_ME_DE421')
        self.assertGreater(metadata['total_points'],1_000_000)

    def test_regional_obstacles_never_lower_horizon(self):
        for site in self.sites:
            row,col=site['row'],site['col']
            local=np.array(self.local.horizon(row,col,20)['elevation_deg'])
            combined=np.array(self.combined.horizon(row,col,20)['elevation_deg'])
            self.assertTrue(np.all(combined>=local-1e-10))
            self.assertGreater(float((combined-local).max()),1)

    def test_regional_height_monotonicity(self):
        for site in self.sites:
            row,col=site['row'],site['col']
            ground=np.array(self.combined.horizon(row,col,0)['elevation_deg'])
            tower=np.array(self.combined.horizon(row,col,20)['elevation_deg'])
            self.assertTrue(np.all(tower<=ground+1e-10))

if __name__=='__main__':unittest.main()
