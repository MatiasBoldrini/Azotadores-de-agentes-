"""Export the full-resolution Site01 terrain for the 3D close-up (visual only).

Run from the repository root: .venv/bin/python scripts/export_site01_tile.py
The file is the engine's own cached 5 m window (data/terrain.npz) as little-endian
float32, so the close-up draws exactly the terrain the calculations use.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/site01'


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
    (output / 'meta.json').write_text(json.dumps(info, indent=2) + '\n')


if __name__ == '__main__':
    export()
