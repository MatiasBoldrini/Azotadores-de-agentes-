"""Export six full UTC months for the two fixed Connecting Ridge sites."""
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import sys
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from siteforge import api, engine
from siteforge.horizons import acquire, parse_response

DATA = ROOT / 'data'
PUBLIC_DATA = ROOT / 'public' / 'data'
BOUNDARIES = [date(2026, month, 1) for month in (11, 12)] + [date(2027, month, 1) for month in range(1, 6)]
BODIES = {'sun': '10', 'earth': '399'}
# Match the interactive search defaults in frontend/src/App.tsx.
DEFAULTS = dict(minSun=70, minEarth=40, maxOutage=360, maxDistance=1000, maxSlope=20, requireLink=True)
STEP_MINUTES = 30
STEP = timedelta(minutes=STEP_MINUTES)


def encode(value):
    return json.dumps(value, separators=(',', ':'), allow_nan=False).encode() + b'\n'


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def midnight(day):
    return datetime.combine(day, time(), timezone.utc)


def validate_table(response, site, body, start, end):
    raw = response['raw']
    records = parse_response(raw)
    header = raw['result'].split('$$SOE', 1)[0]
    parameters = response['parameters']
    coords = (site['longitude_deg'], site['latitude_deg'], site['elevation_m'] / 1000)
    expected = dict(COMMAND=BODIES[body], CENTER='coord@301', COORD_TYPE='GEODETIC',
                    SITE_COORD=','.join(map(str, coords)), START_TIME=start.isoformat(),
                    STOP_TIME=end.isoformat(), STEP_SIZE=f'{STEP_MINUTES} min', QUANTITIES='4',
                    APPARENT='AIRLESS', EPHEM_TYPE='OBSERVER', CSV_FORMAT='YES')
    if any(parameters.get(key) != value for key, value in expected.items()):
        raise ValueError(f'Unexpected Horizons query for {site["id"]}/{body}')
    if raw['signature']['source'] != 'NASA/JPL Horizons API' or not all(item in header for item in (
        f'{body.title()} ({BODIES[body]})', 'Moon (301)', '1737.4, 1737.4, 1737.4 km',
        'MEAN_ME (high precision)', 'NO (AIRLESS)', 'Date__(UT)__HR:MN', '30 minutes',
    )):
        raise ValueError(f'Unexpected Horizons observer frame or table for {site["id"]}/{body}')
    reported = header.split('Center geodetic', 1)[1].split(':', 1)[1].strip().split()[0]
    longitude, latitude, altitude = map(float, reported.split(','))
    if not np.allclose((longitude % 360, latitude, altitude), (coords[0] % 360, coords[1], coords[2]),
                       rtol=0, atol=5e-6):
        raise ValueError(f'Horizons returned different observer coordinates for {site["id"]}/{body}')
    first = midnight(start)
    expected_count = (midnight(end) - first) // STEP + 1
    if len(records) != expected_count or any(
        record['timestamp_utc'] != (first + index * STEP).isoformat()
        for index, record in enumerate(records)
    ):
        raise ValueError(f'Incomplete Horizons UTC samples for {site["id"]}/{body}')
    return records


def load_tables(site, body, fetch):
    stem = f'{site["id"]}_{body}'
    original = DATA / 'ephemeris' / f'{stem}.json'
    extended = DATA / 'ephemeris' / 'monthly' / f'{stem}.json.gz'
    start, splice, end = BOUNDARIES[0], BOUNDARIES[1], BOUNDARIES[-1]
    november = json.loads(original.read_bytes())
    first = validate_table(november, site, body, start, splice)
    if first != november['records']:
        raise ValueError(f'November parsed samples differ from the original cache for {stem}')

    if fetch and not extended.exists():
        response = acquire(site['longitude_deg'], site['latitude_deg'], site['elevation_m'] / 1000,
                           BODIES[body], splice.isoformat(), end.isoformat())
        records = validate_table(response, site, body, splice, end)
        if first[-1] != records[0]:
            raise ValueError(f'Original and extended Horizons responses disagree at the splice for {stem}')
        del response['records']  # The raw JPL response is the source of truth.
        extended.parent.mkdir(parents=True, exist_ok=True)
        temporary = extended.with_suffix('.tmp')
        temporary.write_bytes(gzip.compress(encode(response), mtime=0))
        temporary.replace(extended)
        print(f'Cached {len(records)} JPL Horizons samples for {stem}', flush=True)
    more = json.loads(gzip.decompress(extended.read_bytes()))
    remaining = validate_table(more, site, body, splice, end)
    if first[-1] != remaining[0]:
        raise ValueError(f'Original and extended Horizons responses disagree at the splice for {stem}')
    sources = [dict(file=str(path.relative_to(ROOT)), sha256=sha256(path),
                    url=response['source'], accessed_utc=response['accessed_utc'])
               for path, response in ((original, november), (extended, more))]
    return first + remaining[1:], sources


def reference(snapshot, point, height):
    return next(row for row in snapshot['analyses'] if (row['position']['row'], row['position']['col']) == point
                and row['height_m'] == height)


def summarize(analysis, link):
    summary = dict(height_m=int(analysis['height_m']), local_link_visible=link['visible'])
    for body, metric in analysis['metrics'].items():
        summary[f'{body}_hours'] = metric['total_hours']
        summary[f'{body}_longest_outage_hours'] = metric['longest_outage_hours']
    return summary


def build(fetch=False):
    grid = api.terrain()
    if grid.regional is None:
        raise ValueError('Monthly visibility requires the local and regional terrain used in the November snapshot')
    sites = api.sites()
    if {site['id'] for site in sites} != {'ridge-a', 'ridge-b'}:
        raise ValueError('The monthly scan covers the two verified Ridge A and Ridge B sites')
    snapshot_path = PUBLIC_DATA / 'snapshot.json'
    snapshot = json.loads(snapshot_path.read_bytes())
    sources, series, all_records = {}, {}, {}
    for site in sites:
        site_id = site['id']
        all_records[site_id], sources[site_id], series[site_id] = {}, {}, {}
        for body in BODIES:
            records, source = load_tables(site, body, fetch)
            all_records[site_id][body] = records
            sources[site_id][body] = source
            series[site_id][body] = {key: [record[key] for record in records]
                                     for key in ('azimuth_deg', 'elevation_deg')}

    months = []
    first = midnight(BOUNDARIES[0])
    for begin, finish in zip(BOUNDARIES, BOUNDARIES[1:]):
        start, end = midnight(begin), midnight(finish)
        duration = (end - start).total_seconds() / 3600
        lower, upper = (start - first) // STEP, (end - first) // STEP
        month = dict(id=begin.strftime('%Y-%m'), start_utc=start.isoformat(), end_utc=end.isoformat(),
                     duration_hours=duration, sites={})
        constraints = dict(min_sun_hours=duration * DEFAULTS['minSun'] / 100,
                           min_earth_hours=duration * DEFAULTS['minEarth'] / 100,
                           max_sun_outage_hours=DEFAULTS['maxOutage'], max_earth_outage_hours=DEFAULTS['maxOutage'],
                           max_distance_m=DEFAULTS['maxDistance'], max_slope_deg=DEFAULTS['maxSlope'],
                           require_local_link=DEFAULTS['requireLink'])
        for site in sites:
            site_id = site['id']
            point = site['row'], site['col']
            ephemeris = {body: records[lower:upper + 1] for body, records in all_records[site_id].items()}
            ranking = engine.optimize(grid, [point], {point: ephemeris}, point, constraints, api.HEIGHTS)
            best = ranking['recommended']
            heights = []
            for height in api.HEIGHTS:
                analysis = grid.evaluate(*point, height, ephemeris['sun'], ephemeris['earth'])
                link = grid.local_link(point, point, 2, height)
                if begin == BOUNDARIES[0]:
                    original = reference(snapshot, point, height)
                    if (analysis['metrics'] != original['metrics'] or
                            not np.allclose(analysis['horizon']['elevation_deg'], original['horizon']['elevation_deg'],
                                            rtol=0, atol=1e-9)):
                        raise ValueError(f'November {site_id}/{height} m differs from the published analysis')
                heights.append(summarize(analysis, link))
            month['sites'][site_id] = dict(slope_deg=grid.point(*point)['slope_deg'], distance_m=0,
                                           minimum_height_m=None if best is None else int(best['height_m']), heights=heights)
        months.append(month)

    ephemeris = dict(schema_version=1, start_utc=first.isoformat(), end_utc=midnight(BOUNDARIES[-1]).isoformat(),
                     step_minutes=STEP_MINUTES, sites=series)
    summary = dict(schema_version=1, heights_m=api.HEIGHTS, defaults=DEFAULTS, months=months,
                   provenance=dict(ephemeris=sources, ephemeris_frame='Horizons lunar MEAN_ME, airless apparent body centers',
                                   step_minutes=STEP_MINUTES, algorithm=engine.VERSION, coverage=grid.coverage,
                                   classifications=['Real NASA data', 'NASA-derived calculation', 'Geometric-only estimate', 'Incomplete coverage'],
                                   terrain_sources=[source for source in api.methodology()['sources'] if source['name'].startswith('NASA LOLA')],
                                   files_sha256={str(path.relative_to(ROOT)): sha256(path) for path in
                                                 (DATA / 'terrain.npz', DATA / 'regional-terrain.npz', snapshot_path)},
                                   site_model='Station and 2 m lander share the same fixed cell at each site.',
                                   monthly_integration='Each sample owns the interval until the next. The first instant of the next month is the unweighted endpoint.',
                                   joint_outage='Longest interval without simultaneous Sun-center and Earth-center visibility.',
                                   limitations=['Terrain outside 150 km is omitted.', 'A 30-minute cadence can miss shorter events.',
                                                'Solar exposure and Earth visibility are geometric, with no power or radio model.']))
    return summary, ephemeris


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--acquire', action='store_true', help='Fetch missing extension responses directly from JPL Horizons')
    parser.add_argument('--output-dir', type=Path, default=PUBLIC_DATA)
    args = parser.parse_args()
    summary, ephemeris = build(fetch=args.acquire)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    for name, value in [('monthly-site-scan', summary), ('monthly-site-ephemeris', ephemeris)]:
        target = args.output_dir / f'{name}.json'
        target.write_bytes(encode(value))
        print(f'{target.name}: {target.stat().st_size} bytes, SHA-256 {sha256(target)}')


if __name__ == '__main__':
    main()
