"""Check that the image composition rejects loss of landing/admin/runtime payloads."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("compose", Path(__file__).resolve().parents[1] / "deploy/compose-msg91-images.py")
compose = importlib.util.module_from_spec(spec)
spec.loader.exec_module(compose)
CONFIGS = [{"Config": {"Cmd": ["node", "server.mjs"]}, "RootFS": {"Layers": ["base"]}}, {"Config": {"Cmd": ["node", "server.mjs"]}, "RootFS": {"Layers": ["base", "auth"]}}]


class Preservation(unittest.TestCase):
    def roots(self, directory, app):
        before, after = Path(directory) / "before", Path(directory) / "after"
        files = {"apps/api/dist/auth/supabase-auth.service.js": "old", "apps/api/dist/main.js": "keep"} if app == "api" else {"dist/index.html": "hero", "dist/packing-scanner-control.html": "scanner", "server.mjs": "runtime", "hero-media.mjs": "media", "apps/web/.next/server/app/account.html": "old", "apps/web/public/logo.svg": "keep"}
        for root in [before, after]:
            for name, value in files.items():
                target = root / name; target.parent.mkdir(parents=True, exist_ok=True); target.write_text(value)
        key = "apps/api/dist/auth/supabase-auth.service.js" if app == "api" else "apps/web/.next/server/app/account.html"
        (after / key).write_text("new")
        return before, after

    def test_only_compiled_auth_can_change_in_api(self):
        with tempfile.TemporaryDirectory() as directory:
            before, after = self.roots(directory, "api")
            self.assertTrue(compose.verify(before, after, "api", CONFIGS)["passed"])
            (after / "apps/api/dist/main.js").write_text("unexpected")
            with self.assertRaises(AssertionError): compose.verify(before, after, "api", CONFIGS)

    def test_next_changes_preserve_hero_scanner_and_runtime(self):
        for name in ["dist/index.html", "dist/packing-scanner-control.html", "server.mjs", "hero-media.mjs", "apps/web/public/logo.svg"]:
            with tempfile.TemporaryDirectory() as directory:
                before, after = self.roots(directory, "web")
                self.assertTrue(compose.verify(before, after, "web", CONFIGS)["passed"])
                (after / name).write_text("unexpected")
                with self.assertRaises(AssertionError): compose.verify(before, after, "web", CONFIGS)

    def test_runtime_configuration_and_ancestor_layers_cannot_change(self):
        for field in ["Config", "RootFS"]:
            with tempfile.TemporaryDirectory() as directory:
                before, after = self.roots(directory, "api")
                configs = json.loads(json.dumps(CONFIGS))
                configs[1][field] = {"Cmd": ["different"]} if field == "Config" else {"Layers": ["unrelated", "auth"]}
                with self.assertRaises(AssertionError): compose.verify(before, after, "api", configs)


class WebOverlay(unittest.TestCase):
    def write_files(self, root, files):
        for name, contents in files.items():
            target = root / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(contents)

    def test_standalone_dependencies_and_public_files_never_enter_overlay(self):
        """Standalone tracing includes dependencies that the existing image must retain."""
        build = {
            "apps/web/server.js": "new Next server",
            "apps/web/.next/BUILD_ID": "new-build-id",
            "apps/web/.next/required-server-files.json": "new Next metadata",
            "apps/web/.next/server/app/account.html": "new auth page",
            "apps/web/.next/server/chunks/auth.js": "new auth chunk",
        }
        extraneous = {
            "package.json": "root package must not change",
            "node_modules/next/package.json": "root Next dependency must not change",
            "node_modules/react/index.js": "root React dependency must not change",
            "node_modules/.pnpm/esbuild@0.28.2/node_modules/esbuild/package.json": "traced esbuild dependency must not enter the image",
            "node_modules/.pnpm/webpack@5.100.2/node_modules/webpack/package.json": "traced webpack dependency must not enter the image",
            "apps/web/package.json": "web package must not change",
            "apps/web/node_modules/sharp/index.js": "web dependency must not change",
            "apps/web/public/logo.svg": "existing public asset must not change",
            "public/hero.jpg": "root public asset must not change",
            "dist/index.html": "landing must not change",
            "dist/packing-scanner-control.html": "scanner must not change",
            "server.mjs": "runtime must not change",
            "hero-media.mjs": "hero runtime must not change",
        }
        static_files = {
            "chunks/auth.js": "new browser auth chunk",
            "css/auth.css": "new browser auth styles",
        }
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            standalone, static, overlay = root / "standalone", root / "static", root / "overlay"
            self.write_files(standalone, {**build, **extraneous})
            self.write_files(static, static_files)
            (standalone / "node_modules/empty-package").mkdir()

            compose.copy_web_overlay(standalone, static, overlay)

            expected = {**build, **{"apps/web/.next/static/" + name: value for name, value in static_files.items()}}
            actual = {item.relative_to(overlay).as_posix(): item.read_text() for item in overlay.rglob("*") if item.is_file()}
            self.assertEqual(actual, expected)
            expected_paths = set(expected)
            for name in expected:
                expected_paths.update(parent.as_posix() for parent in Path(name).parents if parent != Path("."))
            self.assertEqual({item.relative_to(overlay).as_posix() for item in overlay.rglob("*")}, expected_paths)

    def test_missing_next_build_or_server_fails_before_copying(self):
        for missing in ["server", "build"]:
            with self.subTest(missing=missing), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                standalone, static, overlay = root / "standalone", root / "static", root / "overlay"
                self.write_files(standalone, {"apps/web/server.js": "new server"})
                (standalone / "apps/web/.next").mkdir()
                self.write_files(static, {"chunks/auth.js": "new browser chunk"})
                if missing == "server":
                    (standalone / "apps/web/server.js").unlink()
                else:
                    (standalone / "apps/web/.next").rmdir()

                with self.assertRaises(AssertionError):
                    compose.copy_web_overlay(standalone, static, overlay)
                self.assertFalse(overlay.exists())


if __name__ == "__main__": unittest.main()
