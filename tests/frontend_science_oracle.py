"""Run the Python optimizer on the exact search space exported to the browser."""
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from siteforge.engine import ecef, optimize, windows


class CachedTerrain:
    """Adapter for cached NASA geometry with Python integration and ranking."""

    def __init__(self, snapshot, lander_id):
        self.xyz = {}
        self.points = {}
        self.analyses = {}
        self.links = snapshot['links'][lander_id]
        for analysis in snapshot['analyses']:
            point = analysis['position']
            cell = point['row'], point['col']
            self.points[cell] = point
            self.analyses[cell, analysis['height_m']] = analysis
            radius = snapshot['terrain']['radius_m'] + point['elevation_m']
            self.xyz[cell] = ecef(point['longitude_deg'], point['latitude_deg'], radius)

    def point(self, row, col):
        return self.points[row, col]

    def evaluate(self, row, col, height, first, last):
        analysis = self.analyses.get(((row, col), height))
        if analysis is None:
            raise ValueError('Candidate height not present in the static export')
        series = analysis['series']
        window = slice(first, last + 1)
        times = series['timestamp_utc'][window]
        return {'metrics': {
            body: windows(times, series[f'{body}_visible'][window])
            for body in ('sun', 'earth', 'both')
        }}

    def local_link(self, _lander, cell, _lander_height, height):
        analysis = self.analyses[cell, height]
        return self.links[f"{analysis['candidate_id']}-{height:g}"]


def key(config):
    point = config['position']
    return f"r{point['row']}c{point['col']}-{config['height_m']:g}"


def main():
    snapshot = json.loads(Path(sys.argv[1]).read_bytes())
    runs = json.load(sys.stdin)
    outputs = []
    for run in runs:
        lander = next(s for s in snapshot['sites'] if s['id'] == run['siteId'])
        terrain = CachedTerrain(snapshot, lander['id'])
        first, last = run['first'], run['last']
        source = snapshot['analyses'][0]['series']['timestamp_utc']
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
    print(json.dumps(outputs))


if __name__ == '__main__':
    main()
