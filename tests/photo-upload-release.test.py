"""Verify a failed photo rollout restores owned images and preserves independent changes."""
import copy
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest

spec=importlib.util.spec_from_file_location("photo_release",Path(__file__).resolve().parents[1]/"deploy/photo-upload/release.py")
release=importlib.util.module_from_spec(spec);spec.loader.exec_module(release)

class RolloutGuards(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        release.PRIVATE=Path(self.temp.name)/"private";release.PRIVATE.mkdir()
        release.EVIDENCE=Path(self.temp.name)/"evidence";release.EVIDENCE.mkdir()
        self.before={}
        for index,name in enumerate(("hidi-api","hidi-web")):
            self.before[name]={"image":release.images.REGISTRY+"/"+name+"@sha256:"+str(index+1)*64,
                "settingsHash":"settings-"+name,"latest":name+"--original","ready":name+"--original","mode":"Single"}
            (release.PRIVATE/(name+".json")).write_text(json.dumps(self.before[name]))
            release.save(name+"-backup.json",{"verified":True,"originalImage":self.before[name]["image"],"settingsHash":self.before[name]["settingsHash"]})
        self.current=copy.deepcopy(self.before);self.writes=[]
        os.environ.update({"GITHUB_RUN_ID":"fixture","GITHUB_SHA":"fixture-source",
            "API_IMAGE":release.images.REGISTRY+"/hidi-api@sha256:"+"3"*64,
            "WEB_IMAGE":release.images.REGISTRY+"/hidi-web@sha256:"+"4"*64})
        release.save("candidate-http.json",{"passed":True,"actualNextHttp":True,"photoLimitBytes":12*1024*1024})
        for app in ("api","web"):release.save(app+"-preservation.json",{"passed":True})
        release.save("web-patch.json",{"renamedAssets":{}})
        release.save("public-before.json",{"fixture":"retained"})
        release.public_state=lambda:{"fixture":"retained"}
        release.cloud.app=lambda name:copy.deepcopy(self.current[name])
        release.cloud.snapshot=lambda data:copy.deepcopy(data)
        release.cloud.ready=lambda state:None
        def write(data,image,suffix):
            name=next(name for name in self.current if data["settingsHash"]==self.before[name]["settingsHash"])
            self.current[name].update(image=image,latest=name+"--"+suffix,ready=name+"--"+suffix)
            self.writes.append((name,image,suffix))
        release.cloud.write_image=write
        release.wait_ready=lambda name,image,suffix:copy.deepcopy(self.current[name])
        release.cloud.get=lambda route,*args,**kwargs:b"retained"
    def tearDown(self):
        self.temp.cleanup()
    def test_success_changes_only_images(self):
        release.apply()
        self.assertEqual([name for name,_,_ in self.writes],["hidi-api","hidi-web"])
        for name in self.before:self.assertEqual(self.before[name]["settingsHash"],self.current[name]["settingsHash"])
        self.assertTrue(json.loads((release.EVIDENCE/"after.json").read_text())["passed"])
    def test_failed_live_check_restores_both_owned_images(self):
        def fail(*args,**kwargs):raise AssertionError("Fixture live check failed")
        release.cloud.get=fail
        with self.assertRaisesRegex(AssertionError,"live check failed"):release.apply()
        self.assertEqual([name for name,_,_ in self.writes],["hidi-api","hidi-web","hidi-web","hidi-api"])
        for name in self.before:self.assertEqual(self.current[name]["image"],self.before[name]["image"])
    def test_independent_api_change_is_not_overwritten_during_recovery(self):
        def fail(*args,**kwargs):
            self.current["hidi-api"].update(image=release.images.REGISTRY+"/hidi-api@sha256:"+"5"*64,settingsHash="independent")
            raise AssertionError("Fixture independent change")
        release.cloud.get=fail
        with self.assertRaisesRegex(AssertionError,"independent change"):release.apply()
        self.assertEqual([name for name,_,_ in self.writes],["hidi-api","hidi-web","hidi-web"])
        self.assertEqual(self.current["hidi-api"]["settingsHash"],"independent")
    def test_concurrent_change_before_apply_prevents_all_writes(self):
        self.current["hidi-web"]["settingsHash"]="changed"
        with self.assertRaisesRegex(AssertionError,"Concurrent application change"):release.apply()
        self.assertEqual(self.writes,[])

if __name__=="__main__":unittest.main()

