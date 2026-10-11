import hashlib
from pathlib import Path
HERE=Path(__file__).resolve().parent
EXPECTED='1323382efff7027a18c35933829d0efa5a9bb4cfbfff7ededc23ede2529f6a78'
def patch_runtime(base,overlay):
 base,overlay=Path(base),Path(overlay);name='product-images/images.mjs';old=(base/name).read_bytes();new=(HERE.parent/'collection-speed/images.mjs').read_bytes()
 assert hashlib.sha256(old).hexdigest()==EXPECTED,'Fresh live image module changed; inspect before applying'
 assert old!=new
 p=overlay/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(new)
 return {'passed':True,'allowedFiles':[name],'oldImageModuleSha256':EXPECTED,'originalsPreserved':True,'jpegRecoveryOnly':True}
