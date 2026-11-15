"""Export the Site01 terrain for the 3D close-up (visual only).

Run from the repository root after scripts/download_lola.py:
    .venv/bin/python scripts/export_site01_tile.py
elevation.f32 is the engine's own cached 5 m window (data/terrain.npz) as little-endian float32, so the
evaluated area draws exactly the terrain the calculations use. The surround levels are block means of the
same official GeoTIFF (verified against the engine's recorded SHA-256) out to its full 16 km extent.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np
import rasterio

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/site01'
SOURCE = ROOT / 'data/Site01_final_adj_5mpp_surf.tif'
# Unsigned 16-bit metres: elevation = OFFSET_M + value * STEP_M.
OFFSET_M, STEP_M = -1000.0, 0.05
# (file, source pixels per output pixel, output size); each level is centred on the 5 m window.
SURROUND = [('surround-10m.u16', 2, 800), ('surround-20m.u16', 4, 800)]


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def surround(meta: dict, output: Path) -> dict:
    assert sha256(SOURCE) == meta['source_sha256'], 'Site01 GeoTIFF does not match the engine source'
    with rasterio.open(SOURCE) as ds:
        z = ds.read(1).astype(np.float64)
        t = ds.transform
    assert np.isfinite(z).all()
    col, row, size, _ = meta['window']
    centre = (col + size / 2, row + size / 2)
    levels = []
    for name, block, n in SURROUND:
        span = block * n
        c0, r0 = int(centre[0] - span / 2), int(centre[1] - span / 2)
        assert 0 <= c0 and 0 <= r0 and c0 + span <= z.shape[1] and r0 + span <= z.shape[0]
        mean = z[r0:r0 + span, c0:c0 + span].reshape(n, block, n, block).mean(axis=(1, 3))
        code = np.round((mean - OFFSET_M) / STEP_M)
        assert code.min() >= 0 and code.max() <= 65535
        code.astype('<u2').tofile(output / name)
        px = t.a * block
        levels.append({
            'file': name,
            'shape': [n, n],
            'pixel_size_m': px,
            'transform': [px, 0.0, t.c + c0 * t.a, 0.0, -px, t.f + r0 * t.e, 0.0, 0.0, 1.0],
            'source_window': [c0, r0, span, span],
            'resampling': f'mean of {block}x{block} source pixels',
            'sha256': sha256(output / name),
        })
    return {
        'source': meta['source'],
        'source_sha256': meta['source_sha256'],
        'source_shape': list(z.shape),
        'encoding': 'row-major little-endian uint16; elevation_m = offset_m + value * step_m',
        'offset_m': OFFSET_M,
        'step_m': STEP_M,
        'levels': levels,
        'note': 'Display mesh only. The evaluated 5 m window above is unchanged and drawn at full resolution.',
    }


def export(output: Path = OUT) -> None:
    terrain = np.load(ROOT / 'data/terrain.npz')
    meta = json.loads((ROOT / 'data/terrain-metadata.json').read_text())
    elevation = terrain['elevation_m'].astype('<f4')
    output.mkdir(parents=True, exist_ok=True)
    elevation.tofile(output / 'elevation.f32')
    sites = json.loads((ROOT / 'data/sites.json').read_text())
    info = {
        'file': 'elevation.f32',
        'format': 'row-major little-endian float32, metres',
        'shape': list(elevation.shape),
        'derived_from': 'data/terrain.npz (the engine terrain cache), cast to float32',
        'source': meta['source'],
        'product_page': 'https://pgda.gsfc.nasa.gov/products/78',
        'source_sha256': meta['source_sha256'],
        'source_shape': meta['source_shape'],
        'window': meta['window'],
        'transform': meta['transform'],
        'pixel_size_m': meta['pixel_size_m'],
        'crs': meta['crs'],
        'vertical_datum': meta.get('vertical_datum'),
        'sites': {s['id']: {'row': s['row'], 'col': s['col']} for s in sites},
        'note': 'Visual only. Visibility numbers come from public/data/snapshot.json.',
    }
    info['surround'] = surround(info, output)
    (output / 'meta.json').write_text(json.dumps(info, indent=2) + '\n')


if __name__ == '__main__':
    export()
