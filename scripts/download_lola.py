"""Download the bounded official LOLA products: the 41 MB Site01 5 m DEM the engine evaluates, and the three
PDS LOLA south polar GDR grids that only the 3D close-up draws around it. No alternate clones."""
from pathlib import Path
from urllib.request import urlopen
import hashlib
import shutil
ROOT=Path(__file__).resolve().parents[1]
PGDA='https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/'
PDS='https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/'
# (url, local name, byte length or None, SHA-256 or None)
PRODUCTS=[
 (PGDA+'Site01/Site01_final_adj_5mpp_surf.tif','Site01_final_adj_5mpp_surf.tif',40980810,None),
 (PGDA+'README','LOLA_README.txt',None,None),
 (PDS+'ldem_85s_40m.img','ldem_85s_40m.img',115034112,'1609e9b860748e0b9952a7239c51b37d3b2a799d35e9fc3c258526711cc1e51d'),
 (PDS+'ldem_80s_80m.img','ldem_80s_80m.img',115520000,'e6591eeea35402ca5e124ca00f5bf0774381a2d4fa919144b455d82b8ff65fdc'),
 (PDS+'ldem_75s_240m.img','ldem_75s_240m.img',29062688,'d031efe2611b17dfbf3c158f5e15dc04cd5719349dcbf6384bb21fd97697c490'),
]
def sha256(path):
 h=hashlib.sha256()
 with path.open('rb') as f:
  for chunk in iter(lambda:f.read(1<<20),b''):h.update(chunk)
 return h.hexdigest()
def valid(path,size,digest):
 return path.exists() and (size is None or path.stat().st_size==size) and (digest is None or sha256(path)==digest)
for url,local,size,digest in PRODUCTS:
 target=ROOT/'data'/local;target.parent.mkdir(exist_ok=True)
 if valid(target,size,digest):
  print('Already acquired:',local);continue
 partial=target.with_suffix(target.suffix+'.part')
 with urlopen(url,timeout=120) as source,partial.open('wb') as out:
  shutil.copyfileobj(source,out)
 if not valid(partial,size,digest):
  raise ValueError(f'Unexpected bytes for {local}; inspect upstream update before using')
 partial.replace(target);print('Acquired:',local)
