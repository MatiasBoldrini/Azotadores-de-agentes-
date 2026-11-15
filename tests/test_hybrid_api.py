"""Real-data canonical HTTP parity and failure contracts.

Unlike legacy API fixtures, these use real LOLA/JPL inputs and compare the
backend calculations with the actual TypeScript frontend modules.
"""
import hashlib
import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
from siteforge import api, hybrid

ROOT = Path(__file__).resolve().parents[1]


class HybridApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        encoded = (ROOT / 'public/data/snapshot.json').read_bytes()
        cls.snapshot = json.loads(encoded)
        cls.digest = hashlib.sha256(encoded).hexdigest()
        cls.client = TestClient(api.app)
        script = r'''
import fs from 'node:fs';
import {calculateObservationWindow,decodeObservationShard,shardsForWindow} from './frontend/src/lib/observationEphemeris.ts';
import {keyFor,optimize} from './frontend/src/lib/science.ts';
const snapshot=JSON.parse(fs.readFileSync('public/data/snapshot.json'));
const ranges=[['2026-11-01','2026-12-01'],['2026-11-29','2026-12-05'],['2026-12-01','2027-01-01'],['2027-04-01','2027-05-01']];
const constraints={minSun:70,minEarth:40,maxOutage:360,maxDistance:1000,maxSlope:20,requireLink:true};
const results=[];
for(const [begin,finish] of ranges){
 const start=begin+'T00:00:00+00:00',end=finish+'T00:00:00+00:00';
 const specs=shardsForWindow(start,end);
 const shards=await Promise.all(specs.map(spec=>{const b=fs.readFileSync('public/data/observation-ephemeris/'+spec.file);return decodeObservationShard(spec,b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));}));
 const analyses=calculateObservationWindow(snapshot.analyses,start,end,shards);
 results.push({start,end,metrics:Object.fromEntries(analyses.map(a=>[keyFor(a),a.metrics])),rankings:snapshot.sites.map(site=>{const r=optimize(analyses,snapshot.links[site.id],constraints);return {site_id:site.id,evaluated:r.evaluated,feasible:r.feasible,recommended:r.recommended?keyFor(r.recommended):null,alternatives:r.alternatives.map(keyFor)}})});
}
console.log(JSON.stringify({constraints,results}));
'''
        cls.oracle = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', script], cwd=ROOT, text=True))

    def payload(self, **updates):
        return dict(start='2026-11-01T00:00:00Z', end='2026-12-01T00:00:00Z',
                    snapshot_sha256=self.digest, **updates)

    def test_a_all_november_configurations_match_static_series_and_metrics(self):
        response = self.client.post('/api/science/window', json=self.payload())
        self.assertEqual(response.status_code, 200, response.text[:300])
        actual = response.json()
        self.assertEqual(actual['snapshot_sha256'], self.digest)
        self.assertEqual(len(actual['analyses']), 130)
        for before, after in zip(self.snapshot['analyses'], actual['analyses']):
            for key in ('candidate_id', 'height_m', 'position', 'horizon', 'metrics', 'series'):
                self.assertEqual(before[key], after[key], (before['candidate_id'], before['height_m'], key))

    def test_b_extended_windows_and_rankings_match_actual_frontend(self):
        for oracle in self.oracle['results']:
            payload = dict(start=oracle['start'], end=oracle['end'], snapshot_sha256=self.digest)
            with self.subTest(start=oracle['start'], end=oracle['end']):
                r = self.client.post('/api/science/window', json=payload)
                self.assertEqual(r.status_code, 200, r.text[:300])
                for analysis in r.json()['analyses']:
                    key = f"{analysis['candidate_id']}-{analysis['height_m']:g}"
                    self.assertEqual(analysis['metrics'], oracle['metrics'][key], key)
                for ranking in oracle['rankings']:
                    r = self.client.post('/api/science/optimize', json={**payload, 'site_id': ranking['site_id'],
                                                                       'constraints': self.oracle['constraints']})
                    self.assertEqual(r.status_code, 200, r.text[:300])
                    self.assertEqual({key: r.json()[key] for key in ranking}, ranking)

    def test_c_selected_candidate_returns_only_its_five_heights(self):
        candidate = self.snapshot['candidates'][3]['id']
        r = self.client.post('/api/science/window', json=self.payload(candidate_ids=[candidate]))
        self.assertEqual(r.status_code, 200, r.text[:300])
        self.assertEqual([a['height_m'] for a in r.json()['analyses']], [0, 2, 5, 10, 20])
        self.assertEqual({a['candidate_id'] for a in r.json()['analyses']}, {candidate})

    def test_d_infeasible_search_returns_no_recommendation(self):
        r = self.client.post('/api/science/optimize', json=self.payload(site_id='ridge-a',
            constraints={**self.oracle['constraints'], 'maxOutage': 240}))
        self.assertEqual(r.status_code, 200, r.text[:300])
        result = r.json()
        self.assertEqual(result['evaluated'], 130)
        self.assertEqual(result['feasible'], 0)
        self.assertIsNone(result['recommended'])
        self.assertEqual(result['alternatives'], [])

    def test_e_bad_requests_and_incompatible_versions(self):
        payload = self.payload()
        for update in [{'candidate_ids': ['unknown']}, {'candidate_ids': []},
                       {'candidate_ids': ['r128c128', 'r128c128']}, {'start': '2026-10-31T00:00:00Z'},
                       {'start': '2026-11-01T00:10:00Z'}, {'start': '2026-11-01T00:00:00'},
                       {'end': '2027-05-02T00:00:00Z'}, {'end': payload['start']}]:
            with self.subTest(update=update):
                r = self.client.post('/api/science/window', json={**payload, **update})
                self.assertEqual(r.status_code, 422, r.text[:300])
        for endpoint, extra in [('/window', {}), ('/optimize', {'site_id': 'ridge-a', 'constraints': self.oracle['constraints']})]:
            r = self.client.post('/api/science' + endpoint, json={**payload, **extra, 'snapshot_sha256': '0' * 64})
            self.assertEqual(r.status_code, 409, r.text[:300])
        for update in [{'site_id': 'unknown'}, {'candidate_ids': ['r128c128']},
                       {'constraints': {**self.oracle['constraints'], 'minSun': 101}}]:
            r = self.client.post('/api/science/optimize', json={**payload, 'site_id': 'ridge-a',
                'constraints': self.oracle['constraints'], **update})
            self.assertEqual(r.status_code, 422, r.text[:300])

    def test_f_data_override_never_falls_back_to_real_data(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(api, 'DATA', Path(directory)):
            r = self.client.post('/api/science/window', json=self.payload())
            self.assertEqual(r.status_code, 503, r.text[:300])


if __name__ == '__main__':
    unittest.main()
