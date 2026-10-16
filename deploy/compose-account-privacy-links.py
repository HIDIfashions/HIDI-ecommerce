"""Add only the reviewed privacy-link compatibility fix to an already-verified web image."""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
HISTORICAL_SOURCE = "32a1e35402f6855ef138a6e54065e65cc7cba249"
SOURCE_PATH = "deploy/privacy-policy/links.js"
IMAGE_PATH = "privacy-policy/links.js"
REQUIRED_FILES = {"dist/index.html", "server.mjs", "hero-media.mjs", "apps/web/server.js"}
spec = importlib.util.spec_from_file_location("account_privacy_links_composer", ROOT / "deploy/compose-msg91-images.py")
composer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(composer)


def historical_links():
    return subprocess.check_output(["git", "show", HISTORICAL_SOURCE + ":" + SOURCE_PATH], cwd=ROOT)


def reviewed_links():
    source = ROOT / SOURCE_PATH
    assert source.is_file() and not source.is_symlink(), "Missing reviewed privacy-link source"
    return source.read_bytes()


def require_base(base, original):
    links = base / IMAGE_PATH
    assert links.is_file() and not links.is_symlink(), "Missing original privacy-link runtime file"
    assert original and links.read_bytes() == original, "Original privacy-link file differs from the fixed reviewed baseline"
    assert all((base / name).is_file() and not (base / name).is_symlink() for name in REQUIRED_FILES), "Expected combined storefront and standalone Next runtime"
    assert (base / "apps/web/.next").is_dir() and not (base / "apps/web/.next").is_symlink(), "Missing existing Next build"


def verify(base, candidate, configs, reviewed, original):
    require_base(base, original)
    assert reviewed and reviewed != original, "Privacy-link overlay must contain a nonempty reviewed change"
    links = candidate / IMAGE_PATH
    assert links.is_file() and not links.is_symlink(), "Missing reviewed privacy-link runtime file"
    assert links.read_bytes() == reviewed, "Candidate privacy-link payload differs from reviewed source"
    before_files, after_files = composer.fingerprints(base), composer.fingerprints(candidate)
    delta = {name for name in before_files.keys() | after_files.keys() if before_files.get(name) != after_files.get(name)}
    assert delta == {IMAGE_PATH}, "Privacy-link image changed outside the single reviewed file: " + str(sorted(delta))
    before, after = configs
    assert before["Config"] == after["Config"], "Docker runtime configuration changed"
    original_layers = before["RootFS"]["Layers"]
    assert original_layers and after["RootFS"]["Layers"][:len(original_layers)] == original_layers, "Original image layers were not preserved"
    return {
        "app": "web", "overlay": "account-privacy-links", "passed": True,
        "historical_source": HISTORICAL_SOURCE, "changed_files": [IMAGE_PATH],
        "reviewed_payload_identical": True, "historical_payload_identical": True,
        "protected_files_identical": len(before_files) - 1,
        "runtime_config_identical": True, "base_layers_preserved": True,
    }


def compose(args):
    composer.validate_image(args.base, "web")
    assert "@sha256:" in args.base, "Expected the resolved immutable web overlay digest"
    assert re.fullmatch(re.escape(composer.REGISTRY + "/hidi-web:") + r"[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}", args.tag), "Expected a bounded HIDI web image tag"
    original, reviewed = historical_links(), reviewed_links()
    assert reviewed and reviewed != original, "Privacy-link source has no reviewed change"
    work = Path(args.work).resolve()
    work.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(work, 0o700)
    base, candidate, overlay = work / "base-app", work / "candidate-app", work / "overlay"
    assert not any(path.exists() or path.is_symlink() for path in [base, candidate, overlay, work / "Dockerfile"]), "Expected a fresh privacy-link composition workspace"
    composer.extract(args.base, base)
    require_base(base, original)
    target = overlay / IMAGE_PATH
    target.parent.mkdir(parents=True)
    target.write_bytes(reviewed)
    (work / "Dockerfile").write_text("FROM " + args.base + "\nCOPY --chown=node:node overlay/ /app/\n")
    subprocess.run(["docker", "build", "--pull=false", "-t", args.tag, str(work)], check=True)
    composer.extract(args.tag, candidate)
    configs = json.loads(composer.docker("image", "inspect", args.base, args.tag))
    result = verify(base, candidate, configs, reviewed, original)
    Path(args.report).write_text(json.dumps(result, indent=2))
    print(json.dumps(result))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base", required=True)
    parser.add_argument("--tag", required=True)
    parser.add_argument("--work", required=True)
    parser.add_argument("--report", required=True)
    compose(parser.parse_args())
