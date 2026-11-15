"""Inspect the official raster, then extract a bounded center window.

This acquisition product is not a validated terrain/ephemeris alignment.
"""
import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

import rasterio
from rasterio.windows import Window

SOURCE = 'https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/Site01/Site01_final_adj_5mpp_surf.tif'
parser = argparse.ArgumentParser()
parser.add_argument('--source', default=SOURCE, help='Official URL or downloaded GeoTIFF')
parser.add_argument('--size', type=int, default=512)
args = parser.parse_args()
if not 16 <= args.size <= 2048:
    parser.error('size must be between 16 and 2048 pixels')
output = Path('data')
output.mkdir(exist_ok=True)
with rasterio.open(args.source) as dataset:
    size = min(args.size, dataset.width, dataset.height)
    window = Window((dataset.width-size)//2, (dataset.height-size)//2, size, size)
    terrain = dataset.read(1, window=window, masked=True)
    if terrain.count() == 0:
        raise ValueError('Selected window contains no valid terrain')
    profile = dataset.profile.copy()
    profile.update(width=size, height=size, transform=dataset.window_transform(window))
    destination = output / 'connecting-ridge-roi.tif'
    with rasterio.open(destination, 'w', **profile) as crop:
        crop.write(terrain.filled(dataset.nodata), 1)
        crop.write_mask((~__import__('numpy').ma.getmaskarray(terrain)).astype('uint8') * 255)
    metadata = dict(source=SOURCE, input=args.source, accessed_utc=datetime.now(timezone.utc).isoformat(),
                    crs=dataset.crs.to_wkt() if dataset.crs else None, tags=dataset.tags(),
                    units=dataset.units, nodata=dataset.nodata, source_shape=[dataset.height,dataset.width],
                    window=[window.col_off,window.row_off,size,size], transform=list(profile['transform']),
                    valid_cells=int(terrain.count()), sha256=hashlib.sha256(destination.read_bytes()).hexdigest(),
                    status='Acquired only; reference frame, vertical datum and Horizons alignment require validation')
    (output / 'terrain-metadata.json').write_text(json.dumps(metadata, indent=2, allow_nan=False))
    print(json.dumps(metadata, indent=2))
