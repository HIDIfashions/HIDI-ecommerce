"""Prove the already-live OTP API contains exactly the reviewed compiled auth change."""
import argparse
import importlib.util
import json
from pathlib import Path
import subprocess

BASE_API = "acrhidiprod0927.azurecr.io/hidi-api@sha256:89e6d010f2a4f9dcaea14451926f3512aec3ad5f079d110475ccc8c13b4a0448"
LIVE_API = "acrhidiprod0927.azurecr.io/hidi-api@sha256:69d4c89fd6531658eba730b7254b7d34c9a274953e2fed4b46ce22caa13e56e6"
ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("msg91_composer", ROOT / "deploy/compose-msg91-images.py")
composer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(composer)


def verify_reviewed_api(base, live, configs, compiled):
    report = composer.verify(base, live, "api", configs)
    assert set(report["changed_files"]) == composer.API_FILES, "Expected exactly the two previously deployed auth files"
    for name in composer.API_FILES:
        assert (compiled / name).read_bytes() == (live / name).read_bytes(), "Reviewed compiled auth does not match the live API"
    wallet = "apps/api/dist/wallet/wallet-transaction.js"
    assert (compiled / wallet).read_bytes() == (base / wallet).read_bytes() == (live / wallet).read_bytes(), "Protected transaction helper changed"
    return {**report, "historical_base": BASE_API, "live_api": LIVE_API, "compiled_auth_identical_to_live": True, "protected_wallet_identical": True, "api_image_built_or_written": False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--work", required=True)
    parser.add_argument("--report", required=True)
    args = parser.parse_args()
    work = Path(args.work).resolve()
    work.mkdir(parents=True, exist_ok=True, mode=0o700)
    for image in [BASE_API, LIVE_API]:
        subprocess.run(["docker", "pull", image], check=True)
    base, live = work / "historical-api", work / "live-api"
    composer.extract(BASE_API, base)
    composer.extract(LIVE_API, live)
    configs = json.loads(composer.docker("image", "inspect", BASE_API, LIVE_API))
    report = verify_reviewed_api(base, live, configs, ROOT)
    Path(args.report).write_text(json.dumps(report, indent=2))
    print(json.dumps(report))


if __name__ == "__main__":
    main()
