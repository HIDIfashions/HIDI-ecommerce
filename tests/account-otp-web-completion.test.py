"""Exercise web-only ARM writes, raw settings guards and owned recovery with no API writes."""
import contextlib
import copy
import importlib.util
import io
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import sys
import tempfile
import time
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "deploy"))


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


completion = load("web_completion", "deploy/complete-account-otp-web.py")
proof = load("live_api_proof", "deploy/verify-account-otp-live-api.py")
OLD_WEB = "acrhidiprod0927.azurecr.io/hidi-web@sha256:" + "a" * 64
NEW_WEB = "acrhidiprod0927.azurecr.io/hidi-web@sha256:" + "b" * 64
OTHER_WEB = "acrhidiprod0927.azurecr.io/hidi-web@sha256:" + "c" * 64


def resource(app, image, revision):
    return {
        "location": "centralindia", "identity": {"type": "SystemAssigned"}, "tags": {"purpose": "storefront"},
        "properties": {
            "environmentId": "/unchanged/environment", "managedEnvironmentId": "/unchanged/legacy", "workloadProfileName": "Consumption",
            "provisioningState": "Succeeded", "latestRevisionName": revision, "latestReadyRevisionName": revision,
            "template": {
                "revisionSuffix": revision.split("--")[-1], "scale": {"minReplicas": 1, "maxReplicas": 1, "cooldownPeriod": None, "pollingInterval": None},
                "volumes": [{"name": "unchanged", "storageType": "EmptyDir"}], "initContainers": None,
                "containers": [{"name": app, "image": image, "resources": {"cpu": 1, "memory": "2Gi", "ephemeralStorage": "4Gi"},
                    "env": [{"name": "PRIVATE_SECRET_REF", "secretRef": "private-ref-never-log"}, {"name": "NULL_SECRET_REF", "secretRef": "private-null-ref", "value": None}, {"name": "INLINE_PRIVATE", "value": "inline-secret-never-log"}],
                    "probes": [{"type": "Readiness", "httpGet": {"path": "/health", "port": 3000}, "periodSeconds": 10}],
                    "command": None, "args": None, "volumeMounts": [{"mountPath": "/tmp/existing", "volumeName": "unchanged"}]}],
            },
            "configuration": {"activeRevisionsMode": "Single", "secrets": [{"name": "existing", "value": "private-config-never-log"}],
                "ingress": {"external": True, "targetPort": 3000, "traffic": [{"revisionName": revision, "weight": 100}]}, "registries": [{"server": "unchanged.registry", "identity": "system"}]},
        },
    }


class VirtualCloud:
    def __init__(self, scenario="success"):
        self.scenario = scenario
        self.apps = {"hidi-api": resource("hidi-api", completion.LIVE_API, completion.API_REVISION), "hidi-web": resource("hidi-web", OLD_WEB, "hidi-web--old")}
        self.calls, self.job = [], None
        self.writes = 0

    def read(self, app):
        self.calls.append(("GET", app))
        return copy.deepcopy(self.apps[app])

    def patch(self, body, path):
        self.calls.append(("PATCH", "hidi-web", copy.deepcopy(body)))
        self.writes += 1
        if self.scenario == "patch-not-accepted" and self.writes == 1:
            raise completion.CompletionFailure("Private provider response must not be logged")
        if self.scenario == "accepted-pending-baseline" and self.writes == 1:
            self.apps["hidi-web"]["properties"]["provisioningState"] = "Updating"
            raise completion.CompletionFailure("Accepted web operation response was interrupted")
        web = self.apps["hidi-web"]
        web["properties"]["template"].update(copy.deepcopy(body["properties"]["template"]))
        revision = "hidi-web--" + body["properties"]["template"]["revisionSuffix"]
        web["properties"]["latestRevisionName"] = revision
        web["properties"]["latestReadyRevisionName"] = revision
        if self.writes == 1:
            if self.scenario == "accepted-patch-error": raise completion.CompletionFailure("Unlogged Azure error")
            if self.scenario == "term": self.job.signal(signal.SIGTERM, None)
            if self.scenario == "int": self.job.signal(signal.SIGINT, None)
            if self.scenario == "api-image": self.apps["hidi-api"]["properties"]["template"]["containers"][0]["image"] = completion.LIVE_API.replace("69d4", "aaaa", 1)
            if self.scenario == "api-config": self.apps["hidi-api"]["tags"]["purpose"] = "independent"
            if self.scenario == "api-revision": self.apps["hidi-api"]["properties"]["latestRevisionName"] = self.apps["hidi-api"]["properties"]["latestReadyRevisionName"] = "hidi-api--independent"
            if self.scenario == "web-image": web["properties"]["template"]["containers"][0]["image"] = OTHER_WEB
            if self.scenario == "web-revision": web["properties"]["latestRevisionName"] = web["properties"]["latestReadyRevisionName"] = "hidi-web--independent"
            if self.scenario == "web-env": web["properties"]["template"]["containers"][0]["env"][0]["secretRef"] = "independent-private-key"
            if self.scenario == "web-null-default": web["properties"]["template"]["scale"]["cooldownPeriod"] = 300
            if self.scenario == "web-empty-secret": web["properties"]["template"]["containers"][0]["env"][0]["value"] = ""
            if self.scenario == "not-ready": web["properties"]["latestReadyRevisionName"] = "hidi-web--old"
            if self.scenario == "provisioning-failed": web["properties"]["provisioningState"] = "Failed"
        else:
            if self.scenario == "rollback-failed": raise completion.CompletionFailure("Unlogged rollback error")
            web["properties"]["provisioningState"] = "Succeeded"

    def probes(self):
        if self.scenario in {"health-failed", "rollback-failed"}:
            raise completion.CompletionFailure("Read-only readiness failure")
        if self.scenario == "final-drift": self.apps["hidi-web"]["tags"]["purpose"] = "independent"
        if self.scenario == "final-provisioning": self.apps["hidi-web"]["properties"]["provisioningState"] = "Updating"
        return [{"path": "/account/policy", "status": 200}]


class WebOnlyRollout(unittest.TestCase):
    def run_job(self, scenario="success", before_mutation=None):
        cloud = VirtualCloud(scenario)
        with tempfile.TemporaryDirectory() as directory:
            baseline = Path(directory) / "private" / "before"
            for app, data in cloud.apps.items(): completion.private_json(baseline / (app + ".json"), data)
            hash_before = completion.snapshot(cloud.apps["hidi-api"])["settingsHash"]
            with mock.patch.object(completion, "API_SETTINGS_HASH", hash_before), mock.patch.object(completion, "azure_read", side_effect=cloud.read), mock.patch.object(completion, "azure_patch_web", side_effect=cloud.patch), mock.patch.object(completion, "public_probes", side_effect=cloud.probes), mock.patch.object(completion.time, "sleep"), contextlib.redirect_stdout(io.StringIO()) as output, contextlib.redirect_stderr(io.StringIO()) as errors:
                job = completion.Completion(baseline, OLD_WEB, NEW_WEB, int(time.time()) + (60 if scenario == "deadline" else 7200), "12345", Path(directory) / "evidence" / "rollout.json")
                cloud.job = job
                if before_mutation: before_mutation(cloud.apps)
                code = job.run()
                evidence = json.loads(job.report.read_text())
            private = ["private-ref-never-log", "inline-secret-never-log", "private-config-never-log", "PRIVATE_SECRET_REF", "independent-private-key"]
            for value in private:
                self.assertNotIn(value, json.dumps(evidence) + output.getvalue() + errors.getvalue())
            self.assertFalse(any(call[0] == "PATCH" and call[1] == "hidi-api" for call in cloud.calls))
            self.assertFalse(evidence["apiWritten"])
            return code, cloud, evidence

    def test_success_writes_only_web_and_leaves_exact_api_and_raw_settings_unchanged(self):
        code, cloud, evidence = self.run_job()
        self.assertEqual(code, 0)
        self.assertEqual(cloud.writes, 1)
        self.assertEqual(evidence["before"]["hidi-api"], evidence["final"]["hidi-api"])
        self.assertEqual(evidence["before"]["hidi-web"]["settingsHash"], evidence["final"]["hidi-web"]["settingsHash"])
        self.assertEqual(evidence["final"]["hidi-web"]["image"], NEW_WEB)
        body = next(call[2] for call in cloud.calls if call[0] == "PATCH")
        self.assertEqual(set(body), {"location", "properties"})
        self.assertEqual(set(body["properties"]), {"template"})
        self.assertEqual(set(body["properties"]["template"]), {"containers", "revisionSuffix"})
        self.assertEqual(body["location"], "centralindia")

    def test_changed_web_baseline_or_insufficient_deadline_prevents_any_write(self):
        changes = [lambda apps: apps["hidi-web"]["tags"].update(purpose="other"), lambda apps: apps["hidi-web"]["properties"]["template"]["containers"][0].update(image=OTHER_WEB), lambda apps: apps["hidi-web"]["properties"].update(latestReadyRevisionName="different")]
        for mutate in changes:
            with self.subTest(mutation=mutate):
                code, cloud, _ = self.run_job(before_mutation=mutate)
                self.assertNotEqual(code, 0); self.assertEqual(cloud.writes, 0)
        code, cloud, _ = self.run_job("deadline")
        self.assertNotEqual(code, 0); self.assertEqual(cloud.writes, 0)

    def test_unhashed_current_web_updating_state_blocks_every_image_write(self):
        original = resource("hidi-web", OLD_WEB, "hidi-web--old")
        updating = copy.deepcopy(original)
        updating["properties"]["provisioningState"] = "Updating"
        self.assertEqual(completion.snapshot(original), completion.snapshot(updating), "Regression must exercise state outside the settings fingerprint")
        code, cloud, evidence = self.run_job(before_mutation=lambda apps: apps["hidi-web"]["properties"].update(provisioningState="Updating"))
        self.assertNotEqual(code, 0)
        self.assertEqual(cloud.writes, 0)
        self.assertFalse(evidence["webWriteAttempted"])
        self.assertEqual(cloud.apps["hidi-api"]["properties"]["template"]["containers"][0]["image"], completion.LIVE_API)

    def test_readiness_failure_and_accepted_request_error_restore_only_owned_web(self):
        for scenario in ["health-failed", "accepted-patch-error", "not-ready", "provisioning-failed"]:
            with self.subTest(scenario=scenario):
                code, cloud, evidence = self.run_job(scenario)
                self.assertNotEqual(code, 0); self.assertEqual(cloud.writes, 2)
                self.assertEqual(cloud.apps["hidi-web"]["properties"]["template"]["containers"][0]["image"], OLD_WEB)
                self.assertEqual(evidence["rollback"], "owned-web-image-restored")

    def test_interruptions_after_accepted_request_restore_owned_web_and_preserve_exit_code(self):
        for scenario, expected in [("term", 143), ("int", 130)]:
            with self.subTest(signal=scenario):
                code, cloud, evidence = self.run_job(scenario)
                self.assertEqual(code, expected); self.assertEqual(cloud.writes, 2)
                self.assertEqual(evidence["rollback"], "owned-web-image-restored")

    def test_unhashed_provisioning_drift_after_passing_probes_blocks_success_and_restores_owned_web(self):
        code, cloud, evidence = self.run_job("final-provisioning")
        self.assertNotEqual(code, 0)
        self.assertEqual(cloud.writes, 2)
        self.assertEqual(evidence["status"], "failed")
        self.assertEqual(evidence["rollback"], "owned-web-image-restored")
        self.assertEqual(cloud.apps["hidi-web"]["properties"]["template"]["containers"][0]["image"], OLD_WEB)

    def test_api_drift_blocks_success_and_all_further_image_writes(self):
        for scenario in ["api-image", "api-config", "api-revision"]:
            with self.subTest(scenario=scenario):
                code, cloud, evidence = self.run_job(scenario)
                self.assertNotEqual(code, 0); self.assertEqual(cloud.writes, 1)
                self.assertEqual(evidence["rollback"], "refused-or-failed-without-api-write")

    def test_foreign_web_image_revision_or_raw_setting_is_never_overwritten(self):
        for scenario in ["web-image", "web-revision", "web-env", "web-null-default", "web-empty-secret", "final-drift"]:
            with self.subTest(scenario=scenario):
                code, cloud, evidence = self.run_job(scenario)
                self.assertNotEqual(code, 0); self.assertEqual(cloud.writes, 1)
                self.assertEqual(evidence["rollback"], "refused-or-failed-without-api-write")

    def test_unaccepted_request_never_rolls_back_an_unowned_image(self):
        code, cloud, evidence = self.run_job("patch-not-accepted")
        self.assertNotEqual(code, 0); self.assertEqual(cloud.writes, 1)
        self.assertEqual(evidence["rollback"], "baseline-still-active-no-write")

    def test_accepted_pending_request_with_unchanged_fingerprint_is_not_claimed_as_no_write(self):
        code, cloud, evidence = self.run_job("accepted-pending-baseline")
        self.assertNotEqual(code, 0)
        self.assertEqual(cloud.writes, 1)
        self.assertEqual(completion.snapshot(cloud.apps["hidi-web"]), evidence["before"]["hidi-web"])
        self.assertEqual(cloud.apps["hidi-web"]["properties"]["provisioningState"], "Updating")
        self.assertEqual(evidence["rollback"], "refused-or-failed-without-api-write")
        self.assertNotEqual(evidence["rollback"], "baseline-still-active-no-write")

    def test_rollback_failure_is_reported_without_false_success(self):
        code, cloud, evidence = self.run_job("rollback-failed")
        self.assertNotEqual(code, 0); self.assertEqual(cloud.writes, 2)
        self.assertEqual(evidence["status"], "failed")
        self.assertEqual(evidence["rollback"], "refused-or-failed-without-api-write")


class PatchAndPrivateState(unittest.TestCase):
    def test_merge_patch_preserves_absent_null_env_and_all_container_fields_without_globals(self):
        original = resource("hidi-web", OLD_WEB, "hidi-web--old")
        unchanged = copy.deepcopy(original)
        body = completion.image_patch(original, NEW_WEB, "otp-web-123")
        expected = copy.deepcopy(original["properties"]["template"]["containers"])
        expected[0]["image"] = NEW_WEB
        self.assertEqual(body["properties"]["template"]["containers"], expected)
        self.assertNotIn("value", body["properties"]["template"]["containers"][0]["env"][0])
        self.assertIsNone(body["properties"]["template"]["containers"][0]["env"][1]["value"])
        self.assertEqual(original, unchanged)
        for field in ["scale", "volumes", "initContainers", "configuration", "identity", "tags"]:
            self.assertNotIn(field, body["properties"])
            self.assertNotIn(field, body["properties"]["template"])

    def test_patch_rejects_wrong_image_missing_location_and_invalid_suffix(self):
        data = resource("hidi-web", OLD_WEB, "hidi-web--old")
        for image, suffix in [(completion.LIVE_API, "otp-web-1"), (OLD_WEB.replace("@sha256:", ":"), "otp-web-1"), (NEW_WEB, "BAD_SUFFIX")]:
            with self.subTest(image=image, suffix=suffix), self.assertRaises((AssertionError, completion.CompletionFailure)):
                completion.image_patch(data, image, suffix)
        del data["location"]
        with self.assertRaises(completion.CompletionFailure): completion.image_patch(data, NEW_WEB, "otp-web-1")

    def test_real_azure_calls_are_bounded_sanitized_and_patch_only_the_web_resource(self):
        with mock.patch.object(completion.subprocess, "run") as run:
            with self.assertRaises(completion.CompletionFailure): completion.azure_read("other")
            with self.assertRaises(completion.CompletionFailure): completion.azure_patch_web({"properties": {"configuration": {"secrets": []}}}, Path("must-not-write.json"))
            run.assert_not_called()
            run.return_value = subprocess.CompletedProcess([], 1, stdout="raw-private-json", stderr="raw-private-error")
            with self.assertRaisesRegex(completion.CompletionFailure, "^Azure state read failed$"): completion.azure_read("hidi-api")
            self.assertEqual(run.call_args.args[0][0:4], ["az", "rest", "--method", "GET"])
            self.assertTrue(run.call_args.kwargs["capture_output"])
            self.assertEqual(run.call_args.kwargs["timeout"], 180)
            run.return_value = subprocess.CompletedProcess([], 0, stdout="", stderr="")
            with tempfile.TemporaryDirectory() as directory:
                body = completion.image_patch(resource("hidi-web", OLD_WEB, "hidi-web--old"), NEW_WEB, "otp-web-1")
                path = Path(directory) / "private" / "body.json"
                completion.azure_patch_web(body, path)
                command = run.call_args.args[0]
                self.assertEqual(command[:4], ["az", "rest", "--method", "PATCH"])
                self.assertEqual(command[command.index("--url") + 1], completion.resource_url("hidi-web"))
                self.assertEqual(command[command.index("--body") + 1], "@" + str(path))
                self.assertNotIn("secret", " ".join(command))
                self.assertEqual(path.stat().st_mode & 0o777, 0o600)
                self.assertEqual(path.parent.stat().st_mode & 0o777, 0o700)
                self.assertEqual(json.loads(path.read_text()), body)

    def test_capture_and_check_use_fresh_full_hashes_and_never_publish_raw_values(self):
        cloud = VirtualCloud()
        hash_before = completion.snapshot(cloud.apps["hidi-api"])["settingsHash"]
        with tempfile.TemporaryDirectory() as directory, mock.patch.object(completion, "API_SETTINGS_HASH", hash_before), mock.patch.object(completion, "azure_read", side_effect=cloud.read), contextlib.redirect_stdout(io.StringIO()):
            baseline, report = Path(directory) / "private" / "before", Path(directory) / "evidence" / "before.json"
            completion.capture(baseline, OLD_WEB, report)
            self.assertEqual([call[1] for call in cloud.calls], ["hidi-api", "hidi-web", "hidi-api", "hidi-web"])
            self.assertEqual(len(list(baseline.iterdir())), 2)
            self.assertNotIn("inline-secret-never-log", report.read_text())
            completion.check_baseline(baseline, OLD_WEB)
            cloud.apps["hidi-web"]["properties"]["template"]["scale"]["pollingInterval"] = 30
            with self.assertRaises(completion.CompletionFailure): completion.check_baseline(baseline, OLD_WEB)

    def test_private_web_baseline_updating_is_rejected_before_rollout_construction(self):
        cloud = VirtualCloud()
        cloud.apps["hidi-web"]["properties"]["provisioningState"] = "Updating"
        with tempfile.TemporaryDirectory() as directory, mock.patch.object(completion, "API_SETTINGS_HASH", completion.snapshot(cloud.apps["hidi-api"])["settingsHash"]), mock.patch.object(completion, "azure_patch_web") as patch:
            baseline = Path(directory) / "private" / "before"
            for app, data in cloud.apps.items(): completion.private_json(baseline / (app + ".json"), data)
            with self.assertRaisesRegex(completion.CompletionFailure, "Private web baseline provisioning is not complete"):
                completion.Completion(baseline, OLD_WEB, NEW_WEB, int(time.time()) + 7200, "123", Path(directory) / "report.json")
            patch.assert_not_called()

    def test_candidate_preparation_rejects_unhashed_web_updating_without_any_patch(self):
        cloud = VirtualCloud()
        with tempfile.TemporaryDirectory() as directory, mock.patch.object(completion, "API_SETTINGS_HASH", completion.snapshot(cloud.apps["hidi-api"])["settingsHash"]), mock.patch.object(completion, "azure_read", side_effect=cloud.read), mock.patch.object(completion, "azure_patch_web") as patch:
            baseline = Path(directory) / "private" / "before"
            for app, data in cloud.apps.items(): completion.private_json(baseline / (app + ".json"), data)
            cloud.apps["hidi-web"]["properties"]["provisioningState"] = "Updating"
            with self.assertRaisesRegex(completion.CompletionFailure, "Web provisioning is not complete during candidate preparation"):
                completion.check_baseline(baseline, OLD_WEB)
            patch.assert_not_called()
            self.assertEqual(cloud.writes, 0)

    def test_second_baseline_reads_reject_unhashed_api_or_web_provisioning_drift(self):
        for target in ["hidi-api", "hidi-web"]:
            cloud = VirtualCloud()
            counts = {"hidi-api": 0, "hidi-web": 0}
            def drift_read(app):
                counts[app] += 1
                if app == target and counts[app] == 2:
                    cloud.apps[app]["properties"]["provisioningState"] = "Updating"
                return cloud.read(app)
            with self.subTest(app=target), tempfile.TemporaryDirectory() as directory, mock.patch.object(completion, "API_SETTINGS_HASH", completion.snapshot(cloud.apps["hidi-api"])["settingsHash"]), mock.patch.object(completion, "azure_read", side_effect=drift_read), mock.patch.object(completion, "azure_patch_web") as patch:
                baseline, report = Path(directory) / "private" / "before", Path(directory) / "evidence" / "before.json"
                with self.assertRaises(completion.CompletionFailure): completion.capture(baseline, OLD_WEB, report)
                self.assertFalse(baseline.exists())
                self.assertFalse(report.exists())
                patch.assert_not_called()

    def test_fixed_api_requires_original_exact_digest_revision_hash_and_succeeded(self):
        original = resource("hidi-api", completion.LIVE_API, completion.API_REVISION)
        with mock.patch.object(completion, "API_SETTINGS_HASH", completion.snapshot(original)["settingsHash"]):
            completion.require_fixed_api(original)
            for kind in ["image", "revision", "settings", "provisioning"]:
                data = copy.deepcopy(original)
                if kind == "image": data["properties"]["template"]["containers"][0]["image"] = OLD_WEB
                elif kind == "revision": data["properties"]["latestRevisionName"] = data["properties"]["latestReadyRevisionName"] = "hidi-api--other"
                elif kind == "settings": data["properties"]["template"]["containers"][0]["env"][0]["value"] = ""
                else: data["properties"]["provisioningState"] = "Updating"
                with self.subTest(kind=kind), self.assertRaises(completion.CompletionFailure): completion.require_fixed_api(data)


class ExistingApiPreservation(unittest.TestCase):
    def fixture(self, directory):
        roots = [Path(directory) / name for name in ["base", "live", "compiled"]]
        for root in roots:
            for name in proof.composer.API_FILES | {"apps/api/dist/wallet/wallet-transaction.js", "protected-provider.js"}:
                path = root / name; path.parent.mkdir(parents=True, exist_ok=True); path.write_bytes(b"old-auth" if "auth/supabase" in name and root == roots[0] else b"reviewed-auth" if "auth/supabase" in name else b"protected-identical")
        configs = [{"Config": {"Env": ["UNCHANGED=1"], "Cmd": ["node", "server"]}, "RootFS": {"Layers": ["old"]}}, {"Config": {"Env": ["UNCHANGED=1"], "Cmd": ["node", "server"]}, "RootFS": {"Layers": ["old", "reviewed-auth"]}}]
        return roots, configs

    def test_existing_live_api_matches_built_auth_and_historical_protected_files_and_layers(self):
        with tempfile.TemporaryDirectory() as directory:
            roots, configs = self.fixture(directory)
            report = proof.verify_reviewed_api(roots[0], roots[1], configs, roots[2])
            self.assertTrue(report["compiled_auth_identical_to_live"])
            self.assertFalse(report["api_image_built_or_written"])
            self.assertEqual(set(report["changed_files"]), proof.composer.API_FILES)

    def test_wrong_compiled_auth_protected_bytes_runtime_config_or_original_layer_is_rejected(self):
        for kind in ["compiled-auth", "live-protected", "compiled-wallet", "config", "layer"]:
            with self.subTest(kind=kind), tempfile.TemporaryDirectory() as directory:
                roots, configs = self.fixture(directory)
                if kind == "compiled-auth": (roots[2] / next(iter(proof.composer.API_FILES))).write_bytes(b"different-auth")
                elif kind == "live-protected": (roots[1] / "protected-provider.js").write_bytes(b"different-provider")
                elif kind == "compiled-wallet": (roots[2] / "apps/api/dist/wallet/wallet-transaction.js").write_bytes(b"different-helper")
                elif kind == "config": configs[1]["Config"]["Env"] = ["DIFFERENT=1"]
                else: configs[1]["RootFS"]["Layers"][0] = "different-base"
                with self.assertRaises(AssertionError): proof.verify_reviewed_api(roots[0], roots[1], configs, roots[2])


class DormantWorkflow(unittest.TestCase):
    def resolve(self, **pins):
        workflow = (ROOT / ".github/workflows/account-otp-web-completion.yml").read_text()
        match = re.search(r"      - name: Resolve explicit reviewed source and current live image pins\n        run: \|\n(.*?)      - uses: actions/checkout@v4", workflow, re.S)
        self.assertIsNotNone(match)
        script = "\n".join(line[10:] for line in match.group(1).splitlines())
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "env"
            env = {**os.environ, "GITHUB_ENV": str(output), "RUNNER_TEMP": directory, **{name: "" for name in ["INPUT_REVIEWED_SOURCE", "INPUT_EXPECTED_API", "INPUT_EXPECTED_WEB", "PUSH_REVIEWED_SOURCE", "PUSH_EXPECTED_API", "PUSH_EXPECTED_WEB"]}, **pins}
            result = subprocess.run(["bash", "-c", script], env=env, capture_output=True, text=True)
            return result, output.read_text() if output.exists() else ""

    def test_empty_pins_or_other_api_stop_before_checkout(self):
        for pins in [{}, {"PUSH_REVIEWED_SOURCE": "a" * 40, "PUSH_EXPECTED_WEB": OLD_WEB, "PUSH_EXPECTED_API": completion.LIVE_API.replace("69d4", "aaaa", 1)}]:
            result, output = self.resolve(**pins)
            self.assertNotEqual(result.returncode, 0); self.assertEqual(output, "")

    def test_explicit_reviewed_source_current_web_and_fixed_api_are_accepted(self):
        for prefix in ["PUSH", "INPUT"]:
            result, output = self.resolve(**{prefix + "_REVIEWED_SOURCE": "a" * 40, prefix + "_EXPECTED_WEB": OLD_WEB, prefix + "_EXPECTED_API": completion.LIVE_API})
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("EXPECTED_API=" + completion.LIVE_API, output)

    def test_workflow_keeps_all_three_strict_source_and_actual_image_fixtures_and_only_web_composition(self):
        workflow = (ROOT / ".github/workflows/account-otp-web-completion.yml").read_text()
        self.assertIn("[complete-account-otp]", workflow)
        self.assertIn("group: hidi-msg91-guarded-release", workflow)
        self.assertIn("cancel-in-progress: false", workflow)
        self.assertIn("timeout-minutes: 120", workflow)
        self.assertIn("ref: ${{ env.REVIEWED_SOURCE }}", workflow)
        for value in ["pnpm install --frozen-lockfile", "validate_source(source,os.environ['REVIEWED_SOURCE'])", "for engine in chromium firefox webkit", "tests/admin-workspace.browser.mjs", "tests/editorial-storefront.browser.mjs", "tests/editorial-polish.browser.mjs", "tests/auth-otp-resend.browser.mjs", "python3 tests/account-otp-release.test.py", "python3 tests/account-otp-web-completion.test.py", 'bash deploy/smoke-account-otp-candidates.sh "$CANDIDATE_API" "$CANDIDATE_WEB"']:
            self.assertIn(value, workflow)
        self.assertIn("compose-msg91-images.py --app web", workflow)
        self.assertNotIn("--app api", workflow)
        self.assertNotIn("update-account-otp-images.sh", workflow)
        self.assertNotIn("containerapp update", workflow)
        self.assertNotIn("account-otp-rollout", workflow)
        self.assertNotIn("account-otp-private\n", workflow[workflow.index("      - name: Preserve public"):])
        self.assertIn("PUSH_REVIEWED_SOURCE: ''", workflow)
        self.assertIn("PUSH_EXPECTED_WEB: ''", workflow)
        self.assertIn("PUSH_EXPECTED_API: ''", workflow)


if __name__ == "__main__":
    unittest.main()
