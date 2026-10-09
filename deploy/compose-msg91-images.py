"""Assemble and verify additive auth images. This script never deploys or changes credentials."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess

REGISTRY = "acrhidiprod0927.azurecr.io"
API_FILES = {"apps/api/dist/auth/supabase-auth.service.js", "apps/api/dist/auth/supabase-auth.service.js.map"}


def fingerprints(root):
    result = {}
    for item in root.rglob("*"):
        name = item.relative_to(root).as_posix()
        if item.is_symlink():
            result[name] = ["link", os.readlink(item)]
        elif item.is_file():
            result[name] = ["file", hashlib.sha256(item.read_bytes()).hexdigest()]
    return result


def validate_image(image, app):
    assert re.fullmatch(re.escape(REGISTRY + "/hidi-" + app) + r"(?:@sha256:[0-9a-f]{64}|:[0-9a-f]{40})", image), "Expected immutable HIDI image"


def verify(base, candidate, app, configs):
    old, new = fingerprints(base), fingerprints(candidate)
    delta = {name for name in old.keys() | new.keys() if old.get(name) != new.get(name)}
    assert delta, "Auth image has no changed files"
    if app == "api":
        assert delta <= API_FILES and "apps/api/dist/auth/supabase-auth.service.js" in delta, "API changed beyond the two compiled auth files"
    else:
        assert all(name.startswith("apps/web/.next/") or name == "apps/web/server.js" for name in delta), "Web image changed outside the tested Next build: " + str(sorted(delta))
        for name in old:
            if name.startswith("dist/") or name in {"server.mjs", "hero-media.mjs"}:
                assert old[name] == new.get(name), "Protected landing/admin/runtime file changed: " + name
        assert "dist/index.html" in old and "server.mjs" in old and "hero-media.mjs" in old, "Expected combined storefront base"
    before, after = configs
    assert before["Config"] == after["Config"], "Docker runtime configuration changed"
    assert after["RootFS"]["Layers"][:len(before["RootFS"]["Layers"])] == before["RootFS"]["Layers"], "Original image layers were not preserved"
    return {"app": app, "passed": True, "changed_files": sorted(delta), "protected_files_identical": len(old) - len(delta), "runtime_config_identical": True, "base_layers_preserved": True}


def docker(*args):
    return subprocess.check_output(["docker", *args], text=True)


def extract(image, root):
    cid = docker("create", image).strip()
    try:
        root.mkdir(parents=True, exist_ok=True)
        subprocess.run(["docker", "cp", cid + ":/app/.", str(root)], check=True)
    finally:
        docker("rm", cid)


def copy_web_overlay(standalone, static, overlay):
    web = standalone / "apps/web"
    assert (web / "server.js").is_file() and (web / ".next").is_dir(), "Missing standalone web build"
    target = overlay / "apps/web"
    target.mkdir(parents=True, exist_ok=True)
    # Keep the live dependency tree, packages, public assets and outer runtime.
    # The exact-source guard already requires unchanged dependencies and config.
    shutil.copytree(web / ".next", target / ".next", symlinks=True, dirs_exist_ok=True)
    shutil.copyfile(web / "server.js", target / "server.js")
    shutil.copytree(static, target / ".next/static", symlinks=True, dirs_exist_ok=True)


def compose(args):
    validate_image(args.base, args.app)
    work = Path(args.work).resolve()
    work.mkdir(parents=True, exist_ok=True)
    base, candidate, overlay = work / "base-app", work / "candidate-app", work / "overlay"
    extract(args.base, base)
    if args.app == "api":
        for name in API_FILES:
            source = Path(name)
            assert source.is_file(), "Missing compiled auth service"
            dest = overlay / name
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, dest)
    else:
        copy_web_overlay(Path("apps/web/.next/standalone"), Path("apps/web/.next/static"), overlay)
    (work / "Dockerfile").write_text("FROM " + args.base + "\nCOPY --chown=node:node overlay/ /app/\n")
    subprocess.run(["docker", "build", "--pull=false", "-t", args.tag, str(work)], check=True)
    extract(args.tag, candidate)
    configs = json.loads(docker("image", "inspect", args.base, args.tag))
    result = verify(base, candidate, args.app, configs)
    Path(args.report).write_text(json.dumps(result, indent=2))
    print(json.dumps(result))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--app", choices=["api", "web"], required=True)
    parser.add_argument("--base", required=True)
    parser.add_argument("--tag", required=True)
    parser.add_argument("--work", required=True)
    parser.add_argument("--report", required=True)
    compose(parser.parse_args())
