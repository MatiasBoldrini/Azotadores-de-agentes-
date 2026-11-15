# Monthly scan for Ridge A and Ridge B

The scan covers the six UTC calendar months from November 2026 through April 2027, at 0, 2, 5, 10 and 20 m above each fixed site. It uses the same NASA LOLA local 5 m terrain and regional horizon to 150 km as the November candidate snapshot. The observer directions come from airless JPL Horizons tables at each site's coordinates in the lunar mean Earth frame. The tables contain predictions at 30-minute intervals through 2027-05-01 00:00 UTC.

An interval starts at each sample and runs up to the next sample. The first instant of the next month closes the calculation. Each monthly total and longest outage is clipped to that month. A joint outage is an interval during which at least one of the two body centers is below or at the modeled terrain horizon.

The default minimum is the lowest tested mast height that passes the demo's availability thresholds of 70% Sun and 40% Earth, a maximum outage of 360 h for each resource, a maximum installation distance of 1 km, a maximum slope of 20°, and local line of sight. At each fixed site the station and 2 m lander are co-located, so installation distance is zero and the engine treats local line of sight as clear. Within a site the cost increases with height because slope and distance are fixed. The joint outage is reported alongside the two resource outage metrics.

| UTC month | Ridge A minimum | Ridge B minimum |
| --- | ---: | ---: |
| November 2026 | 5 m | 10 m |
| December 2026 | 5 m | 10 m |
| January 2027 | 5 m | 10 m |
| February 2027 | 10 m | 10 m |
| March 2027 | 10 m | 20 m |
| April 2027 | No feasible height | No feasible height |

In April, 20 m gives 495 h of Sun visibility at Ridge A and 371 h at Ridge B, versus 504 h required. These are geometric visibility estimates. Terrain beyond 150 km and shorter events between samples can affect the estimates. Body center visibility does not measure electrical output or radio link performance.

## Reproduce the export

```sh
.venv/bin/python scripts/export_monthly_site_scan.py
.venv/bin/python -m unittest discover -s tests -p test_monthly_site_scan.py -v
```

The exporter reads the original November cache and four compressed Horizons response files under `data/ephemeris/monthly/`. It checks the body, observer coordinates, frame, angle convention and every UTC sample, then checks that the overlapping December 1 sample matches exactly. The November metrics and terrain horizons for all ten configurations are checked against the existing snapshot. `--acquire` fetches any missing extension responses from JPL. The export runs offline with the committed inputs.

`public/data/monthly-site-scan.json` holds the 60 summaries and provenance, including the response URLs and SHA-256 digests. `public/data/monthly-site-ephemeris.json` carries Sun and Earth azimuth and elevation arrays for both sites. Index zero is the start timestamp, and each successive index advances by 30 minutes. A plot can combine these angles with the matching fixed-site horizon in `snapshot.json` using the engine's circular linear interpolation. Each site's angles are shared across all five heights.
