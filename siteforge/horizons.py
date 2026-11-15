"""Acquire and parse airless observer azimuth/elevation, in degrees."""
import csv
import json
import math
from datetime import datetime, timezone
from urllib.parse import urlencode
from urllib.request import urlopen

ENDPOINT = 'https://ssd.jpl.nasa.gov/api/horizons.api'


def parse_response(payload):
    if payload.get('error'):
        raise ValueError(payload['error'])
    result = payload.get('result', '')
    if '$$SOE' not in result or '$$EOE' not in result:
        raise ValueError('Horizons response has no complete ephemeris table')
    table = result.split('$$SOE', 1)[1].split('$$EOE', 1)[0]
    records = []
    for row in csv.reader(table.strip().splitlines()):
        if not row:
            continue
        if len(row) < 5:
            raise ValueError('Expected CSV observer table with quantity 4')
        timestamp = datetime.strptime(row[0].strip(), '%Y-%b-%d %H:%M').replace(tzinfo=timezone.utc)
        azimuth, elevation = map(float, row[3:5])
        if not (math.isfinite(azimuth) and math.isfinite(elevation) and 0 <= azimuth <= 360 and -90 <= elevation <= 90):
            raise ValueError('Invalid azimuth or elevation')
        if records and timestamp.isoformat() <= records[-1]['timestamp_utc']:
            raise ValueError('Timestamps must increase strictly')
        records.append(dict(timestamp_utc=timestamp.isoformat(), azimuth_deg=azimuth, elevation_deg=elevation))
    if not records:
        raise ValueError('Empty ephemeris table')
    return records


def acquire(longitude, latitude, altitude_km, body, start, end):
    if body not in ('10', '399') or not -90 <= latitude <= 90 or not -180 <= longitude <= 180:
        raise ValueError('Invalid body or coordinates')
    if not all(math.isfinite(v) for v in (longitude, latitude, altitude_km)):
        raise ValueError('Coordinates must be finite')
    parameters = dict(COMMAND=body, MAKE_EPHEM='YES', OBJ_DATA='NO', EPHEM_TYPE='OBSERVER',
                      CENTER='coord@301', COORD_TYPE='GEODETIC',
                      SITE_COORD=f'{longitude},{latitude},{altitude_km}', START_TIME=start,
                      STOP_TIME=end, STEP_SIZE='30 min', QUANTITIES='4', CSV_FORMAT='YES',
                      APPARENT='AIRLESS', ANG_FORMAT='DEG', TIME_DIGITS='MINUTES')
    url = ENDPOINT + '?' + urlencode({'format': 'json', **{k: f"'{v}'" for k, v in parameters.items()}})
    with urlopen(url, timeout=60) as response:
        payload = json.load(response)
    return dict(source=url, accessed_utc=datetime.now(timezone.utc).isoformat(),
                parameters=parameters, raw=payload, records=parse_response(payload))
