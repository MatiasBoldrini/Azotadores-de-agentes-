# PGDA 69 validation scripts

Scripts and compact outputs used to compare SITE//FORGE illumination and Earth visibility against NASA LOLA PGDA 69 average-visibility maps. Results are summarized in `../validation_pgda69.md` and `../validation_pgda69_scatter.png`.

The scripts were written against absolute paths on the build machine (`/workspace/pgda69`, `/tmp/azrepo`). They are archived here as run, not as a portable pipeline.

## Included

- `analyze.py`, `coarse.py`, `fetch.py`
- `results.json`, `coarse_results.json`
- NASA PDS labels for the two maps below

## Skipped (raw rasters larger than 10 MB)

Download from NASA PGDA 69 (https://pgda.gsfc.nasa.gov/products/69):

- `AVGVISIB_85S_060M_201608.TIF` — 33 MB, average solar-disc visibility, 60 m/px, south of 85°S. Product ID `AVGVISIB_85S_060M_201608`.
- `AVGVISIB_85S_060M_201608_EARTH.TIF` — 24 MB, the Earth-visibility companion. Product ID `AVGVISIB_85S_060M_201608_EARTH`.

Also not copied (used by the scripts but not stored in this folder):

- Horizons ephemeris cache (`/workspace/pgda69/eph/`, 4.6 MB of yearly `json.gz` files, 2009–2028, Sun and Earth)
- Local terrain used for the SITE//FORGE side of the comparison (`data/terrain.npz` and `data/regional-terrain.npz` in the app repo)
