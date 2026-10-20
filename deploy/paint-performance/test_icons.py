import importlib.util,struct,tempfile,unittest,zlib,hashlib
from pathlib import Path
spec=importlib.util.spec_from_file_location('paint_patch',Path(__file__).with_name('patch.py'));patch=importlib.util.module_from_spec(spec);spec.loader.exec_module(patch)
def png(size):
 def chunk(kind,data):return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data))
 return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',size,size,8,6,0,0,0))+chunk(b'IDAT',zlib.compress((b'\0'+b'\x80\x20\x10\xff'*size)*size))+chunk(b'IEND',b'')
class Icons(unittest.TestCase):
 def test_exact_frames_and_originals(self):
  with tempfile.TemporaryDirectory() as folder:
   base=Path(folder)/'base';overlay=Path(folder)/'overlay';(base/'dist').mkdir(parents=True)
   frames={size:png(size) for size in [16,32,48,64,128,256]};offset=6+16*len(frames);entries=b'';body=b''
   for size,data in frames.items():entries+=struct.pack('<BBBBHHII',size%256,size%256,0,0,1,32,len(data),offset);body+=data;offset+=len(data)
   original=struct.pack('<HHH',0,1,len(frames))+entries+body;source=base/'dist/brand.ico';source.write_bytes(original)
   (base/'dist/index.html').write_text('<link rel="shortcut icon" href="./brand.ico"><link rel="icon" sizes="32x32" href="./32.png"><link rel="apple-touch-icon" href="./touch.png"><link rel="manifest" href="./site.webmanifest">')
   result=patch.build_icons(base,overlay);self.assertTrue(result['allFramePayloadsByteIdentical']);self.assertEqual(source.read_bytes(),original);self.assertEqual(result['originalSha256'],hashlib.sha256(original).hexdigest())
   for row in result['frames']:self.assertEqual((overlay/'dist'/row['url'].lstrip('/')).read_bytes(),frames[row['width']])
   self.assertNotIn('.ico',result['markup']);self.assertEqual(result['markup'].count('<link'),5);self.assertNotIn('touch.png',''.join(result['originalTags']));self.assertNotIn('site.webmanifest',''.join(result['originalTags']))
   source.write_bytes(original[:30])
   with self.assertRaises((AssertionError,struct.error)):patch.build_icons(base,overlay)
if __name__=='__main__':unittest.main()
