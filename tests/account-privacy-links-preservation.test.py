"""Reject any privacy-link overlay beyond the fixed, reviewed single-file change."""
import contextlib
import copy
import importlib.util
import io
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
from types import SimpleNamespace
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("privacy_links", ROOT / "deploy/compose-account-privacy-links.py")
links = importlib.util.module_from_spec(spec)
spec.loader.exec_module(links)
ORIGINAL = b"fixed historical privacy links\n"
REVIEWED = b"reviewed Next-safe privacy links\n"
BASE_IMAGE = "acrhidiprod0927.azurecr.io/hidi-web@sha256:" + "a" * 64
TAG = "acrhidiprod0927.azurecr.io/hidi-web:account-privacy-links-123"
CONFIGS = [
    {"Config": {"Cmd": ["node", "server.mjs"], "Env": ["RETAINED=1"], "User": "node", "WorkingDir": "/app"}, "RootFS": {"Layers": ["base", "next-overlay"]}},
    {"Config": {"Cmd": ["node", "server.mjs"], "Env": ["RETAINED=1"], "User": "node", "WorkingDir": "/app"}, "RootFS": {"Layers": ["base", "next-overlay", "privacy-links"]}},
]


def write(root, name, content):
    target = root / name
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(content)


def roots(directory):
    base, candidate = Path(directory) / "base", Path(directory) / "candidate"
    files = {
        links.IMAGE_PATH: ORIGINAL,
        "server.mjs": b"retained privacy-aware runtime",
        "hero-media.mjs": b"retained hero runtime",
        "dist/index.html": b"retained landing",
        "dist/packing-scanner-control.html": b"retained scanner",
        "apps/web/server.js": b"reviewed standalone Next server",
        "apps/web/.next/BUILD_ID": b"reviewed Next build",
        "apps/web/.next/server/app/account.html": b"reviewed native Next privacy links",
        "privacy-policy/handler.mjs": b"retained privacy editor handler",
        "privacy-policy/editor.js": b"retained privacy editor client",
        "node_modules/runtime.js": b"retained dependencies",
    }
    for name, content in files.items(): write(base, name, content)
    (base / "node_modules/retained-link").symlink_to("runtime.js")
    shutil.copytree(base, candidate, symlinks=True)
    write(candidate, links.IMAGE_PATH, REVIEWED)
    return base, candidate


class Preservation(unittest.TestCase):
    def test_only_reviewed_links_change_and_every_other_file_and_symlink_is_retained(self):
        with tempfile.TemporaryDirectory() as directory:
            base, candidate = roots(directory)
            report = links.verify(base, candidate, CONFIGS, REVIEWED, ORIGINAL)
            self.assertEqual(report["changed_files"], [links.IMAGE_PATH])
            self.assertTrue(report["passed"])
            self.assertTrue(report["runtime_config_identical"])
            self.assertTrue(report["base_layers_preserved"])
            self.assertEqual(report["historical_source"], "32a1e35402f6855ef138a6e54065e65cc7cba249")
            self.assertEqual(report["protected_files_identical"], len(links.composer.fingerprints(base)) - 1)

    def test_changed_added_deleted_protected_runtime_next_editor_or_symlink_is_rejected(self):
        for name in ["server.mjs", "hero-media.mjs", "dist/index.html", "dist/packing-scanner-control.html", "apps/web/server.js", "apps/web/.next/BUILD_ID", "privacy-policy/handler.mjs", "privacy-policy/editor.js", "node_modules/runtime.js", "unreviewed-file.js"]:
            with self.subTest(name=name), tempfile.TemporaryDirectory() as directory:
                base, candidate = roots(directory)
                write(candidate, name, b"unreviewed change")
                with self.assertRaises(AssertionError): links.verify(base, candidate, CONFIGS, REVIEWED, ORIGINAL)
        for kind in ["deleted", "symlink"]:
            with self.subTest(kind=kind), tempfile.TemporaryDirectory() as directory:
                base, candidate = roots(directory)
                if kind == "deleted": (candidate / "privacy-policy/editor.js").unlink()
                else:
                    (candidate / "node_modules/retained-link").unlink()
                    (candidate / "node_modules/retained-link").symlink_to("elsewhere.js")
                with self.assertRaises(AssertionError): links.verify(base, candidate, CONFIGS, REVIEWED, ORIGINAL)

    def test_original_missing_unreviewed_or_symlinked_links_are_rejected(self):
        for kind in ["missing", "unreviewed", "symlink"]:
            with self.subTest(kind=kind), tempfile.TemporaryDirectory() as directory:
                base, candidate = roots(directory)
                target = base / links.IMAGE_PATH
                if kind == "unreviewed": target.write_bytes(b"another release")
                else:
                    target.unlink()
                    if kind == "symlink":
                        write(base, "old-links.js", ORIGINAL)
                        target.symlink_to("../old-links.js")
                with self.assertRaises(AssertionError): links.verify(base, candidate, CONFIGS, REVIEWED, ORIGINAL)

    def test_empty_unchanged_nonreviewed_missing_or_symlinked_candidate_payload_is_rejected(self):
        for kind in ["empty", "unchanged", "nonreviewed", "missing", "symlink"]:
            with self.subTest(kind=kind), tempfile.TemporaryDirectory() as directory:
                base, candidate = roots(directory)
                reviewed = b"" if kind == "empty" else ORIGINAL if kind == "unchanged" else REVIEWED
                target = candidate / links.IMAGE_PATH
                if kind == "nonreviewed": target.write_bytes(b"unreviewed script")
                elif kind in {"missing", "symlink"}:
                    target.unlink()
                    if kind == "symlink":
                        write(candidate, "replacement.js", REVIEWED)
                        target.symlink_to("../replacement.js")
                else: target.write_bytes(reviewed)
                with self.assertRaises(AssertionError): links.verify(base, candidate, CONFIGS, reviewed, ORIGINAL)

    def test_missing_combined_or_standalone_runtime_markers_are_rejected(self):
        for name in sorted(links.REQUIRED_FILES) + ["apps/web/.next"]:
            with self.subTest(name=name), tempfile.TemporaryDirectory() as directory:
                base, candidate = roots(directory)
                target = base / name
                if target.is_dir(): shutil.rmtree(target)
                else: target.unlink()
                with self.assertRaises(AssertionError): links.verify(base, candidate, CONFIGS, REVIEWED, ORIGINAL)

    def test_any_docker_config_or_original_layer_change_is_rejected(self):
        for kind in ["env", "command", "user", "workdir", "layer", "removed-layer", "empty-base"]:
            with self.subTest(kind=kind), tempfile.TemporaryDirectory() as directory:
                base, candidate = roots(directory)
                configs = copy.deepcopy(CONFIGS)
                if kind in {"env", "command", "user", "workdir"}:
                    field = {"env": "Env", "command": "Cmd", "user": "User", "workdir": "WorkingDir"}[kind]
                    configs[1]["Config"][field] = "different"
                elif kind == "layer": configs[1]["RootFS"]["Layers"][0] = "foreign-base"
                elif kind == "removed-layer": configs[1]["RootFS"]["Layers"] = ["base"]
                else: configs[0]["RootFS"]["Layers"] = []
                with self.assertRaises(AssertionError): links.verify(base, candidate, configs, REVIEWED, ORIGINAL)


class Composition(unittest.TestCase):
    def test_historical_bytes_are_read_from_only_the_fixed_reviewed_commit(self):
        with mock.patch.object(links.subprocess, "check_output", return_value=ORIGINAL) as read:
            self.assertEqual(links.historical_links(), ORIGINAL)
            read.assert_called_once_with(["git", "show", "32a1e35402f6855ef138a6e54065e65cc7cba249:deploy/privacy-policy/links.js"], cwd=ROOT)
        actual = subprocess.check_output(["git", "show", "32a1e35402f6855ef138a6e54065e65cc7cba249:deploy/privacy-policy/links.js"], cwd=ROOT)
        self.assertEqual(links.historical_links(), actual)
        self.assertTrue(actual)

    def test_actual_composition_copies_only_links_into_one_additive_layer(self):
        with tempfile.TemporaryDirectory() as directory:
            fixture, _ = roots(Path(directory) / "fixture")
            work = Path(directory) / "work"
            args = SimpleNamespace(base=BASE_IMAGE, tag=TAG, work=str(work), report=str(Path(directory) / "report.json"))
            def extract(image, target):
                shutil.copytree(fixture, target, symlinks=True)
                if image == TAG: write(target, links.IMAGE_PATH, (work / "overlay" / links.IMAGE_PATH).read_bytes())
            with mock.patch.object(links, "historical_links", return_value=ORIGINAL), mock.patch.object(links, "reviewed_links", return_value=REVIEWED), mock.patch.object(links.composer, "extract", side_effect=extract), mock.patch.object(links.composer, "docker", return_value=json.dumps(CONFIGS)), mock.patch.object(links.subprocess, "run") as build, contextlib.redirect_stdout(io.StringIO()):
                links.compose(args)
            build.assert_called_once_with(["docker", "build", "--pull=false", "-t", TAG, str(work)], check=True)
            self.assertEqual((work / "Dockerfile").read_text(), "FROM " + BASE_IMAGE + "\nCOPY --chown=node:node overlay/ /app/\n")
            self.assertEqual(set(links.composer.fingerprints(work / "overlay")), {links.IMAGE_PATH})
            self.assertEqual((work / "overlay" / links.IMAGE_PATH).read_bytes(), REVIEWED)
            self.assertEqual(work.stat().st_mode & 0o777, 0o700)
            self.assertEqual(json.loads(Path(args.report).read_text())["changed_files"], [links.IMAGE_PATH])

    def test_unreviewed_live_original_stops_before_any_docker_build(self):
        with tempfile.TemporaryDirectory() as directory:
            fixture, _ = roots(Path(directory) / "fixture")
            write(fixture, links.IMAGE_PATH, b"independent newer runtime")
            args = SimpleNamespace(base=BASE_IMAGE, tag=TAG, work=str(Path(directory) / "work"), report=str(Path(directory) / "report.json"))
            with mock.patch.object(links, "historical_links", return_value=ORIGINAL), mock.patch.object(links, "reviewed_links", return_value=REVIEWED), mock.patch.object(links.composer, "extract", side_effect=lambda _image, target: shutil.copytree(fixture, target, symlinks=True)), mock.patch.object(links.subprocess, "run") as build:
                with self.assertRaises(AssertionError): links.compose(args)
                build.assert_not_called()
            self.assertFalse(Path(args.report).exists())

    def test_unscoped_mutable_base_tags_and_stale_workspaces_fail_closed(self):
        for base, tag in [(BASE_IMAGE.replace("@sha256:", ":latest-"), TAG), ("acrhidiprod0927.azurecr.io/hidi-web:" + "a" * 40, TAG), (BASE_IMAGE, "other.azurecr.io/hidi-web:123"), (BASE_IMAGE, TAG + "\nCOPY extra /app/")]:
            with self.subTest(base=base, tag=tag), tempfile.TemporaryDirectory() as directory, mock.patch.object(links.composer, "extract") as extract:
                args = SimpleNamespace(base=base, tag=tag, work=str(Path(directory) / "work"), report=str(Path(directory) / "report.json"))
                with self.assertRaises(AssertionError): links.compose(args)
                extract.assert_not_called()
        with tempfile.TemporaryDirectory() as directory, mock.patch.object(links, "historical_links", return_value=ORIGINAL), mock.patch.object(links, "reviewed_links", return_value=REVIEWED), mock.patch.object(links.composer, "extract") as extract:
            work = Path(directory) / "work"; (work / "overlay").mkdir(parents=True)
            args = SimpleNamespace(base=BASE_IMAGE, tag=TAG, work=str(work), report=str(Path(directory) / "report.json"))
            with self.assertRaises(AssertionError): links.compose(args)
            extract.assert_not_called()


if __name__ == "__main__":
    unittest.main()
