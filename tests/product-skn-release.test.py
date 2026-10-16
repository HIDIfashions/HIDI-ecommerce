"""Exercise release ownership, SQL readiness and additive-image guarantees."""
import copy
from datetime import datetime, timedelta, timezone
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("product_skn_release", Path(__file__).resolve().parents[1] / "deploy/product-skn/release.py")
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


class RolloutGuards(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.stack = []
        for owner, key, value in ((release, "PRIVATE", Path(self.temp.name) / "private"), (release, "EVIDENCE", Path(self.temp.name) / "evidence")):
            self.mock(owner, key, value)
        release.PRIVATE.mkdir()
        release.EVIDENCE.mkdir()
        self.before = {}
        self.targets = {}
        for index, name in enumerate(("hidi-api", "hidi-web")):
            self.before[name] = {"image": release.images.REGISTRY + "/" + name + "@sha256:" + str(index + 1) * 64, "settingsHash": hashlib.sha256(("settings-" + name).encode()).hexdigest(), "latest": name + "--original", "ready": name + "--original", "mode": "Single"}
            self.targets[name] = release.images.REGISTRY + "/" + name + "@sha256:" + str(index + 3) * 64
            (release.PRIVATE / (name + ".json")).write_text(json.dumps(self.before[name]))
            release.save(name + "-backup.json", {"verified": True, "originalImage": self.before[name]["image"], "settingsHash": self.before[name]["settingsHash"], "digest": self.before[name]["image"].split("@", 1)[1]})
            release.save(name.removeprefix("hidi-") + "-preservation.json", {"passed": True, "baseImage": self.before[name]["image"], "candidateTag": "owned-" + name})
        self.schema = {"passed": True, "featureReady": True, "apiImage": self.before["hidi-api"]["image"], "apiSettingsHash": self.before["hidi-api"]["settingsHash"], "privateNetwork": True, "managedIdentity": True, "databaseHash": hashlib.sha256(b"database").hexdigest(), "ownerDefinitionVerificationRequired": False}
        release.save("schema-ready.json", self.schema)
        release.save("taxonomy-ready.json", {**self.schema, "taxonomyReady": True})
        release.save("candidate.json", {"passed": True, "actualRetainedImages": True, "mainPhotoPayloadVerified": True, "photoLimitBytes": 12 * 1024 * 1024})
        release.save("candidate-images.json", {"passed": True, "images": {name: {"verified": True, "image": target, "baseImage": self.before[name]["image"], "candidateTag": "owned-" + name} for name, target in self.targets.items()}})
        release.save("public-before.json", {"fixture": "retained"})
        self.env = patch.dict(os.environ, {"GITHUB_RUN_ID": "fixture", "GITHUB_SHA": "fixture-source", "API_IMAGE": self.targets["hidi-api"], "WEB_IMAGE": self.targets["hidi-web"]})
        self.env.start()
        self.addCleanup(self.env.stop)
        self.current = copy.deepcopy(self.before)
        self.writes = []
        self.mock(release.cloud, "app", lambda name: copy.deepcopy(self.current[name]))
        self.mock(release.cloud, "snapshot", lambda data: copy.deepcopy(data))
        self.mock(release.cloud, "ready", lambda state: None)
        self.mock(release.photo, "public_state", lambda: {"fixture": "retained"})
        self.mock(release, "verify_live", lambda: None)
        self.mock(release.photo, "wait_ready", lambda name, image, suffix: copy.deepcopy(self.current[name]))

        def write(data, image, suffix):
            name = next(name for name in self.current if data["settingsHash"] == self.before[name]["settingsHash"])
            self.current[name].update(image=image, latest=name + "--" + suffix, ready=name + "--" + suffix)
            self.writes.append((name, image, suffix))
        self.mock(release.cloud, "write_image", write)

    def mock(self, owner, name, value):
        item = patch.object(owner, name, value)
        item.start()
        self.addCleanup(item.stop)

    def test_success_rolls_api_then_web_with_retained_settings(self):
        release.apply()
        self.assertEqual([name for name, _, _ in self.writes], ["hidi-api", "hidi-web"])
        for name in self.before:
            self.assertEqual(self.current[name]["image"], self.targets[name])
            self.assertEqual(self.current[name]["settingsHash"], self.before[name]["settingsHash"])
        self.assertTrue(release.read("after.json")["sqlMappingRetainedOnRollback"])

    def test_failed_live_check_restores_owned_images_and_keeps_sql(self):
        self.mock(release, "verify_live", lambda: (_ for _ in ()).throw(AssertionError("fixture live failure")))
        with self.assertRaisesRegex(AssertionError, "live failure"):
            release.apply()
        self.assertEqual([name for name, _, _ in self.writes], ["hidi-api", "hidi-web", "hidi-web", "hidi-api"])
        for name in self.before:
            self.assertEqual(self.current[name]["image"], self.before[name]["image"])
        self.assertEqual(release.read("rollback.json")["sqlSchemaRemoved"], False)

    def test_independent_api_change_is_not_overwritten_during_recovery(self):
        def fail():
            self.current["hidi-api"].update(image=release.images.REGISTRY + "/hidi-api@sha256:" + "5" * 64, settingsHash="independent")
            raise AssertionError("independent change")
        self.mock(release, "verify_live", fail)
        with self.assertRaisesRegex(AssertionError, "independent change"):
            release.apply()
        self.assertEqual([name for name, _, _ in self.writes], ["hidi-api", "hidi-web", "hidi-web"])
        self.assertEqual(release.read("rollback.json")["apps"]["hidi-api"], "independent-change-not-overwritten")

    def test_same_image_new_revision_is_not_owned_for_rollback(self):
        def fail():
            self.current["hidi-web"].update(latest="hidi-web--independent", ready="hidi-web--independent")
            raise AssertionError("independent revision")
        self.mock(release, "verify_live", fail)
        with self.assertRaisesRegex(AssertionError, "independent revision"):
            release.apply()
        self.assertEqual([name for name, _, _ in self.writes], ["hidi-api", "hidi-web", "hidi-api"])
        self.assertEqual(self.current["hidi-web"]["latest"], "hidi-web--independent")

    def test_missing_schema_blocks_before_any_rollout(self):
        release.save("schema-ready.json", {**self.schema, "featureReady": False})
        with self.assertRaisesRegex(AssertionError, "SQL owner"):
            release.apply()
        self.assertEqual(self.writes, [])

    def test_stale_schema_binding_blocks_before_any_rollout(self):
        release.save("schema-ready.json", {**self.schema, "apiSettingsHash": "old-settings"})
        with self.assertRaisesRegex(AssertionError, "match captured API"):
            release.apply()
        self.assertEqual(self.writes, [])

    def test_missing_taxonomy_blocks_before_any_rollout(self):
        release.save("taxonomy-ready.json", {**self.schema, "taxonomyReady": False})
        with self.assertRaisesRegex(AssertionError, "Ananya collection"):
            release.apply()
        self.assertEqual(self.writes, [])

    def test_hidden_definition_requires_owner_evidence(self):
        release.save("schema-ready.json", {**self.schema, "ownerDefinitionVerificationRequired": True, "expectedOwnerSchemaHash": "a" * 64})
        with self.assertRaises(FileNotFoundError):
            release.apply()
        self.assertEqual(self.writes, [])
        release.save("owner-migration.json", {**self.schema, "definitionsVerified": True, "ownerSchemaHash": "a" * 64, "migrationSha256": hashlib.sha256((release.HERE / "migration.sql").read_bytes()).hexdigest(), "ownerMigrationExecuted": True, "pitrCheckpointVerified": True})
        release.apply()
        self.assertEqual(len(self.writes), 2)

    def test_changed_backup_digest_blocks_before_any_rollout(self):
        report = release.read("hidi-web-backup.json")
        release.save("hidi-web-backup.json", {**report, "digest": "sha256:" + "9" * 64})
        with self.assertRaisesRegex(AssertionError, "rollback backup"):
            release.apply()
        self.assertEqual(self.writes, [])

    def test_unverified_published_digest_blocks_before_any_rollout(self):
        report = release.read("candidate-images.json")
        report["images"]["hidi-web"]["image"] = release.images.REGISTRY + "/hidi-web@sha256:" + "9" * 64
        release.save("candidate-images.json", report)
        with self.assertRaisesRegex(AssertionError, "tested candidate"):
            release.apply()
        self.assertEqual(self.writes, [])

    def test_concurrent_setting_change_blocks_before_any_rollout(self):
        self.current["hidi-web"]["settingsHash"] = "independent"
        with self.assertRaisesRegex(AssertionError, "Concurrent application change"):
            release.apply()
        self.assertEqual(self.writes, [])

    def test_failed_api_rollback_does_not_prevent_web_recovery(self):
        original_write = release.cloud.write_image
        def write(data, image, suffix):
            if suffix.startswith("sknrollbackapi"):
                raise RuntimeError("fixture rollback unavailable")
            original_write(data, image, suffix)
        self.mock(release.cloud, "write_image", write)
        self.mock(release, "verify_live", lambda: (_ for _ in ()).throw(AssertionError("fixture failure")))
        with self.assertRaisesRegex(AssertionError, "fixture failure"):
            release.apply()
        self.assertEqual(self.current["hidi-web"]["image"], self.before["hidi-web"]["image"])
        self.assertEqual(release.read("rollback.json")["apps"]["hidi-api"], "recovery-failed-review-required")

    def owner_attestation(self):
        self.schema.update(ownerDefinitionVerificationRequired=True, expectedOwnerSchemaHash="a" * 64)
        release.save("schema-ready.json", self.schema)
        self.now = datetime(2026, 10, 10, 18, 0, tzinfo=timezone.utc)
        self.mock(release, "utc_now", lambda: self.now)
        return {"passed": True, "definitionsVerified": True, "databaseHash": self.schema["databaseHash"], "ownerSchemaHash": "a" * 64, "migrationSha256": hashlib.sha256((release.HERE / "migration.sql").read_bytes()).hexdigest(), "apiImage": self.before["hidi-api"]["image"], "apiSettingsHash": self.before["hidi-api"]["settingsHash"], "verifiedAtUtc": (self.now - timedelta(minutes=5)).isoformat().replace("+00:00", "Z")}

    def test_valid_manual_owner_evidence_is_saved_without_cloud_or_sql_writes(self):
        report = self.owner_attestation()
        with patch.dict(os.environ, {"HIDI_SKN_OWNER_DEFINITION_REPORT": json.dumps(report)}):
            release.owner_evidence()
        self.assertEqual(release.read("owner-migration.json"), report)
        self.assertEqual(self.writes, [])

    def test_missing_hidden_definition_report_has_concrete_retry_instruction(self):
        self.owner_attestation()
        with patch.dict(os.environ, {"HIDI_SKN_OWNER_DEFINITION_REPORT": ""}):
            with self.assertRaisesRegex(AssertionError, "workflow_dispatch with owner_definition_report"):
                release.owner_evidence()
        self.assertFalse((release.EVIDENCE / "owner-migration.json").exists())

    def test_owner_evidence_size_is_bounded_before_json_parsing(self):
        self.owner_attestation()
        with patch.dict(os.environ, {"HIDI_SKN_OWNER_DEFINITION_REPORT": "{" + " " * 8192}):
            with self.assertRaisesRegex(AssertionError, "8192-byte limit"):
                release.owner_evidence()

    def test_owner_evidence_rejects_wrong_database_schema_migration_and_capture(self):
        report = self.owner_attestation()
        for field in ("databaseHash", "ownerSchemaHash", "migrationSha256", "apiSettingsHash"):
            with self.subTest(field=field):
                wrong = {**report, field: "f" * 64}
                with self.assertRaises(AssertionError):
                    release.validate_owner_report(wrong, self.schema, self.before["hidi-api"], supplied=True)
        with self.assertRaisesRegex(AssertionError, "fresh API capture"):
            release.validate_owner_report({**report, "apiImage": release.images.REGISTRY + "/hidi-api@sha256:" + "f" * 64}, self.schema, self.before["hidi-api"], supplied=True)

    def test_owner_evidence_rejects_old_future_and_non_utc_timestamps(self):
        report = self.owner_attestation()
        for stamp in ((self.now - timedelta(hours=24, seconds=1)).isoformat(), (self.now + timedelta(seconds=1)).isoformat(), "2026-10-10T18:00:00", "2026-10-10T18:00:00+05:30", "2026-13-10T18:00:00Z"):
            with self.subTest(timestamp=stamp):
                with self.assertRaisesRegex(AssertionError, "timestamp|24 hours"):
                    release.validate_owner_report({**report, "verifiedAtUtc": stamp}, self.schema, self.before["hidi-api"], supplied=True)

    def test_owner_evidence_rejects_extra_fields_and_duplicate_json_keys(self):
        report = self.owner_attestation()
        with self.assertRaisesRegex(AssertionError, "bounded contract"):
            release.validate_owner_report({**report, "notes": "unexpected"}, self.schema, self.before["hidi-api"], supplied=True)
        duplicate = json.dumps(report)[:-1] + ',"passed":true}'
        with patch.dict(os.environ, {"HIDI_SKN_OWNER_DEFINITION_REPORT": duplicate}):
            with self.assertRaisesRegex(AssertionError, "duplicate fields"):
                release.owner_evidence()

    def test_existing_automatic_owner_evidence_is_reused_with_its_richer_proof(self):
        report = self.owner_attestation()
        report.pop("verifiedAtUtc")
        report.update(ownerMigrationExecuted=True, pitrCheckpointVerified=True, featureReady=True, extraGuardEvidence="retained")
        release.save("owner-migration.json", report)
        with patch.dict(os.environ, {"HIDI_SKN_OWNER_DEFINITION_REPORT": ""}):
            release.owner_evidence()
        self.assertEqual(release.read("owner-migration.json"), report)
        self.assertEqual(self.writes, [])

    def test_visible_definitions_do_not_require_an_imported_owner_report(self):
        with patch.dict(os.environ, {"HIDI_SKN_OWNER_DEFINITION_REPORT": ""}):
            release.owner_evidence()
        self.assertFalse((release.EVIDENCE / "owner-migration.json").exists())
        self.assertEqual(self.writes, [])


class ImageGuards(unittest.TestCase):
    def test_additive_overlay_preserves_unrelated_assets_layers_and_config(self):
        with tempfile.TemporaryDirectory() as folder:
            base, candidate, overlay = (Path(folder) / name for name in ("base", "candidate", "overlay"))
            for path in (base, candidate, overlay):
                path.mkdir()
            (base / "old-asset.js").write_text("immutable cached asset")
            (candidate / "old-asset.js").write_text("immutable cached asset")
            (base / "reviewed.js").write_text("before")
            (candidate / "reviewed.js").write_text("after")
            (overlay / "reviewed.js").write_text("after")
            (candidate / "new-asset.js").write_text("new immutable URL")
            (overlay / "new-asset.js").write_text("new immutable URL")
            configs = [{"Config": {"Env": ["retained"]}, "RootFS": {"Layers": ["old"]}}, {"Config": {"Env": ["retained"]}, "RootFS": {"Layers": ["old", "overlay"]}}]
            allowed = {"reviewed.js", "new-asset.js"}
            self.assertTrue(release.verify(base, candidate, overlay, allowed, configs)["passed"])
            (candidate / "old-asset.js").write_text("unreviewed")
            with self.assertRaisesRegex(AssertionError, "Unreviewed runtime"):
                release.verify(base, candidate, overlay, allowed, configs)
            (candidate / "old-asset.js").write_text("immutable cached asset")
            broken = copy.deepcopy(configs)
            broken[1]["Config"]["Env"] = ["changed"]
            with self.assertRaisesRegex(AssertionError, "runtime configuration"):
                release.verify(base, candidate, overlay, allowed, broken)
            broken = copy.deepcopy(configs)
            broken[1]["RootFS"]["Layers"] = ["rebuilt", "overlay"]
            with self.assertRaisesRegex(AssertionError, "Retained image layers"):
                release.verify(base, candidate, overlay, allowed, broken)


if __name__ == "__main__":
    unittest.main()
