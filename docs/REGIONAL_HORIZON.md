# Local and regional horizon model

The local NASA LOLA Connecting Ridge DEM supplies 5 m samples in a 2.56 km square. A second real NASA LOLA DEM supplies surrounding terrain: [LDEM_80S_80MPP_ADJ.TIF](https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_80S_80MPP_ADJ.TIF), described by [NASA PGDA product 90](https://pgda.gsfc.nasa.gov/products/90). Both products use MOON_ME/DE421. Heights are radial metres relative to the 1,737,400 m reference sphere; projected map distances are metres.

The acquisition script reads a bounded 300.8 km square through HTTP range requests from the cloud-optimized GeoTIFF. It retains native 80 m pixel centers within 30 km of the local ROI center. From 30 to 150 km it retains the actual highest valid source pixel in each 4 by 4 block (320 m block spacing), preserving that pixel's original coordinate and elevation. Regional samples inside the local ROI are removed so the 5 m DEM takes precedence. Metadata and a checksum accompany the derived NPZ.

For each observer, both sample sets are converted to body-fixed Cartesian positions using their radii and geographic coordinates. Difference vectors are projected onto true local east, north and up. The highest elevation angle in each 1 degree azimuth sector defines the sampled terrain horizon. The two datasets are combined before sector maxima, so a distant ridge cannot be discarded simply because the local crop ends. Height changes move the observer radially; they never move the terrain or increase the modeled horizon. Linear periodic interpolation supplies the horizon at each body's azimuth.

This is a bounded geometric estimate, not a converged ray-tracing solution. Important limits:

- Terrain beyond 150 km is not modeled. The coverage is substantially larger than the local crop but is not a full lunar horizon guarantee.
- The 80 m regional source can omit narrow ridges. Selecting block maxima beyond 30 km preserves actual peaks but not every sub-block azimuth or obstacle footprint.
- Sector maxima operate on cell centers. Angular resolution affects the result; neighboring sectors and interpolated directions do not model the full area of each pixel. Report the measured angular sensitivity rather than treating the 1 degree setting as a proven accuracy bound.
- The two DEM products have different processing histories and effective resolutions. Their common reference frame does not remove all registration, height or sampling uncertainty.
- The model uses body centers, 30 minute ephemeris samples, and no atmospheric refraction. Illumination is not electrical power, and line of sight is not a radio link budget.

Reproduce acquisition with `.venv/bin/python scripts/acquire_regional.py`. The API automatically adds `data/regional-terrain.npz` when available. It records regional provenance in every analysis. If the file is absent, the engine explicitly identifies local-only coverage; no numerical regional fallback is invented.

Citation: Barker et al. (2023), *The Planetary Science Journal* **4**, 183, [doi:10.3847/PSJ/acf3e1](https://doi.org/10.3847/PSJ/acf3e1). Data DOI: [10.60903/gsfcpgda-lola-spole](https://doi.org/10.60903/gsfcpgda-lola-spole).
