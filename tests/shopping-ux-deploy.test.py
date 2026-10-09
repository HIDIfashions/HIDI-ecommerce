"""Exercise the actual release/rollback shell script with local Azure fixtures."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

SHA = "a" * 40
OLD_SHA = "b" * 40
REGISTRY = "acrhidiprod0927.azurecr.io"
WEB_IMAGE = REGISTRY + "/hidi-web@sha256:" + "c" * 64
API_IMAGE = REGISTRY + "/hidi-api:" + SHA
SCRIPT = Path(__file__).resolve().parents[1] / "deploy/update-shopping-ux.sh"


def mock(tool, args):
    path = Path(os.environ["HIDI_MOCK_STATE"])
    state = json.loads(path.read_text())
    scenario = state["scenario"]
    state["calls"].append([tool, *args])
    result, status = "", 0
    if tool == "az":
        app = args[args.index("-n") + 1]
        item = state["apps"][app]
        if args[:2] == ["containerapp", "show"]:
            if app == "hidi-web" and state["apps"]["hidi-api"]["image"] == API_IMAGE:
                if scenario == "concurrent-web":
                    item["image"] = REGISTRY + "/hidi-web:independent-release"
                if scenario == "changed-settings":
                    item["env"] = [{"name": "AUTH_PROVIDER", "value": "independent"}]
            result = json.dumps({"identity": {"type": "SystemAssigned"}, "properties": {
                "template": {"containers": [{"image": item["image"], "env": item["env"], "resources": {"cpu": 1}}], "scale": {"minReplicas": 1}},
                "configuration": {"activeRevisionsMode": "Multiple", "ingress": {"traffic": [{"revisionName": item["revision"], "weight": 100}]}},
                "latestRevisionName": item["revision"], "latestReadyRevisionName": item["ready"],
            }})
        elif args[:2] == ["containerapp", "update"]:
            assert set(args) >= {"--image", "--only-show-errors"}
            assert not any(arg.startswith("--set-env") or arg.startswith("--remove-env") for arg in args)
            image = args[args.index("--image") + 1]
            item["image"] = image
            item["revision"] += "x"
            item["ready"] = item["revision"]
            if scenario == "web-update-failure" and image == WEB_IMAGE:
                status = 1  # Azure accepted the image before its response failed.
        elif args[:3] != ["containerapp", "ingress", "traffic"]:
            raise AssertionError(args)
    elif tool == "git":
        if args[0] == "diff":
            result = "apps/web/components/cart-client.tsx\n"
            if scenario == "unreviewed-source":
                result += "apps/web/app/admin/page.tsx\n"
        elif args[:2] == ["merge-base", "--is-ancestor"]:
            status = int(scenario == "newer-api")
        else:
            raise AssertionError(args)
    elif tool == "curl":
        assert args[-1].startswith("https://thidigk.thehidi.com/")
        result = "401" if "/api/admin/" in args[-1] else "200"
        if scenario == "auth-boundary-failure" and "/api/admin/" in args[-1]:
            result = "200"
    else:
        raise AssertionError(tool)
    path.write_text(json.dumps(state))
    sys.stdout.write(result)
    return status


class ShoppingRelease(unittest.TestCase):
    def run_release(self, scenario):
        with tempfile.TemporaryDirectory(prefix="hidi-release-test-") as directory:
            root = Path(directory)
            state = {"scenario": scenario, "calls": [], "apps": {name: {
                "image": REGISTRY + "/" + name + (":" + OLD_SHA if name == "hidi-api" else "@sha256:" + "d" * 64),
                "env": [{"name": "AUTH_PROVIDER", "value": "existing"}, {"name": "PAYMENT_KEY", "secretRef": "existing-payment"}],
                "revision": name + "-old", "ready": name + "-old",
            } for name in ["hidi-api", "hidi-web"]}}
            if scenario == "unready-current":
                state["apps"]["hidi-web"]["ready"] = "older-revision"
            before = {name: item["image"] for name, item in state["apps"].items()}
            state_path = root / "state.json"
            state_path.write_text(json.dumps(state))
            (root / "deploy").mkdir()
            (root / "deploy/shopping-ux-release.json").write_text(json.dumps({"storefront_base": OLD_SHA, "storefront_files": ["apps/web/components/cart-client.tsx"]}))
            bin_path = root / "bin"
            bin_path.mkdir()
            for tool in ["az", "git", "curl"]:
                executable = bin_path / tool
                executable.write_text("#!" + sys.executable + "\nimport runpy, sys\nsys.argv = [" + repr(str(Path(__file__).resolve())) + ", '--mock', " + repr(tool) + ", *sys.argv[1:]]\nrunpy.run_path(sys.argv[0], run_name='__main__')\n")
                executable.chmod(0o755)
            smoke_dir = root / "landing-source/deploy/hidi-web-new"
            smoke_dir.mkdir(parents=True)
            for name in ["smoke.py", "wiring-smoke.py"]:
                (smoke_dir / name).write_text("import os, json, sys\nsys.exit(1 if json.load(open(os.environ['HIDI_MOCK_STATE']))['scenario'] == 'smoke-failure' else 0)\n")
            env = {**os.environ, "PATH": str(bin_path) + os.pathsep + os.environ["PATH"], "HIDI_MOCK_STATE": str(state_path), "RUNNER_TEMP": str(root)}
            release = subprocess.run(["bash", str(SCRIPT), SHA, WEB_IMAGE], cwd=root, env=env, capture_output=True, text=True, timeout=30)
            after = json.loads(state_path.read_text())
            return release, before, after

    def test_success_updates_api_before_web_and_preserves_settings(self):
        release, _, state = self.run_release("success")
        self.assertEqual(release.returncode, 0, release.stderr)
        updates = [call for call in state["calls"] if call[:3] == ["az", "containerapp", "update"]]
        self.assertEqual([call[call.index("-n") + 1] for call in updates], ["hidi-api", "hidi-web"])
        self.assertEqual(state["apps"]["hidi-api"]["image"], API_IMAGE)
        self.assertEqual(state["apps"]["hidi-web"]["image"], WEB_IMAGE)
        for app in state["apps"].values():
            self.assertEqual(app["env"][0]["value"], "existing")

    def test_partial_update_smoke_and_auth_failure_restore_both_images(self):
        for scenario in ["web-update-failure", "smoke-failure", "auth-boundary-failure"]:
            with self.subTest(scenario=scenario):
                release, before, state = self.run_release(scenario)
                self.assertNotEqual(release.returncode, 0)
                self.assertEqual({name: item["image"] for name, item in state["apps"].items()}, before)
                updates = [call for call in state["calls"] if call[:3] == ["az", "containerapp", "update"]]
                self.assertEqual([call[call.index("-n") + 1] for call in updates[-2:]], ["hidi-web", "hidi-api"])

    def test_preflight_rejects_unreviewed_source_newer_api_and_unready_apps(self):
        for scenario in ["unreviewed-source", "newer-api", "unready-current"]:
            with self.subTest(scenario=scenario):
                release, before, state = self.run_release(scenario)
                self.assertNotEqual(release.returncode, 0)
                self.assertEqual({name: item["image"] for name, item in state["apps"].items()}, before)
                self.assertFalse(any(call[:3] == ["az", "containerapp", "update"] for call in state["calls"]))

    def test_concurrent_web_changes_are_preserved_and_our_api_is_rolled_back(self):
        for scenario in ["concurrent-web", "changed-settings"]:
            with self.subTest(scenario=scenario):
                release, before, state = self.run_release(scenario)
                self.assertNotEqual(release.returncode, 0)
                self.assertEqual(state["apps"]["hidi-api"]["image"], before["hidi-api"])
                updates = [call for call in state["calls"] if call[:3] == ["az", "containerapp", "update"]]
                self.assertTrue(all(call[call.index("-n") + 1] == "hidi-api" for call in updates))
                if scenario == "concurrent-web":
                    self.assertTrue(state["apps"]["hidi-web"]["image"].endswith("independent-release"))
                else:
                    self.assertEqual(state["apps"]["hidi-web"]["env"][0]["value"], "independent")


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--mock":
        sys.exit(mock(sys.argv[2], sys.argv[3:]))
    unittest.main()
