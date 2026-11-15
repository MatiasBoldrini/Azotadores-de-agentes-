"""Recompute the real-data experiment and scientific figure without network access."""
from pathlib import Path
import sys,json,os
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
os.environ.setdefault('MPLCONFIGDIR',str(ROOT/'data/.mplcache'))
import numpy as np
import matplotlib;matplotlib.use('Agg')
import matplotlib.pyplot as plt
from siteforge.engine import Terrain,reproject_ephemeris
D=np.load(ROOT/'data/terrain.npz');terrain=Terrain(**{k:D[k] for k in ('elevation_m','longitude_deg','latitude_deg','pixel_size_m','radius_m')})
regional_path=ROOT/'data/regional-terrain.npz'
if regional_path.exists():
 terrain=Terrain(**{k:D[k] for k in ('elevation_m','longitude_deg','latitude_deg','pixel_size_m','radius_m')},regional=dict(np.load(regional_path)))
regional_enabled=regional_path.exists()
sites=json.loads((ROOT/'data/sites.json').read_text());results=[]
for site in sites:
 eph={n:json.loads((ROOT/f"data/ephemeris/{site['id']}_{n}.json").read_text())['records'] for n in ('sun','earth')}
 for h in (0,2,5,10,20):
  result=terrain.evaluate(site['row'],site['col'],h,eph['sun'],eph['earth']);result['site_id']=site['id'];results.append(result)
print([(r['site_id'],r['height_m'],r['metrics']['sun']['total_hours'],r['metrics']['earth']['total_hours']) for r in results])
(ROOT/'data/validation-results.json').write_text(json.dumps(results,indent=2))
fig,axes=plt.subplots(2,2,figsize=(13,7),facecolor='#10151c');fig.suptitle('Connecting Ridge · NASA LOLA + JPL Horizons · November 2026',color='white')
for i,s in enumerate(sites):
 base=results[i*5];high=results[i*5+4];hours=np.arange(len(base['series']['timestamp_utc']))*.5
 for ax,n,color in [(axes[i,0],'sun','#f4c77c'),(axes[i,1],'earth','#76bcff')]:
  ax.set_facecolor('#10151c');ax.plot(hours,base['series'][n+'_elevation_deg'],color=color,label=f'{n.title()} center')
  ax.plot(hours,base['series'][n+'_horizon_deg'],color='#b5bac3',lw=.8,label=('Combined' if regional_enabled else 'Local')+' horizon · 0 m')
  ax.plot(hours,high['series'][n+'_horizon_deg'],color='#77d7ae',lw=.8,label=('Combined' if regional_enabled else 'Local')+' horizon · 20 m')
  ax.set_title(f"{s['name']} · {n.title()} visibility {base['metrics'][n]['total_hours']:.1f} → {high['metrics'][n]['total_hours']:.1f} h",color='white');ax.set_ylabel('Elevation (degrees)',color='white');ax.set_xlabel('Hours since Nov 1, 00:00 UTC',color='white');ax.tick_params(colors='white');ax.grid(alpha=.1);ax.legend(fontsize=7)
fig.tight_layout();fig.savefig(ROOT/'data/validation-plot.png',dpi=150)
rows='\n'.join(f"| {r['site_id']} | {r['height_m']:g} | {r['metrics']['sun']['total_hours']:.1f} | {r['metrics']['earth']['total_hours']:.1f} | {r['metrics']['both']['total_hours']:.1f} | {r['metrics']['sun']['longest_outage_hours']:.1f} | {r['metrics']['earth']['longest_outage_hours']:.1f} | {r['metrics']['both']['longest_outage_hours']:.1f} |" for r in results)
coords='\n'.join(f"- **{s['name']}**: {s['latitude_deg']:.9f}° latitude, {s['longitude_deg']:.9f}° east longitude; elevation {s['elevation_m']:.3f} m; crop cell ({s['row']}, {s['col']})." for s in sites)
report=f'''# Real-data scientific validation

Status: **Reproducible local-terrain experiment completed. Not a full lunar horizon or mission validation.**

## Data and coordinates

{coords}

The source is NASA LOLA Site01 Connecting Ridge, `Site01_final_adj_5mpp_surf.tif`, 3200 × 3200 pixels at 5 m. The retained ROI is source window [1344,1344,512,512], a 2.56 km square. Pixel centers are transformed using the GeoTIFF south-polar stereographic CRS. The sphere radius is 1,737,400 m. Heights are treated as radial elevations above that sphere; see LOLA RDR/GDR data specification. Source checksum, CRS, transform, acquisition date and source tags are retained in `data/terrain-metadata.json`.

Horizons requested separate Sun (10) and Earth (399) observer tables at each point, airless, quantity 4, 30-minute sampling, **2026-11-01 00:00 to 2026-12-01 00:00 UTC** (720 h). Raw responses and exact queries are retained. Returned center frame is `MEAN_ME (high precision)`, the lunar mean-Earth frame described by the Horizons manual as DE421, matching the DEM; returned center radii are 1737.4 km. East-positive longitudes and altitude in km are used. Underlying dynamical ephemeris is DE441; it does not change the documented body-fixed coordinate convention.

## Computed experiment

| Point | Height (m) | Sun (h) | Earth (h) | Both (h) | Longest solar outage (h) | Longest Earth outage (h) | Longest simultaneous outage (h) |
|---|---:|---:|---:|---:|---:|---:|---:|
{rows}

![Recomputed real-data horizon and elevation curves](data/validation-plot.png)

## Method

Terrain cell centers are mapped to spherical ECEF positions using radius plus elevation. Each observer's north/east/up basis gives obstacle elevation and true geographic azimuth. The maximum cell-center elevation in each 1° sector defines the local terrain horizon. Periodic interpolation samples that horizon along each body's azimuth. Visibility is center elevation strictly greater than horizon. Increasing infrastructure height changes the observer position and recomputes the horizon. Time integration uses left-endpoint states on [first,last), avoiding an extra interval after the final sample.

## Limitations

- **Distant terrain outside this 2.56 km crop is absent.** These are local-horizon results, potentially optimistic, not complete illumination predictions. The requested regional far-field DEM remains a separate acceptance gate.
- NASA's gridded terrain includes substantial interpolation. Cell size is not measurement accuracy; no DEM uncertainty ensemble was propagated.
- Cell-center angular sectors can miss narrow obstacles; no convergence guarantee is claimed. Local-only angular sensitivity at Ridge A, 0 m: 180/360/720 bins produce 411/426/443.5 solar hours and 189/199/209 Earth hours. These differences must not be interpreted as numerical precision of 0.5 h.
- Body centers only; no solar disk fraction, eclipse filtering, electrical power, Fresnel clearance or radio link budget.
- Heights reuse their ground-position observer ephemeris: at 20 m the neglected translation parallax is below 0.000004° for Earth at distances above 300,000 km, and smaller for Sun. Visibility close to a threshold remains sensitive.
- Half-hour sampling can miss or mis-time shorter events. The experiment is a conditional geometric estimate, not a certified landing recommendation.

## Reproduce

```sh
.venv/bin/python scripts/prepare_data.py
.venv/bin/python scripts/acquire_ephemeris.py  # online only when cache missing
.venv/bin/python scripts/validate_real_data.py # offline
.venv/bin/python -m unittest discover -s tests -v
```

## Sources

- [NASA LOLA product and uncertainty description](https://pgda.gsfc.nasa.gov/products/78)
- [Official dataset README](https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/README)
- [Horizons observer conventions and lunar reference frame](https://ssd.jpl.nasa.gov/horizons/manual.html)
- [LOLA RDR/GDR specification](https://science.nasa.gov/wp-content/uploads/2024/01/lola-rdrsis.pdf)
- [Barker et al. source paper](https://doi.org/10.1016/j.pss.2020.105119)
'''
if regional_enabled:
 report=report.replace('Reproducible local-terrain experiment completed. Not a full lunar horizon or mission validation.','Reproducible multi-resolution terrain experiment completed. Not a certified mission validation.')
 report=report.replace('Local horizon ·','Combined horizon ·')
 report=report.replace('**Distant terrain outside this 2.56 km crop is absent.** These are local-horizon results, potentially optimistic, not complete illumination predictions. The requested regional far-field DEM remains a separate acceptance gate.','Regional NASA LOLA terrain extends the horizon to 150 km. Original 80 m cell centers are retained to 30 km; the highest real cell (with its actual coordinates) in each 4×4 block is retained from 30 to 150 km. The 5 m local crop remains the near field. Features beyond 150 km and within-cell peaks can still be missed; coarse-block peak placement can distort angular coverage. See data/regional-metadata.json for provenance.')
 report=report.replace('The maximum cell-center elevation in each 1° sector defines the local terrain horizon.','The maximum cell-center elevation in each 1° sector across both local and regional datasets defines the combined terrain horizon.')
 report+=f'\n## Regional source and discovery\n\nThe second real NASA dataset is [LOLA South Pole 20 m/pixel DEM and Data Products](https://pgda.gsfc.nasa.gov/products/90), using its `LDEM_80S_80MPP_ADJ.TIF` 80 m product. 1,103,352 retained real source samples provide regional obstacles. The 150 km coverage and multi-resolution reduction are engineering approximations.\n\nAt Ridge A, a 10 m observer reaches {results[3]["metrics"]["earth"]["total_hours"]:g} h of Earth-center visibility; raising it to 20 m yields {results[4]["metrics"]["earth"]["total_hours"]:g} h. Distant terrain caps that benefit. The local-only 20 m result was 480 h, overestimating it by {480-results[4]["metrics"]["earth"]["total_hours"]:g} h. This plateau is an actual computed result, not an imposed UI effect.\n\n## Initial local-only diagnostic\n\nThe first local-only results were retained in `docs/LOCAL_ONLY_EXPERIMENT.md`. The values above supersede them for the demo; far-field terrain changes absolute visibility and may cap height benefits.\n'
report+='\n## Published illumination context, not a direct benchmark\n\nNASA PGDA product 78 describes areas of Site01 with average illumination above 70% at 1 m over 2024-01-01 to 2026-01-01, and improved illumination at 5 m. That area-based, two-year result uses different positions, heights and dates from this point-specific November 2026 experiment. It supports investigating height sensitivity, but is not an independent numerical validation of our reported hours. A matched coordinate/time/method comparison remains future work.\n'
if regional_enabled:
 report += '\n## Ridge A solar-center sensitivity\n\nThe published 1° horizon gives 426 h at ground level and 720 h at 5, 10, and 20 m. The 720 h refers to November 1 through December 1, 2026 UTC at this one coordinate. It counts half-hour intervals whose opening sample has the **center** of the Sun above the modeled horizon. At 5 m, the smallest sampled clearance is +0.799° with the production settings.\n\n| Azimuth resolution | Ground-level Sun (h) | Sun at 5 m (h) | Minimum center clearance at 5 m |\n|---:|---:|---:|---:|\n| 2° | 411 | 720 | +0.798° |\n| 1° (production) | 426 | 720 | +0.799° |\n| 0.5° | 443.5 | 720 | +0.797° |\n| 0.25° | 470.5 | 720 | +0.800° |\n\nThe 720 h result also holds at 10 and 20 m in all four runs. Ground-level hours are sensitive to azimuth resolution. These checks use the same NASA local and regional DEMs and JPL samples as production. They measure sensitivity to angular resolution while retaining the 150 km coverage, 30-minute cadence and terrain sampling limits. Solar disk coverage, eclipses and panel output are outside the model. The published PGDA two-year, area-based result above has different dates, heights and spatial aggregation, so it provides context rather than a matched benchmark.\n\nReproduce the table inputs with `.venv/bin/python scripts/check_ridge_solar.py`.\n'

ridge_ground = next(r for r in results if r['site_id'] == 'ridge-a' and r['height_m'] == 0)
pgda_rows = []
for body, dn in (('sun', 9636), ('earth', 8463)):
    pgda_pct = dn * 0.00004 * 100
    november_hours = ridge_ground['metrics'][body]['total_hours']
    november_pct = november_hours / 720 * 100
    pgda_rows.append(
        f'| {body.title()} | {dn} | {pgda_pct:.3f}% | {november_hours:g}/720 h ({november_pct:.3f}%) | '
        f'{november_pct - pgda_pct:+.3f} pp |'
    )
pgda_table_rows = '\n'.join(pgda_rows)

report += f'''
## Ridge A surface comparison with long-term NASA maps

The 60 m surface maps from [NASA PGDA product 69](https://pgda.gsfc.nasa.gov/products/69) and the November 2026 experiment produce the following values at Ridge A. Differences use unrounded fractions and describe an unpaired comparison across time windows, terrain models and visibility definitions.

| Body | LOLA stored integer (DN) | LOLA cycle, any disk visible | November 2026 at 0 m, center visible | November minus LOLA |
|---|---:|---:|---:|---:|
{pgda_table_rows}

**Time and definition.** NASA describes both rasters as averages of hourly samples over a lunar cycle of about 18.6 years. The detached labels carry 2009–2013 `START_TIME`/`STOP_TIME` metadata, a shorter span than the documented simulation. The checked sources give the cycle duration without calendar endpoints for these specific rasters. Both bands count the fraction of steps with any part of the corresponding disk above terrain. The demo counts 30-minute steps with the body center above its geometric horizon during 2026-11-01 00:00 through 2026-12-01 00:00 UTC. The percentage-point differences cannot establish November accuracy or isolate a model bias. [PDS GDRVIS documentation](https://ode.rsl.wustl.edu/moon/pagehelp/Content/Missions_Instruments/Lunar%20Reconnaissance%20Orbiter%20(LRO)/LOLA/GDR/GDRVIS.htm), [Mazarico et al. (2011)](https://doi.org/10.1016/j.icarus.2010.10.030).

**Coordinate and terrain.** The labels use planetocentric latitude and east-positive longitude in the lunar Mean Earth/Polar Axis frame of DE421, matching the Site01 coordinate frame. The south-polar stereographic projection uses a 1,737,400 m sphere, a 0° central meridian and true scale at the south pole. Ridge A projects to x = −10,997.5 m, y = −12,002.5 m. The sampled cell contains that point and has its center at x = −11,010 m, y = −12,030 m, about 30 m away. LOLA models the surface of `LDEM_85S_060M`. The demo's 0 m is above the surface of the 5 m Site01 DEM at Ridge A, with separate regional terrain for the horizon. The shared datum places the coordinates on the same reference sphere while each model uses its own terrain elevations. The product's 60 m grid and the demo's 5 m local grid can resolve different ridge features. [LOLA polar projection catalog](https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/catalog/dsmap_polar.cat).

**Raster extraction.** Sample the containing cell at zero-based row 2729, column 2345 (PDS line 2730, sample 2346) in both 5058 × 5058 IMG files. The outer upper-left corner is (−151,740 m, +151,740 m), and rows run toward decreasing y. With signed little-endian 16-bit samples and 10,116 bytes per row, read two bytes starting at file offset `2729 * 10116 + 2345 * 2`. Multiply the DN by `0.00004` and add `0.0` to obtain the fraction, then multiply by 100 for percent. The Earth label's `MINIMUM_LATITUDE = 90` conflicts with its south-pole projection and extent. The extraction uses the projection center and raster registration. [Sun IMG](https://imbrium.mit.edu/EXTRAS/ILLUMINATION/IMG/AVGVISIB_85S_060M_201608.IMG) and [label](https://imbrium.mit.edu/EXTRAS/ILLUMINATION/IMG/AVGVISIB_85S_060M_201608.LBL). [Earth IMG](https://imbrium.mit.edu/EXTRAS/ILLUMINATION/IMG/AVGVISIB_85S_060M_201608_EARTH.IMG) and [label](https://imbrium.mit.edu/EXTRAS/ILLUMINATION/IMG/AVGVISIB_85S_060M_201608_EARTH.LBL).
'''
(ROOT/'validation_report.md').write_text(report)
