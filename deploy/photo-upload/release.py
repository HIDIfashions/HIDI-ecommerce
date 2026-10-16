"""Guarded 12 MB photo release over fresh live Azure images; no SQL/Blob writes."""
import argparse
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tarfile
import time

HERE=Path(__file__).resolve().parent
ROOT=HERE.parent
BASELINE="db7c03331af79adb1f1de00747a7251c94c11318"
API_STEM="apps/api/dist/admin/admin-inventory.service"
API_FILES={API_STEM+".js",API_STEM+".js.map"}
PRIVATE=Path(os.environ.get("RUNNER_TEMP","/tmp"))/"hidi-photo-upload-private"
EVIDENCE=Path("evidence/photo-upload")
def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
images=load("photo_images",ROOT/"compose-msg91-images.py")
cloud=load("photo_cloud",ROOT/"privacy-policy/rollout.py")
cloud.API_VERSION="2025-07-01"
patcher=load("photo_patcher",HERE/"patch-build.py")
def save(name,value):
    EVIDENCE.mkdir(parents=True,exist_ok=True)
    (EVIDENCE/name).write_text(json.dumps(value,indent=2))
def originals():
    return {name:json.loads((PRIVATE/(name+".json")).read_text()) for name in ("hidi-api","hidi-web")}
def states():
    return {name:cloud.snapshot(data) for name,data in originals().items()}
def unchanged(expected):
    for name,state in expected.items():
        current=cloud.snapshot(cloud.app(name));cloud.ready(current)
        assert current==state,"Concurrent application change: "+name
def public_state():
    result={}
    for path in ("/api/hidi/hero-config","/api/hidi/landing-media-config","/api/hidi/privacy-policy","/config.js"):
        body=cloud.get(path)
        if path.startswith("/api/"):body=json.dumps(json.loads(body),sort_keys=True).encode()
        result[path]=hashlib.sha256(body).hexdigest()
    return result
def baseline():
    PRIVATE.mkdir(parents=True,exist_ok=True);PRIVATE.chmod(0o700)
    destination=PRIVATE/"baseline-source";destination.mkdir()
    archive=subprocess.check_output(["git","archive",BASELINE,"apps/api/src","apps/api/tsconfig.json","apps/api/package.json"])
    with tarfile.open(fileobj=io.BytesIO(archive)) as stream:stream.extractall(destination,filter="data")
    api=destination/"apps/api"
    (api/"node_modules").symlink_to(Path("apps/api/node_modules").resolve(),target_is_directory=True)
    generated=api/"src/generated/prisma"
    if not generated.exists():
        generated.parent.mkdir(exist_ok=True)
        generated.symlink_to(Path("apps/api/src/generated/prisma").resolve(),target_is_directory=True)
    subprocess.run(["pnpm","--filter","@hidi/api","exec","tsc","-p",str(api/"tsconfig.json")],check=True)
    save("baseline-source.json",{"sourceCommit":BASELINE,"compiled":True})
def capture():
    PRIVATE.mkdir(parents=True,exist_ok=True);PRIVATE.chmod(0o700)
    captured={}
    for name in ("hidi-api","hidi-web"):
        data=cloud.app(name);state=cloud.snapshot(data);cloud.ready(state)
        assert re.fullmatch(re.escape(images.REGISTRY+"/"+name)+r"@sha256:[a-f0-9]{64}",state["image"])
        target=PRIVATE/(name+".json");target.write_text(json.dumps(data));target.chmod(0o600)
        captured[name]=state
    save("before.json",captured);save("public-before.json",public_state());unchanged(captured)
def backup():
    before=states();unchanged(before)
    for name,state in before.items():
        tag_name="backup-photo-upload-"+os.environ["GITHUB_RUN_ID"]
        tag=images.REGISTRY+"/"+name+":"+tag_name
        for args in (("pull",state["image"]),("tag",state["image"],tag),("push",tag)):
            subprocess.run(["docker",*args],check=True)
        digest=subprocess.check_output(["az","acr","repository","show","--name","acrhidiprod0927",
            "--image",name+":"+tag_name,"--query","digest","-o","tsv","--only-show-errors"],text=True).strip()
        assert digest==state["image"].split("@",1)[1],"Backup digest mismatch"
        save(name+"-backup.json",{"verified":True,"image":tag,"originalImage":state["image"],
            "digest":digest,"settingsHash":state["settingsHash"]})
    unchanged(before)
def require_backups():
    for name,state in states().items():
        report=json.loads((EVIDENCE/(name+"-backup.json")).read_text())
        assert report["verified"] and report["originalImage"]==state["image"] and report["settingsHash"]==state["settingsHash"]
def compose(app,tag):
    before=states();require_backups();unchanged(before)
    folder=PRIVATE/app;folder.mkdir()
    base=folder/"base-app";overlay=folder/"overlay";candidate=folder/"candidate-app"
    images.extract(before["hidi-"+app]["image"],base)
    if app=="api":
        actual=base/(API_STEM+".js")
        # The baseline compiler emits into its apps/api/dist tree.
        pinned=PRIVATE/"baseline-source"/(API_STEM+".js")
        assert actual.read_bytes()==pinned.read_bytes(),"Live API service differs from the pinned baseline"
        for name in API_FILES:
            target=overlay/name;target.parent.mkdir(parents=True,exist_ok=True)
            shutil.copyfile(name,target)
        expected=actual.read_text().replace("sizeBytes > 8 * 1024 * 1024","sizeBytes > 12 * 1024 * 1024").replace(
            "Image must be smaller than 8 MB","Image must be no larger than 12 MB")
        assert (overlay/(API_STEM+".js")).read_text()==expected,"API change exceeds the photo cap and message"
        allowed=API_FILES
    else:
        plan=patcher.patch_web(base,overlay);save("web-patch.json",plan)
        allowed=set(plan["files"])
    (folder/"Dockerfile").write_text("FROM "+before["hidi-"+app]["image"]+"\nCOPY --chown=node:node overlay/ /app/\n")
    subprocess.run(["docker","build","--pull=false","-t",tag,str(folder)],check=True)
    images.extract(tag,candidate)
    first,last=images.fingerprints(base),images.fingerprints(candidate)
    changed={name for name in first.keys()|last.keys() if first.get(name)!=last.get(name)}
    assert changed==allowed,"Unreviewed runtime file changes: "+str(sorted(changed^allowed))
    for name in allowed:assert (candidate/name).read_bytes()==(overlay/name).read_bytes()
    configs=json.loads(images.docker("image","inspect",before["hidi-"+app]["image"],tag))
    assert configs[0]["Config"]==configs[1]["Config"],"Image runtime configuration changed"
    layers=configs[0]["RootFS"]["Layers"]
    assert configs[1]["RootFS"]["Layers"][:len(layers)]==layers
    save(app+"-preservation.json",{"passed":True,"baseImage":before["hidi-"+app]["image"],
        "candidateTag":tag,"changedFiles":sorted(changed),"unrelatedFilesIdentical":len(first)-len(changed&first.keys()),
        "runtimeConfigurationPreserved":True,"baseLayersPreserved":True})
    unchanged(before)
def wait_ready(name,image,suffix):
    for attempt in range(60):
        data=cloud.app(name);state=cloud.snapshot(data)
        if state["image"]==image and state["latest"]==state["ready"]==name+"--"+suffix:return data
        time.sleep(10)
    raise RuntimeError("Photo revision did not become ready: "+name)
def apply():
    before=states();old=originals();require_backups();unchanged(before)
    report=json.loads((EVIDENCE/"candidate-http.json").read_text())
    assert report.get("passed") and report.get("actualNextHttp") and report.get("photoLimitBytes")==12*1024*1024
    targets={name:os.environ[name.removeprefix("hidi-").upper()+"_IMAGE"] for name in before}
    for name,image in targets.items():
        assert re.fullmatch(re.escape(images.REGISTRY+"/"+name)+r"@sha256:[a-f0-9]{64}",image)
    preserved={app:json.loads((EVIDENCE/(app+"-preservation.json")).read_text()) for app in ("api","web")}
    assert all(value["passed"] for value in preserved.values())
    public=json.loads((EVIDENCE/"public-before.json").read_text())
    assert public_state()==public,"Published content changed independently"
    deployed={}
    run=os.environ["GITHUB_RUN_ID"]
    try:
        # API expands first; the existing 5 MB UI remains compatible during rollout.
        for name in ("hidi-api","hidi-web"):
            expected={other:deployed.get(other,before[other]) for other in before};unchanged(expected)
            suffix="photo12"+name.removeprefix("hidi-")+run
            cloud.write_image(old[name],targets[name],suffix)
            state=cloud.snapshot(wait_ready(name,targets[name],suffix));deployed[name]=state
            assert state["settingsHash"]==before[name]["settingsHash"],"App configuration changed"
        for route in ("/health","/healthz","/api/store/health/ready","/","/collections/all","/cart","/checkout",
            "/account","/wishlist","/admin","/admin/products","/admin/import","/admin/inventory/receive",
            "/admin/products/price-tags","/admin/landing-media","/admin/packing-scanner","/admin/product-quick-fill",
            "/admin/product-bulk","/admin/product-delete","/admin/privacy-policy"):
            cloud.get(route)
        for route in ("/api/admin/products/options","/api/admin/orders?status=CONFIRMED","/api/hidi/privacy-policy/admin"):
            cloud.get(route,401)
        web_plan=json.loads((EVIDENCE/"web-patch.json").read_text())
        for source,destination in web_plan["renamedAssets"].items():
            url="/_next/"+destination.split("apps/web/.next/",1)[1]
            expected=(PRIVATE/"web/candidate-app"/destination).read_bytes()
            assert cloud.get(url)==expected,"Live photo asset mismatch: "+url
        assert public_state()==public,"Media, privacy or public configuration changed"
        unchanged(deployed)
        save("after.json",{"passed":True,"states":deployed,"photoLimitMB":12,"requestBodyMB":14,
            "appSettingsPreserved":True,"publishedContentPreserved":True,"oldAssetsRetained":True,
            "sourceSha":os.environ["GITHUB_SHA"],"databaseWrites":False,"blobWrites":False})
        print("PASS: 12 MB photo upload deployed; settings, retained storefront and published content preserved")
    except Exception:
        recovery={}
        for name in ("hidi-web","hidi-api"):
            data=cloud.app(name);current=cloud.snapshot(data)
            expected_suffix=name+"--photo12"+name.removeprefix("hidi-")+run
            if current["image"]==targets[name] and current["latest"]==expected_suffix and current["settingsHash"]==before[name]["settingsHash"]:
                suffix="photo12rollback"+name.removeprefix("hidi-")+run
                cloud.write_image(data,before[name]["image"],suffix)
                restored=cloud.snapshot(wait_ready(name,before[name]["image"],suffix))
                assert restored["settingsHash"]==before[name]["settingsHash"]
                recovery[name]="restored"
            elif current==before[name]:recovery[name]="original-retained"
            else:recovery[name]="independent-change-not-overwritten"
        save("rollback.json",recovery);raise

if __name__=="__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("action",choices=["baseline","capture","backup","compose","apply"])
    parser.add_argument("--app",choices=["api","web"]);parser.add_argument("--tag")
    args=parser.parse_args()
    if args.action=="compose":compose(args.app,args.tag)
    else:globals()[args.action]()

