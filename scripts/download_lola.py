"""Download the one bounded 41 MB official Site01 product, without alternate clones."""
from pathlib import Path
from urllib.request import urlopen
import shutil
ROOT=Path(__file__).resolve().parents[1]
base='https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/'
for remote,local in [('Site01/Site01_final_adj_5mpp_surf.tif','Site01_final_adj_5mpp_surf.tif'),('README','LOLA_README.txt')]:
 target=ROOT/'data'/local;target.parent.mkdir(exist_ok=True)
 if target.exists() and (local.endswith('.txt') or target.stat().st_size==40980810):
  print('Already acquired:',local);continue
 partial=target.with_suffix(target.suffix+'.part')
 with urlopen(base+remote,timeout=120) as source,partial.open('wb') as out:
  shutil.copyfileobj(source,out)
 if local.endswith('.tif') and partial.stat().st_size!=40980810:
  raise ValueError('Unexpected source byte length; inspect upstream update before using')
 partial.replace(target);print('Acquired:',local)
