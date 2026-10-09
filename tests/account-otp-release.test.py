"""Exercise account source guards and real image rollout using isolated fake Azure/curl."""
import copy
import importlib.util
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

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("account_guard", ROOT / "deploy/account_otp_release_guard.py")
guard = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guard)
OLD = {app: "acrhidiprod0927.azurecr.io/" + app + "@sha256:" + "a" * 64 for app in ["hidi-api", "hidi-web"]}
NEW = {app: "acrhidiprod0927.azurecr.io/" + app + "@sha256:" + "b" * 64 for app in ["hidi-api", "hidi-web"]}
SCRIPT = ROOT / "deploy/update-account-otp-images.sh"


def resource(item):
    return {
        "identity": {"type": "SystemAssigned"}, "location": "centralindia", "tags": {"purpose": "existing-storefront"},
        "properties": {
            "environmentId": "/existing/managed-environment", "workloadProfileName": "Consumption",
            "template": {"containers": [{"image": item["image"], "env": item["env"]}], "revisionSuffix": item["revision"]},
            "configuration": {"activeRevisionsMode": "Single", "ingress": {"traffic": [{"revisionName": item["revision"], "weight": 100}]}},
            "latestRevisionName": item["revision"], "latestReadyRevisionName": item["revision"],
        },
    }


def mock(tool, args):
    path = Path(os.environ["HIDI_MOCK_STATE"])
    state = json.loads(path.read_text())
    state["calls"].append([tool, *args])
    output, status, signal_parent = "", 0, False
    if tool == "az":
        app = args[args.index("-n") + 1]
        item = state["apps"][app]
        if args[:2] == ["containerapp", "show"]:
            if app == "hidi-web" and state["apps"]["hidi-api"]["image"] == NEW["hidi-api"]:
                if state["scenario"] == "concurrent-web": item["image"] = "acrhidiprod0927.azurecr.io/hidi-web@sha256:" + "c" * 64
                if state["scenario"] == "concurrent-web-settings": item["env"][0]["value"] = "independent-provider"
            if app == "hidi-api" and state["scenario"] == "concurrent-api-after-web" and state["apps"]["hidi-web"]["image"] == NEW["hidi-web"]:
                item["image"] = "acrhidiprod0927.azurecr.io/hidi-api@sha256:" + "c" * 64
            output = json.dumps(resource(item))
        elif args[:2] == ["containerapp", "update"]:
            assert not any(arg.startswith(("--set-env", "--remove-env", "--secrets")) for arg in args)
            item["image"] = args[args.index("--image") + 1]
            item["revision"] += "x"
            if state["scenario"] == "term-during-api-update" and app == "hidi-api" and item["image"] == NEW[app] and not state.get("signalSent"):
                state["signalSent"] = True
                signal_parent = True
        else: raise AssertionError(args)
    elif tool == "curl":
        url = args[-1]
        if state["scenario"] == "health-failure" and url.endswith("/health"): status = 1
        elif url.endswith("/auth/config"): output = json.dumps({"phoneOtp": True, "channel": "SMS", "provider": "msg91", "fallbackProvider": "firebase"})
        elif url.endswith("/account/policy"):
            output = '<h1>Account terms &amp; privacy notice</h1><section id="terms"></section>'
            if state["scenario"] != "policy-failure": output += '<section id="privacy"></section>'
        else: output = "401" if "/api/admin/" in url else "200"
    else: raise AssertionError(tool)
    path.write_text(json.dumps(state))
    if signal_parent: os.kill(os.getppid(), signal.SIGTERM)
    sys.stdout.write(output)
    return status


class SourceAndSettingsGuards(unittest.TestCase):
    def test_only_exact_reviewed_application_paths_and_release_files_pass(self):
        guard.validate_paths(guard.APPLICATION_FILES, guard.RELEASE_FILES)
        for unexpected in ["apps/api/prisma/schema.prisma", "packages/shared/schema.ts", "apps/web/package.json", "package.json", "pnpm-lock.yaml", "apps/web/next.config.mjs", "apps/api/src/wallet/wallet-transaction.ts"]:
            with self.subTest(path=unexpected), self.assertRaises(AssertionError):
                guard.validate_paths(guard.APPLICATION_FILES | {unexpected}, guard.RELEASE_FILES | {unexpected})
        for unexpected in ["deploy/public-auth.json", ".github/workflows/landscape-hover-release.yml", "tests/admin-rbac.test.ts"]:
            with self.subTest(path=unexpected), self.assertRaises(AssertionError):
                guard.validate_paths(guard.APPLICATION_FILES, guard.RELEASE_FILES | {unexpected})

    def test_mutable_tags_wrong_application_and_unreviewed_source_are_rejected(self):
        guard.validate_image(OLD["hidi-api"], "api")
        for image in ["acrhidiprod0927.azurecr.io/hidi-api:latest", "acrhidiprod0927.azurecr.io/hidi-api:" + "a" * 40, OLD["hidi-web"]]:
            with self.subTest(image=image), self.assertRaises(AssertionError): guard.validate_image(image, "api")
        with self.assertRaises(AssertionError): guard.validate_source("a" * 40, "b" * 40)

    def test_only_image_revision_and_traffic_can_vary_without_settings_drift(self):
        item = {"image": OLD["hidi-api"], "revision": "old", "env": [{"name": "AUTH_KEY", "secretRef": "existing-key"}, {"name": "CUSTOMER_OTP_PROVIDER", "value": "msg91"}]}
        before = resource(item)
        after = copy.deepcopy(before)
        after["properties"]["template"]["containers"][0]["image"] = NEW["hidi-api"]
        after["properties"]["template"]["revisionSuffix"] = "new"
        after["properties"]["configuration"]["ingress"]["traffic"][0]["revisionName"] = "new"
        after["properties"]["template"]["containers"][0]["env"].reverse()
        self.assertEqual(guard.snapshot(before)["settingsHash"], guard.snapshot(after)["settingsHash"])
        mutations = [
            lambda value: value["properties"]["template"]["containers"][0]["env"][0].update(secretRef="different-key"),
            lambda value: value["properties"].update(environmentId="/different/environment"),
            lambda value: value["properties"].update(managedEnvironmentId="/different/legacy-environment"),
            lambda value: value["properties"].update(workloadProfileName="Different"),
            lambda value: value.update(identity={"type": "None"}),
            lambda value: value.update(tags={"purpose": "different"}),
        ]
        for mutate in mutations:
            changed = copy.deepcopy(before); mutate(changed)
            self.assertNotEqual(guard.snapshot(before)["settingsHash"], guard.snapshot(changed)["settingsHash"])


class ExplicitActivationPins(unittest.TestCase):
    def resolve_pins(self, **pins):
        workflow = (ROOT / ".github/workflows/account-otp-release.yml").read_text()
        match = re.search(r"      - name: Resolve explicit reviewed source and current live image pins\n        run: \|\n(.*?)      - uses: actions/checkout@v4", workflow, re.S)
        self.assertIsNotNone(match)
        script = "\n".join(line[10:] for line in match.group(1).splitlines())
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "environment"
            env = {**os.environ, "GITHUB_ENV": str(output), "RUNNER_TEMP": directory, **{name: "" for name in ["INPUT_REVIEWED_SOURCE", "INPUT_EXPECTED_WEB", "INPUT_EXPECTED_API", "PUSH_REVIEWED_SOURCE", "PUSH_EXPECTED_WEB", "PUSH_EXPECTED_API"]}, **pins}
            result = subprocess.run(["bash", "-c", script], env=env, capture_output=True, text=True)
            return result, output.read_text() if output.exists() else ""

    def test_empty_activation_pins_stop_before_checkout_or_release(self):
        result, output = self.resolve_pins()
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(output, "")

    def test_exact_dispatch_or_activation_pins_select_the_reviewed_source(self):
        for mode in ["INPUT", "PUSH"]:
            result, output = self.resolve_pins(**{mode + "_REVIEWED_SOURCE": "a" * 40, mode + "_EXPECTED_WEB": OLD["hidi-web"], mode + "_EXPECTED_API": OLD["hidi-api"]})
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertTrue(output.startswith("REVIEWED_SOURCE=" + "a" * 40 + "\nEXPECTED_WEB=" + OLD["hidi-web"] + "\nEXPECTED_API=" + OLD["hidi-api"] + "\n"))
            self.assertRegex(output, r"HIDI_OTP_JOB_DEADLINE_EPOCH=\d+\n")
            module_path = re.search(r"^HIDI_PLAYWRIGHT_MODULE=(.+)/account-otp-browser/node_modules/playwright/index\.mjs$", output, re.M)
            self.assertIsNotNone(module_path)
            self.assertIn("HIDI_OTP_BASELINE_STATE_DIR=" + module_path.group(1) + "/account-otp-private/before\n", output)
        workflow = (ROOT / ".github/workflows/account-otp-release.yml").read_text()
        self.assertIn("ref: ${{ env.REVIEWED_SOURCE }}", workflow)
        self.assertIn("['git','rev-parse','HEAD']", workflow)

    def test_mutable_images_or_incomplete_source_stop_before_checkout(self):
        valid = {"INPUT_REVIEWED_SOURCE": "a" * 40, "INPUT_EXPECTED_WEB": OLD["hidi-web"], "INPUT_EXPECTED_API": OLD["hidi-api"]}
        for field, value in [("INPUT_REVIEWED_SOURCE", "a" * 7), ("INPUT_EXPECTED_WEB", "acrhidiprod0927.azurecr.io/hidi-web:latest"), ("INPUT_EXPECTED_API", OLD["hidi-web"])]:
            result, output = self.resolve_pins(**{**valid, field: value})
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(output, "")

    def test_job_env_excludes_runner_context_and_runner_paths_are_exported_at_runtime(self):
        workflow = (ROOT / ".github/workflows/account-otp-release.yml").read_text()
        allowed = {"github", "needs", "strategy", "matrix", "vars", "secrets", "inputs"}

        def validate_job_envs(text):
            blocks = re.findall(r"(?m)^    env:\n(?:^      .+\n)+", text)
            self.assertTrue(blocks, "Expected the release job env block")
            for block in blocks:
                contexts = set(re.findall(r"\$\{\{\s*([A-Za-z_]\w*)[.\[]", block))
                self.assertEqual(contexts - allowed, set(), "A context unavailable during job env evaluation was introduced")

        validate_job_envs(workflow)
        invalid = workflow.replace("    env:\n", "    env:\n      INVALID: ${{ runner.temp }}\n", 1)
        with self.assertRaises(AssertionError): validate_job_envs(invalid)
        for name in ["HIDI_PLAYWRIGHT_MODULE", "HIDI_OTP_BASELINE_STATE_DIR"]:
            self.assertRegex(workflow, 'echo "' + name + r'=\$RUNNER_TEMP/[^\n]+" >> "\$GITHUB_ENV"')


class BrowserStageGate(unittest.TestCase):
    SUITES = [
        ("admin-workspace.browser.mjs", "chromium"),
        ("admin-workspace.browser.mjs", "firefox"),
        ("admin-workspace.browser.mjs", "webkit"),
        ("editorial-storefront.browser.mjs", ""),
        ("editorial-polish.browser.mjs", ""),
        ("auth-otp-resend.browser.mjs", ""),
    ]

    def run_browser_stage(self, failure=""):
        workflow = (ROOT / ".github/workflows/account-otp-release.yml").read_text()
        match = re.search(r"      - name: Run fresh admin, shopping and OTP browser fixtures in all three engines\n        run: \|\n(.*?)      - uses: azure/login@v2", workflow, re.S)
        self.assertIsNotNone(match)
        script = "\n".join(line[10:] for line in match.group(1).splitlines())
        with tempfile.TemporaryDirectory(prefix="hidi-browser-stage-") as directory:
            root = Path(directory)
            binary = root / "bin"; binary.mkdir()
            record = root / "calls.jsonl"
            fake = "#!" + sys.executable + "\n" + """
import json,os,sys
from pathlib import Path
tool=Path(sys.argv[0]).name
args=sys.argv[1:]
suite='npm-install' if tool=='npm' else 'browser-install' if args[0].endswith('/cli.js') else Path(args[0]).name
engine=os.environ.get('HIDI_BROWSER_ENGINE','') if suite=='admin-workspace.browser.mjs' else ''
with open(os.environ['HIDI_BROWSER_RECORD'],'a') as output:
    output.write(json.dumps({'suite':suite,'engine':engine,'engines':os.environ.get('HIDI_BROWSER_ENGINES',''),'args':args})+'\\n')
target=suite+(':'+engine if engine else '')
sys.exit(1 if target==os.environ.get('HIDI_BROWSER_FAIL_TARGET') else 0)
"""
            for tool in ["npm", "node"]:
                target = binary / tool; target.write_text(fake); target.chmod(0o755)
            env = {**os.environ, "PATH": str(binary) + os.pathsep + os.environ["PATH"], "RUNNER_TEMP": str(root), "HIDI_BROWSER_RECORD": str(record), "HIDI_BROWSER_FAIL_TARGET": failure}
            env.pop("HIDI_BROWSER_ENGINE", None); env.pop("HIDI_BROWSER_ENGINES", None)
            result = subprocess.run(["bash", "--noprofile", "--norc", "-eo", "pipefail", "-c", script], env=env, capture_output=True, text=True, timeout=30)
            calls = [json.loads(line) for line in record.read_text().splitlines()] if record.exists() else []
            return result, calls

    def assert_all_suites(self, calls):
        self.assertEqual([(call["suite"], call["engine"]) for call in calls[2:]], self.SUITES)
        for call in calls[5:]: self.assertEqual(call["engines"], "chromium,firefox,webkit")
        self.assertIn("--with-deps", calls[1]["args"])
        self.assertEqual(calls[1]["args"][-3:], ["chromium", "firefox", "webkit"])

    def test_success_requires_every_mandatory_browser_suite(self):
        result, calls = self.run_browser_stage()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assert_all_suites(calls)

    def test_each_suite_failure_collects_remaining_evidence_and_blocks_azure(self):
        for suite, engine in self.SUITES:
            target = suite + (":" + engine if engine else "")
            with self.subTest(failure=target):
                result, calls = self.run_browser_stage(target)
                self.assertNotEqual(result.returncode, 0)
                self.assert_all_suites(calls)

    def test_install_prerequisite_failure_stops_before_browser_suites(self):
        for target, expected in [("npm-install", ["npm-install"]), ("browser-install", ["npm-install", "browser-install"])]:
            with self.subTest(failure=target):
                result, calls = self.run_browser_stage(target)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual([call["suite"] for call in calls], expected)


class AdminFixtureNavigation(unittest.TestCase):
    def helpers(self):
        source = (ROOT / "tests/admin-workspace.browser.mjs").read_text()
        helpers = []
        for name in ["trackFixtureNetwork", "settleFixtureNetwork", "settledGoto", "settledReload"]:
            match = re.search(r"(?:async )?function " + name + r"\([^\n]+\) \{\n.*?^\}", source, re.S | re.M)
            self.assertIsNotNone(match)
            helpers.append(match.group(0))
        return source, helpers

    def test_document_navigation_settles_prefetch_without_filtering_page_errors(self):
        source, helpers = self.helpers()
        script = "const fixtureNetworkStates=new WeakMap();\n" + "\n".join(helpers) + "\n" + """
import assert from 'node:assert/strict';
let now=0;Date.now=()=>now;const sleep=async milliseconds=>{now+=milliseconds;};
const events=[];
const page={url:()=> 'http://127.0.0.1:3100/admin',
  on:()=>{},
  waitForLoadState:async (state,options)=>{assert.equal(state,'networkidle');assert(options.timeout>0);events.push('settled');},
  goto:async (url,options)=>{assert.equal(options.waitUntil,'networkidle');assert(options.timeout>0);events.push('goto:'+url);},
  reload:async options=>{assert.equal(options.waitUntil,'networkidle');assert(options.timeout>0);events.push('reload');}};
await settledGoto(page,'http://127.0.0.1:3100/admin/returns');
await settledReload(page);
assert.deepEqual(events,['settled','goto:http://127.0.0.1:3100/admin/returns','settled','reload']);
"""
        result = subprocess.run(["node", "--input-type=module"], input=script, text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        without_helpers = source
        for helper in helpers: without_helpers = without_helpers.replace(helper, "")
        self.assertNotRegex(without_helpers, r"\b\w+(?:\.page)?\.(?:goto|reload)\(", "Fixture forced document navigation must use the settled helpers")
        self.assertIn("assert.deepEqual(errors, [])", source)
        self.assertIn("assert.deepEqual(mobile.errors, [])", source)
        self.assertIn("errors.push(error.message)", source)

    def test_cached_networkidle_does_not_skip_late_drawer_prefetches(self):
        source, helpers = self.helpers()
        script = "const fixtureNetworkStates=new WeakMap();\n" + "\n".join(helpers) + "\n" + """
import assert from 'node:assert/strict';
let now=0,finished=false,started=false;Date.now=()=>now;
const listeners=new Map();
const request={url:()=> 'http://127.0.0.1:3100/admin/import?_rsc=fixture'};
const page={on:(name,callback)=>listeners.set(name,callback),waitForLoadState:async()=>{}};
const sleep=async milliseconds=>{
  now+=milliseconds;
  if(now>=100&&!started){started=true;listeners.get('request')(request);}
  if(now>=350&&!finished){finished=true;listeners.get('requestfinished')(request);}
};
await settleFixtureNetwork(page);
assert(started&&finished,'A cached lifecycle cannot skip requests scheduled after the drawer is shown');
assert(now>=850,'The drawer transition waits for completion and a fresh quiet interval');
"""
        result = subprocess.run(["node", "--input-type=module"], input=script, text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        start = source.index("await mobile.page.getByRole('button', { name: 'Open navigation' }).click()")
        end = source.index("await settledGoto(mobile.page, base + '/admin/orders')", start)
        transition = source[start:end]
        self.assertRegex(transition, r"Admin navigation' \}\)\.waitFor\(\);\s+await settleFixtureNetwork\(mobile.page\);\s+await mobile.page.keyboard.press\('Escape'\)")
        self.assertRegex(transition, r"waitFor\(\{ state: 'hidden' \}\);\s+await settleFixtureNetwork\(mobile.page\)")


class AccountRollout(unittest.TestCase):
    def run_release(self, scenario):
        with tempfile.TemporaryDirectory(prefix="hidi-account-release-") as directory:
            root = Path(directory)
            binary, baseline = root / "bin", root / "baseline"
            binary.mkdir(); baseline.mkdir()
            state = {"scenario": scenario, "calls": [], "apps": {app: {"image": image, "revision": app + "-old", "env": [{"name": "CUSTOMER_OTP_PROVIDER", "value": "msg91"}, {"name": "AUTH_KEY", "secretRef": "existing-key"}]} for app, image in OLD.items()}}
            for app, item in state["apps"].items(): (baseline / (app + ".json")).write_text(json.dumps(resource(item)))
            if scenario == "unexpected-live": state["apps"]["hidi-web"]["image"] = "acrhidiprod0927.azurecr.io/hidi-web@sha256:" + "d" * 64
            if scenario == "settings-changed-during-preparation": state["apps"]["hidi-web"]["env"][1]["secretRef"] = "independently-rotated-key"
            path = root / "state.json"; path.write_text(json.dumps(state))
            for tool in ["az", "curl"]:
                target = binary / tool
                target.write_text("#!" + sys.executable + "\nimport runpy,sys\nsys.argv=[" + repr(str(Path(__file__).resolve())) + ", '--mock', " + repr(tool) + ", *sys.argv[1:]]\nrunpy.run_path(sys.argv[0],run_name='__main__')\n")
                target.chmod(0o755)
            env = {**os.environ, "PATH": str(binary) + os.pathsep + os.environ["PATH"], "HIDI_MOCK_STATE": str(path), "RUNNER_TEMP": str(root), "HIDI_OTP_BASELINE_STATE_DIR": str(baseline), "HIDI_OTP_JOB_DEADLINE_EPOCH": str(int(time.time()) + (60 if scenario == "insufficient-budget" else 7200))}
            process = subprocess.run(["bash", str(SCRIPT), OLD["hidi-api"], OLD["hidi-web"], NEW["hidi-api"], NEW["hidi-web"]], cwd=ROOT, env=env, capture_output=True, text=True, timeout=120)
            return process, json.loads(path.read_text())

    def test_success_updates_images_only_and_preserves_provider_and_secret_reference(self):
        process, state = self.run_release("success")
        self.assertEqual(process.returncode, 0, process.stderr)
        updates = [call[call.index("-n") + 1] for call in state["calls"] if call[:3] == ["az", "containerapp", "update"]]
        self.assertEqual(updates, ["hidi-api", "hidi-web"])
        self.assertEqual({app: value["image"] for app, value in state["apps"].items()}, NEW)
        for value in state["apps"].values(): self.assertEqual(value["env"], [{"name": "CUSTOMER_OTP_PROVIDER", "value": "msg91"}, {"name": "AUTH_KEY", "secretRef": "existing-key"}])

    def test_changed_live_image_or_settings_prevents_all_updates(self):
        for scenario in ["unexpected-live", "settings-changed-during-preparation", "insufficient-budget"]:
            process, state = self.run_release(scenario)
            self.assertNotEqual(process.returncode, 0)
            self.assertFalse(any(call[:3] == ["az", "containerapp", "update"] for call in state["calls"]))

    def test_failed_health_or_missing_policy_rolls_back_both_owned_images(self):
        for scenario in ["health-failure", "policy-failure"]:
            process, state = self.run_release(scenario)
            self.assertNotEqual(process.returncode, 0)
            self.assertEqual({app: value["image"] for app, value in state["apps"].items()}, OLD)

    def test_concurrent_web_image_is_preserved_while_our_api_rolls_back(self):
        process, state = self.run_release("concurrent-web")
        self.assertNotEqual(process.returncode, 0)
        self.assertEqual(state["apps"]["hidi-api"]["image"], OLD["hidi-api"])
        self.assertTrue(state["apps"]["hidi-web"]["image"].endswith("c" * 64))

    def test_concurrent_web_setting_is_preserved_and_never_overwritten(self):
        process, state = self.run_release("concurrent-web-settings")
        self.assertNotEqual(process.returncode, 0)
        self.assertEqual(state["apps"]["hidi-api"]["image"], OLD["hidi-api"])
        self.assertEqual(state["apps"]["hidi-web"]["image"], OLD["hidi-web"])
        self.assertEqual(state["apps"]["hidi-web"]["env"][0]["value"], "independent-provider")

    def test_independent_api_release_during_web_readiness_prevents_false_success(self):
        process, state = self.run_release("concurrent-api-after-web")
        self.assertNotEqual(process.returncode, 0)
        self.assertTrue(state["apps"]["hidi-api"]["image"].endswith("c" * 64))
        self.assertEqual(state["apps"]["hidi-web"]["image"], OLD["hidi-web"])

    def test_termination_after_first_app_update_rolls_back_owned_api(self):
        process, state = self.run_release("term-during-api-update")
        self.assertEqual(process.returncode, 143, process.stderr)
        self.assertEqual({app: value["image"] for app, value in state["apps"].items()}, OLD)


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--mock": sys.exit(mock(sys.argv[2], sys.argv[3:]))
    unittest.main()
