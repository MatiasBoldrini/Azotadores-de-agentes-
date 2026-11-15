"""Export the Site01 terrain for the 3D close-up (visual only).

Run from the repository root after scripts/download_lola.py:
    .venv/bin/python scripts/export_site01_tile.py
elevation.f32 is the engine's own cached 5 m window (data/terrain.npz) as little-endian float32, so the
evaluated area draws exactly the terrain the calculations use. The surround levels are block means of the
same official GeoTIFF (verified against the engine's recorded SHA-256) out to its full 16 km extent. Beyond
it, the regional levels are windows of the official PDS LOLA south polar grids, which share the GeoTIFF's
polar stereographic grid and 1737.4 km reference sphere, out to the horizon of the close-up.
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
PDS = 'https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/'
# PDS LOLA GDR polar grids (LRO-L-LOLA-4-GDR-V1.0, V2.0): square little-endian int16, height = DN * 0.5 m
# above the 1737.4 km sphere; pixel (i, j) is centred at x = (i - offset) * scale, y = (offset - j) * scale.
GRIDS = {
    'ldem_85s_40m': {'size': 7584, 'scale_m': 40, 'offset_px': 3791.5,
                     'sha256': '1609e9b860748e0b9952a7239c51b37d3b2a799d35e9fc3c258526711cc1e51d'},
    'ldem_80s_80m': {'size': 7600, 'scale_m': 80, 'offset_px': 3799.5,
                     'sha256': 'e6591eeea35402ca5e124ca00f5bf0774381a2d4fa919144b455d82b8ff65fdc'},
    'ldem_75s_240m': {'size': 3812, 'scale_m': 240, 'offset_px': 1905.5,
                      'sha256': 'd031efe2611b17dfbf3c158f5e15dc04cd5719349dcbf6384bb21fd97697c490'},
}
DN_M = 0.5
# (file, grid, source pixels per output pixel, output size), each centred on the 5 m window and twice the last.
REGIONAL = [
    ('lola-40m.i16', 'ldem_85s_40m', 1, 512),
    ('lola-80m.i16', 'ldem_80s_80m', 1, 512),
    ('lola-160m.i16', 'ldem_80s_80m', 2, 512),
    ('lola-320m.i16', 'ldem_80s_80m', 4, 512),
    ('lola-640m.i16', 'ldem_80s_80m', 8, 512),
    ('lola-1200m.i16', 'ldem_75s_240m', 5, 512),
]


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


def regional(meta: dict, output: Path) -> dict:
    t = meta['transform']
    half = meta['shape'][0] * meta['pixel_size_m'] / 2
    cx, cy = t[2] + half, t[5] - half
    grids = {}
    levels = []
    for name, grid, block, n in REGIONAL:
        g = GRIDS[grid]
        if grid not in grids:
            path = ROOT / 'data' / f'{grid}.img'
            assert sha256(path) == g['sha256'], f'{grid}.img does not match the recorded PDS product'
            grids[grid] = np.memmap(path, '<i2', 'r', shape=(g['size'], g['size']))
        dn, scale, offset = grids[grid], g['scale_m'], g['offset_px']
        span = block * n
        # Source pixel index of the tile centre, counted from the grid's left and top edges.
        c0 = int(round(cx / scale + offset + .5 - span / 2))
        r0 = int(round(offset + .5 - cy / scale - span / 2))
        assert 0 <= c0 and 0 <= r0 and c0 + span <= g['size'] and r0 + span <= g['size']
        window = dn[r0:r0 + span, c0:c0 + span].astype(np.float64)
        assert window.min() > -32768, 'no fill values inside the window'
        mean = window.reshape(n, block, n, block).mean(axis=(1, 3)) * DN_M
        code = np.round(mean / DN_M)
        assert -32768 < code.min() and code.max() <= 32767
        code.astype('<i2').tofile(output / name)
        px = scale * block
        levels.append({
            'file': name,
            'shape': [n, n],
            'pixel_size_m': px,
            'transform': [px, 0.0, (c0 - offset - .5) * scale, 0.0, -px, (offset + .5 - r0) * scale, 0.0, 0.0, 1.0],
            'source': f'{PDS}{grid}.img',
            'source_label': f'{PDS}{grid}.lbl',
            'source_sha256': g['sha256'],
            'source_window': [c0, r0, span, span],
            'resampling': 'source samples' if block == 1 else f'mean of {block}x{block} source pixels',
            'sha256': sha256(output / name),
        })
    return {
        'product': 'LOLA Gridded Data Record, south polar stereographic (LRO-L-LOLA-4-GDR-V1.0, product version V2.0)',
        'encoding': 'row-major little-endian int16; elevation_m = value * scale_m',
        'scale_m': DN_M,
        'vertical_datum': 'Radial elevation relative to 1737.4 km sphere',
        'levels': levels,
        'note': 'Display mesh only, beyond the Site01 GeoTIFF. Nothing here feeds the engine.',
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
    info['regional'] = regional(info, output)
    (output / 'meta.json').write_text(json.dumps(info, indent=2) + '\n')


if __name__ == '__main__':
    export()
