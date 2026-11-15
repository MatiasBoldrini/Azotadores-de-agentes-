"""Run the Python optimizer on the exact search space exported to the browser."""
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from siteforge.engine import angular_interpolate, ecef, optimize, reproject_ephemeris, windows


class CachedTerrain:
    """Adapter for cached NASA geometry with Python integration and ranking."""

    def __init__(self, snapshot, lander_id):
        self.xyz = {}
        self.points = {}
        self.analyses = {}
        self.links = snapshot['links'][lander_id]
        self.times = snapshot['analyses'][0]['series']['timestamp_utc']
        self.states = {}
        for analysis in snapshot['analyses']:
            point = analysis['position']
            cell = point['row'], point['col']
            self.points[cell] = point
            self.analyses[cell, analysis['height_m']] = analysis
            self.states[cell, analysis['height_m']] = {
                body: analysis['series'][f'{body}_visible'] for body in ('sun', 'earth', 'both')
            }
            radius = snapshot['terrain']['radius_m'] + point['elevation_m']
            self.xyz[cell] = ecef(point['longitude_deg'], point['latitude_deg'], radius)

    def point(self, row, col):
        return self.points[row, col]

    def evaluate(self, row, col, height, first, last):
        cell = row, col
        analysis = self.analyses.get((cell, height))
        if analysis is None:
            raise ValueError('Candidate height not present in the static export')
        sample = slice(first, last + 1)
        times = self.times[sample]
        return {'metrics': {
            body: windows(times, self.states[cell, height][body][sample])
            for body in ('sun', 'earth', 'both')
        }}

    def local_link(self, _lander, cell, _lander_height, height):
        analysis = self.analyses[cell, height]
        return self.links[f"{analysis['candidate_id']}-{height:g}"]



def extended_geometry(snapshot):
    from scripts.export_monthly_site_scan import BODIES, load_tables

    sites = {site['id']: site for site in snapshot['sites']}
    directions = {key: {body: load_tables(site, body, False)[0] for body in BODIES}
                  for key, site in sites.items()}
    states, digests = {}, {}
    for candidate in snapshot['candidates']:
        site = sites[candidate['reference_site_id']]
        by_body = {}
        for body, records in directions[site['id']].items():
            if (candidate['row'], candidate['col']) != (site['row'], site['col']):
                records = reproject_ephemeris(records, site['longitude_deg'], site['latitude_deg'],
                                              candidate['longitude_deg'], candidate['latitude_deg'])
            by_body[body] = ([record['azimuth_deg'] for record in records],
                             [record['elevation_deg'] for record in records])

        for analysis in snapshot['analyses']:
            if analysis['candidate_id'] != candidate['id']:
                continue
            visible = {
                body: elevation > angular_interpolate(azimuth, analysis['horizon']['elevation_deg'])
                for body, (azimuth, elevation) in by_body.items()
            }
            visible['both'] = visible['sun'] & visible['earth']
            config = (candidate['row'], candidate['col']), analysis['height_m']
            states[config] = {body: value.tolist() for body, value in visible.items()}
            digests[f"{candidate['id']}-{analysis['height_m']:g}"] = {
                body: hashlib.sha256(bytes(value)).hexdigest() for body, value in states[config].items()
            }
    times = [record['timestamp_utc'] for record in next(iter(directions.values()))['sun']]
    return times, states, digests

def key(config):
    point = config['position']
    return f"r{point['row']}c{point['col']}-{config['height_m']:g}"


def main():
    snapshot = json.loads(Path(sys.argv[1]).read_bytes())
    runs = json.load(sys.stdin)
    outputs = []
    extended = extended_geometry(snapshot) if '--observations' in sys.argv[2:] else None
    for run in runs:
        lander = next(s for s in snapshot['sites'] if s['id'] == run['siteId'])
        terrain = CachedTerrain(snapshot, lander['id'])
        if extended:
            terrain.times, terrain.states, _ = extended
        first, last = run['first'], run['last']
        source = terrain.times
        duration = windows(source[first:last+1], [False] * (last-first+1))['duration_hours']
        c = run['constraints']
        result = optimize(
            terrain, terrain.points,
            {cell: {'sun': first, 'earth': last} for cell in terrain.points},
            (lander['row'], lander['col']),
            constraints=dict(
                min_sun_hours=duration*c['minSun']/100,
                min_earth_hours=duration*c['minEarth']/100,
                max_sun_outage_hours=c['maxOutage'], max_earth_outage_hours=c['maxOutage'],
                max_distance_m=c['maxDistance'], max_slope_deg=c['maxSlope'],
                require_local_link=c['requireLink'],
            ),
            heights=snapshot['heights_m'],
        )
        ranked = ([result['recommended']] + result['alternatives']) if result['recommended'] else []
        outputs.append(dict(
            feasible=result['feasible_count'], alternatives=[key(x) for x in ranked[:5]],
            recommended=key(ranked[0]) if ranked else None,
        ))
    print(json.dumps(dict(ranking=outputs, visibility=extended[2]) if extended else outputs))


if __name__ == '__main__':
    main()
