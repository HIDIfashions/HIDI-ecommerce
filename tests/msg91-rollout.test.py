"""Exercise the real image rollout with fake Azure responses; no cloud access."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

REGISTRY = "acrhidiprod0927.azurecr.io"
OLD = {app: REGISTRY + "/" + app + "@sha256:" + "a" * 64 for app in ["hidi-api", "hidi-web"]}
NEW = {app: REGISTRY + "/" + app + "@sha256:" + "b" * 64 for app in ["hidi-api", "hidi-web"]}
SCRIPT = Path(__file__).resolve().parents[1] / "deploy/update-msg91-images.sh"


def mock(tool, args):
    path = Path(os.environ["HIDI_MOCK_STATE"]); state = json.loads(path.read_text())
    state["calls"].append([tool, *args]); output, status = "", 0
    if tool == "az":
        app = args[args.index("-n") + 1]; item = state["apps"][app]
        if args[:2] == ["containerapp", "show"]:
            if app == "hidi-web" and state["apps"]["hidi-api"]["image"] == NEW["hidi-api"] and state["scenario"] == "concurrent-web":
                item["image"] = REGISTRY + "/hidi-web@sha256:" + "c" * 64
            output = json.dumps({"identity": {"type": "SystemAssigned"}, "properties": {"template": {"containers": [{"image": item["image"], "env": item["env"]}]}, "configuration": {"activeRevisionsMode": "Single", "ingress": {"traffic": [{"revisionName": item["revision"], "weight": 100}]}}, "latestRevisionName": item["revision"], "latestReadyRevisionName": item["revision"]}})
        elif args[:2] == ["containerapp", "update"]:
            assert not any(arg.startswith(("--set-env", "--remove-env", "--secrets")) for arg in args)
            item["image"] = args[args.index("--image") + 1]; item["revision"] += "x"
        else: raise AssertionError(args)
    elif tool == "curl":
        if state["scenario"] == "smoke-failure" and args[-1].endswith("/health"): status = 1
        elif args[-1].endswith("/auth/config"): output = json.dumps({"phoneOtp": True, "provider": "firebase"})
        else: output = "401" if "/api/admin/" in args[-1] else "200"
    else: raise AssertionError(tool)
    path.write_text(json.dumps(state)); sys.stdout.write(output); return status


class Rollout(unittest.TestCase):
    def run_release(self, scenario):
        with tempfile.TemporaryDirectory(prefix="hidi-sms-test-") as directory:
            root = Path(directory); binary = root / "bin"; binary.mkdir()
            state = {"scenario": scenario, "calls": [], "apps": {app: {"image": image, "revision": app + "-old", "env": [{"name": "CUSTOMER_OTP_PROVIDER", "value": "firebase"}, {"name": "AUTH_KEY", "secretRef": "existing-key"}]} for app, image in OLD.items()}}
            if scenario == "unexpected-live": state["apps"]["hidi-web"]["image"] = REGISTRY + "/hidi-web@sha256:" + "d" * 64
            path = root / "state.json"; path.write_text(json.dumps(state))
            for tool in ["az", "curl"]:
                target = binary / tool
                target.write_text("#!" + sys.executable + "\nimport runpy,sys\nsys.argv=[" + repr(str(Path(__file__).resolve())) + ", '--mock', " + repr(tool) + ", *sys.argv[1:]]\nrunpy.run_path(sys.argv[0],run_name='__main__')\n")
                target.chmod(0o755)
            env = {**os.environ, "PATH": str(binary) + os.pathsep + os.environ["PATH"], "HIDI_MOCK_STATE": str(path), "RUNNER_TEMP": str(root)}
            process = subprocess.run(["bash", str(SCRIPT), OLD["hidi-api"], OLD["hidi-web"], NEW["hidi-api"], NEW["hidi-web"]], env=env, capture_output=True, text=True, timeout=120)
            return process, json.loads(path.read_text())

    def test_success_updates_api_then_web_and_preserves_provider_secret_reference(self):
        process, state = self.run_release("success")
        self.assertEqual(process.returncode, 0, process.stderr)
        updates = [call[call.index("-n") + 1] for call in state["calls"] if call[:3] == ["az", "containerapp", "update"]]
        self.assertEqual(updates, ["hidi-api", "hidi-web"])
        self.assertEqual({app: x["image"] for app, x in state["apps"].items()}, NEW)
        for x in state["apps"].values(): self.assertEqual(x["env"][0]["value"], "firebase")

    def test_unexpected_live_image_prevents_all_updates(self):
        process, state = self.run_release("unexpected-live")
        self.assertNotEqual(process.returncode, 0)
        self.assertFalse(any(call[:3] == ["az", "containerapp", "update"] for call in state["calls"]))

    def test_failed_live_probe_restores_both_owned_images(self):
        process, state = self.run_release("smoke-failure")
        self.assertNotEqual(process.returncode, 0)
        self.assertEqual({app: x["image"] for app, x in state["apps"].items()}, OLD)

    def test_independent_web_release_is_preserved_and_our_api_rolls_back(self):
        process, state = self.run_release("concurrent-web")
        self.assertNotEqual(process.returncode, 0)
        self.assertEqual(state["apps"]["hidi-api"]["image"], OLD["hidi-api"])
        self.assertTrue(state["apps"]["hidi-web"]["image"].endswith("c" * 64))


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--mock": sys.exit(mock(sys.argv[2], sys.argv[3:]))
    unittest.main()
