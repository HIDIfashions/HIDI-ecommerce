import gzip, io, json, tarfile, tempfile, unittest
from pathlib import Path
from layer import build, digest, encode

class LayerTests(unittest.TestCase):
    def test_only_reviewed_assets_and_runtime_settings_preserved(self):
        with tempfile.TemporaryDirectory() as temp:
            source=Path(temp)/'source';source.mkdir()
            config={'architecture':'amd64','os':'linux','config':{'User':'node','Env':['PORT=3000'],'Cmd':['node','server.mjs'],'Healthcheck':{'Test':['CMD','check']}},'rootfs':{'type':'layers','diff_ids':['sha256:original']},'history':[{'created_by':'original'}]}
            blob=encode(config);(source/digest(blob).split(':')[1]).write_bytes(blob)
            manifest={'schemaVersion':2,'mediaType':'application/vnd.docker.distribution.manifest.v2+json','config':{'mediaType':'application/vnd.docker.container.image.v1+json','digest':digest(blob),'size':len(blob)},'layers':[{'mediaType':'application/vnd.docker.image.rootfs.diff.tar.gzip','digest':'sha256:original','size':1}]}
            (source/'manifest.json').write_bytes(encode(manifest));files={'app/offers/checkout.js':b'new checkout','app/offers/offers.css':b'new css'}
            dest=Path(temp)/'candidate';result=build(source,dest,files)
            actual=json.loads((dest/'manifest.json').read_bytes());self.assertEqual(result,digest((dest/'manifest.json').read_bytes()))
            self.assertEqual(actual['layers'][:-1],manifest['layers'])
            updated=json.loads((dest/actual['config']['digest'].split(':')[1]).read_bytes())
            self.assertEqual(updated['config'],config['config']);self.assertEqual(updated['rootfs']['diff_ids'][:-1],config['rootfs']['diff_ids'])
            layer=(dest/actual['layers'][-1]['digest'].split(':')[1]).read_bytes()
            self.assertEqual(digest(gzip.decompress(layer)),updated['rootfs']['diff_ids'][-1])
            with tarfile.open(fileobj=io.BytesIO(gzip.decompress(layer))) as archive:
                self.assertEqual(set(archive.getnames()),set(files))
                for entry in archive:
                    self.assertTrue(entry.isfile());self.assertEqual(entry.mode,0o644);self.assertEqual(archive.extractfile(entry).read(),files[entry.name])
            self.assertEqual(json.loads((source/'manifest.json').read_bytes()),manifest)
            with self.assertRaises(AssertionError):build(source,Path(temp)/'invalid',{'app/server.mjs':b'unsafe'})
