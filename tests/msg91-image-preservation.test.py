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


if __name__ == "__main__": unittest.main()
