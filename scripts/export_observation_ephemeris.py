"""Export candidate directions for the five months following the November snapshot."""
from __future__ import annotations

import hashlib
import json

import numpy as np

from export_monthly_site_scan import BODIES, BOUNDARIES, PUBLIC_DATA, ROOT, STEP, STEP_MINUTES, encode, load_tables, midnight
from siteforge import engine


def export():
    snapshot_bytes = (PUBLIC_DATA / 'snapshot.json').read_bytes()
    snapshot = json.loads(snapshot_bytes)
    candidates = snapshot['candidates']
    sites = {site['id']: site for site in snapshot['sites']}
    directions, sources = {}, {}
    for site_id, site in sites.items():
        directions[site_id], sources[site_id] = {}, {}
        for body in BODIES:
            directions[site_id][body], sources[site_id][body] = load_tables(site, body, fetch=False)

    initial = midnight(BOUNDARIES[0])
    splice = midnight(BOUNDARIES[1])
    november_count = (splice - initial) // STEP + 1
    angles = []
    for candidate in candidates:
        site_id = candidate['reference_site_id']
        site = sites[site_id]
        cached = [a for a in snapshot['analyses'] if a['candidate_id'] == candidate['id']]
        if not cached:
            raise ValueError(f"Missing November configuration for {candidate['id']}")
        columns = []
        for body in BODIES:
            records = directions[site_id][body]
            if (candidate['row'], candidate['col']) != (site['row'], site['col']):
                records = engine.reproject_ephemeris(
                    records, site['longitude_deg'], site['latitude_deg'],
                    candidate['longitude_deg'], candidate['latitude_deg'],
                )
            for angle in ('azimuth_deg', 'elevation_deg'):
                values = [record[angle] for record in records]
                if not all(a['provenance']['site_id'] == site_id and np.allclose(
                    a['series'][f'{body}_{angle}'], values[:november_count], rtol=0, atol=1e-10,
                ) for a in cached):
                    raise ValueError(f"November directions differ for {candidate['id']}/{body}/{angle}")
                columns.append(values)
        angles.append(columns)
    full = np.asarray(angles, dtype='<f8')
    if not np.isfinite(full).all():
        raise ValueError('Candidate directions must be finite')

    output = PUBLIC_DATA / 'observation-ephemeris'
    output.mkdir(exist_ok=True)
    shards = []
    for begin, finish in zip(BOUNDARIES[1:], BOUNDARIES[2:]):
        start, end = midnight(begin), midnight(finish)
        first, last = (start - initial) // STEP, (end - initial) // STEP
        content = full[:, :, first:last + 1].tobytes()
        filename = begin.strftime('%Y-%m') + '.f64'
        (output / filename).write_bytes(content)
        shards.append(dict(file=filename, start_utc=start.isoformat(), end_utc=end.isoformat(),
                           sha256=hashlib.sha256(content).hexdigest()))
        print(f'{filename}: {len(content):,} bytes')

    manifest = dict(schema_version=1, start_utc=initial.isoformat(), splice_utc=splice.isoformat(),
                    end_utc=midnight(BOUNDARIES[-1]).isoformat(), step_minutes=STEP_MINUTES,
                    snapshot_sha256=hashlib.sha256(snapshot_bytes).hexdigest(),
                    candidate_ids=[candidate['id'] for candidate in candidates], shards=shards, sources=sources)
    (ROOT / 'frontend/src/lib/observationEphemerisManifest.json').write_bytes(encode(manifest))


if __name__ == '__main__':
    export()
