"""Finish the tested OTP storefront without writing the already-live API or changing settings."""
import argparse
import copy
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import sys
import time
import urllib.error
import urllib.request

from account_otp_release_guard import snapshot, validate_image

LIVE_API = "acrhidiprod0927.azurecr.io/hidi-api@sha256:69d4c89fd6531658eba730b7254b7d34c9a274953e2fed4b46ce22caa13e56e6"
API_REVISION = "hidi-api--0000027"
API_SETTINGS_HASH = "9287dd2844a8af1a00e11f8743bae634be7ad616be956b5850c31c556fef68ff"
API_VERSION = "2025-07-01"
RESOURCE_ROOT = "https://management.azure.com/subscriptions/91d9572d-0f0b-47fe-802d-0eef36d7c719/resourceGroups/rg-hidi-prod/providers/Microsoft.App/containerApps/"
PUBLIC_BASE = "https://thidigk.thehidi.com"


class CompletionFailure(Exception):
    pass


class CompletionInterrupted(CompletionFailure):
    def __init__(self, code):
        self.code = code
        super().__init__("Workflow interrupted")


def resource_url(app):
    if app not in {"hidi-api", "hidi-web"}:
        raise CompletionFailure("Non-allowlisted Azure resource")
    return RESOURCE_ROOT + app + "?api-version=" + API_VERSION


def azure_read(app):
    result = subprocess.run(["az", "rest", "--method", "GET", "--url", resource_url(app), "--headers", "Accept=application/json", "--only-show-errors", "--output", "json"], capture_output=True, text=True, timeout=180)
    if result.returncode:
        raise CompletionFailure("Azure state read failed")
    try:
        return json.loads(result.stdout)
    except (TypeError, ValueError):
        raise CompletionFailure("Azure state response was invalid") from None


def private_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(path.parent, 0o700)
    # The raw settings and PATCH array never enter logs or public evidence.
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    os.fchmod(descriptor, 0o600)
    with os.fdopen(descriptor, "w") as stream:
        json.dump(data, stream)


def image_patch(data, image, suffix):
    validate_image(image, "web")
    if not re.fullmatch(r"[a-z][a-z0-9-]{0,62}[a-z0-9]", suffix):
        raise CompletionFailure("Invalid owned web revision suffix")
    location = data.get("location")
    if not isinstance(location, str) or not location:
        raise CompletionFailure("Azure resource location is missing")
    containers = copy.deepcopy(data["properties"]["template"]["containers"])
    if len(containers) != 1:
        raise CompletionFailure("Expected one web application container")
    containers[0]["image"] = image
    # 2025-07-01 is JSON Merge Patch: omitted scale/volumes/initContainers and
    # configuration stay unchanged. Resending their nulls would delete fields.
    # Arrays replace atomically, so retain every current container field/value.
    return {"location": location, "properties": {"template": {"containers": containers, "revisionSuffix": suffix}}}


def azure_patch_web(body, body_file):
    if set(body) != {"location", "properties"} or set(body["properties"]) != {"template"} or set(body["properties"]["template"]) != {"containers", "revisionSuffix"}:
        raise CompletionFailure("Non-image web PATCH envelope rejected")
    template = body["properties"]["template"]
    if not isinstance(template["containers"], list) or len(template["containers"]) != 1:
        raise CompletionFailure("Expected one preserved web container")
    validate_image(template["containers"][0]["image"], "web")
    private_json(body_file, body)
    result = subprocess.run(["az", "rest", "--method", "PATCH", "--url", resource_url("hidi-web"), "--headers", "Content-Type=application/json", "Accept=application/json", "--body", "@" + str(body_file), "--only-show-errors", "--output", "none"], capture_output=True, text=True, timeout=180)
    if result.returncode:
        raise CompletionFailure("Azure web image request failed")


def require_ready(state):
    if state["mode"] != "Single" or not state["ready"] or state["latest"] != state["ready"]:
        raise CompletionFailure("Expected a ready Single-revision app")


def require_fixed_api(data):
    state = snapshot(data)
    require_ready(state)
    if state["image"] != LIVE_API or state["latest"] != API_REVISION or state["settingsHash"] != API_SETTINGS_HASH:
        raise CompletionFailure("Already-live API image, revision or raw settings changed")
    if data["properties"].get("provisioningState") != "Succeeded":
        raise CompletionFailure("Already-live API provisioning is not complete")
    return state


def get_public(path):
    request = urllib.request.Request(PUBLIC_BASE + path, headers={"User-Agent": "HIDI-account-otp-readonly-release-check"})
    if path == "/api/admin/dashboard/overview":
        request.add_header("Cookie", "hidi_admin_access=invalid-deployment-probe")
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as error:
        return error.code, error.read()


def public_probes():
    checks = []
    for path in ["/health", "/", "/api/store/health/ready", "/api/store/auth/config", "/account/policy", "/account", "/admin/landing-media", "/admin/packing-scanner", "/admin/products/price-tags", "/api/admin/dashboard/overview"]:
        status, body = get_public(path)
        if path == "/api/admin/dashboard/overview":
            valid = status in {401, 403}
        elif path.startswith("/admin/"):
            valid = status in {200, 301, 302, 303, 307, 308, 401, 403}
        else:
            valid = status == 200
        if not valid:
            raise CompletionFailure("Public read-only route validation failed")
        if path == "/api/store/auth/config":
            if json.loads(body) != {"phoneOtp": True, "channel": "SMS", "provider": "msg91", "fallbackProvider": "firebase"}:
                raise CompletionFailure("Public auth configuration changed")
        if path == "/account/policy":
            text = body.decode("utf-8")
            if not all(value in text for value in ['Account terms &amp; privacy notice', 'id="terms"', 'id="privacy"']):
                raise CompletionFailure("Public account policy validation failed")
        checks.append({"path": path, "status": status})
    return checks


class Completion:
    def __init__(self, baseline, expected_web, candidate_web, deadline, run_id, report):
        validate_image(expected_web, "web")
        validate_image(candidate_web, "web")
        if expected_web == candidate_web:
            raise CompletionFailure("The verified web candidate must differ from the live base")
        if not re.fullmatch(r"[0-9]{1,20}", run_id):
            raise CompletionFailure("Expected a bounded workflow run identifier")
        self.baseline = Path(baseline)
        self.expected_web, self.candidate_web = expected_web, candidate_web
        self.deadline, self.report = deadline, Path(report)
        self.suffix = "otp-web-" + run_id
        self.rollback_suffix = "otp-web-rollback-" + run_id
        self.owned_revision = "hidi-web--" + self.suffix
        self.before = {app: json.loads((self.baseline / (app + ".json")).read_text()) for app in ["hidi-api", "hidi-web"]}
        self.api_before = require_fixed_api(self.before["hidi-api"])
        self.web_before = snapshot(self.before["hidi-web"])
        require_ready(self.web_before)
        if self.before["hidi-web"]["properties"].get("provisioningState") != "Succeeded":
            raise CompletionFailure("Private web baseline provisioning is not complete")
        if self.web_before["image"] != expected_web:
            raise CompletionFailure("The private baseline is not the reviewed current web image")
        self.write_attempted = False
        self.cancelled = None
        self.recovering = False
        self.evidence = {"apiWritten": False, "before": {"hidi-api": self.api_before, "hidi-web": self.web_before}, "webWriteAttempted": False}

    def checkpoint(self):
        if self.cancelled and not self.recovering:
            raise CompletionInterrupted(self.cancelled)

    def signal(self, number, _frame):
        # Let an in-flight ARM request finish before evaluating ownership. The
        # signal still makes the job fail and restores only our proven image.
        self.cancelled = 130 if number == signal.SIGINT else 143

    def read_pair(self):
        self.checkpoint()
        api = require_fixed_api(azure_read("hidi-api"))
        if api != self.api_before:
            raise CompletionFailure("API changed during web completion")
        web = azure_read("hidi-web")
        self.checkpoint()
        return web, snapshot(web)

    def unchanged(self):
        data, state = self.read_pair()
        if data["properties"].get("provisioningState") != "Succeeded":
            raise CompletionFailure("Current web provisioning is not complete")
        if state != self.web_before:
            raise CompletionFailure("Web image, ready revision or raw settings changed after preparation")
        return data

    def save(self):
        self.report.parent.mkdir(parents=True, exist_ok=True)
        self.report.write_text(json.dumps(self.evidence, indent=2))

    def wait_ready(self, image, revision, previous_image):
        for attempt in range(60):
            data, state = self.read_pair()
            if state["settingsHash"] != self.web_before["settingsHash"] or state["mode"] != "Single":
                raise CompletionFailure("Web raw settings changed during image readiness")
            provisioning = data["properties"].get("provisioningState")
            if provisioning in {"Failed", "Canceled"}:
                raise CompletionFailure("Owned web image provisioning failed")
            if state["image"] == image:
                if state["latest"] != revision:
                    raise CompletionFailure("An independent web revision replaced the owned revision")
                if state["ready"] == revision and provisioning == "Succeeded":
                    return data, state
            elif state["image"] != previous_image:
                raise CompletionFailure("An independent web image is active")
            if time.time() >= self.deadline - 15 * 60 and not self.recovering:
                raise CompletionFailure("Workflow time reserved for recovery")
            time.sleep(10)
        raise CompletionFailure("Owned web image did not become ready")

    def rollback(self):
        if not self.write_attempted:
            return
        self.recovering = True
        try:
            data, state = self.read_pair()
            self.evidence["rollbackCurrent"] = state
            # A failed PATCH may not yet be visible. Read briefly until the
            # accepted owned revision appears; never overwrite another image.
            for attempt in range(12):
                if state != self.web_before:
                    break
                time.sleep(10)
                data, state = self.read_pair()
            if state == self.web_before:
                if data["properties"].get("provisioningState") != "Succeeded":
                    raise CompletionFailure("Pending web operation unresolved")
                self.evidence["rollback"] = "baseline-still-active-no-write"
                return
            if state["image"] != self.candidate_web or state["latest"] != self.owned_revision or state["settingsHash"] != self.web_before["settingsHash"] or state["mode"] != "Single":
                raise CompletionFailure("Web changed independently; refusing rollback overwrite")
            body = image_patch(data, self.expected_web, self.rollback_suffix)
            azure_patch_web(body, self.baseline.parent / "rollback-web-patch.json")
            _, final = self.wait_ready(self.expected_web, "hidi-web--" + self.rollback_suffix, self.candidate_web)
            self.evidence["rollbackFinal"] = final
            self.evidence["rollback"] = "owned-web-image-restored"
        except Exception:
            self.evidence["rollback"] = "refused-or-failed-without-api-write"
            print("Owned web rollback could not be completed safely", file=sys.stderr)
        finally:
            self.recovering = False

    def run(self):
        try:
            current = self.unchanged()
            if self.deadline - time.time() < 45 * 60:
                raise CompletionFailure("Insufficient workflow time for guarded web completion and rollback")
            body = image_patch(current, self.candidate_web, self.suffix)
            # Persist intent before the request, so timeout/interruption cannot
            # make an accepted write invisible to the rollback ownership check.
            private_json(self.baseline.parent / "web-write-intent.json", {"image": self.candidate_web, "revision": self.owned_revision, "settingsHash": self.web_before["settingsHash"]})
            self.write_attempted = True
            self.evidence["webWriteAttempted"] = True
            self.checkpoint()
            azure_patch_web(body, self.baseline.parent / "candidate-web-patch.json")
            self.checkpoint()
            _, ready = self.wait_ready(self.candidate_web, self.owned_revision, self.expected_web)
            self.evidence["ready"] = ready
            self.evidence["publicReadOnlyChecks"] = public_probes()
            final_data, final = self.read_pair()
            if final_data["properties"].get("provisioningState") != "Succeeded":
                raise CompletionFailure("Web provisioning changed after public validation")
            if final != ready:
                raise CompletionFailure("Owned web image or raw settings changed after public validation")
            self.evidence["final"] = {"hidi-api": self.api_before, "hidi-web": final}
            self.evidence["status"] = "completed"
            self.checkpoint()
            self.save()
            print("Verified account policy and resend storefront deployed; the already-live API and raw settings are unchanged.")
            return 0
        except Exception as error:
            code = error.code if isinstance(error, CompletionInterrupted) else 1
            self.evidence["status"] = "failed"
            self.rollback()
            if self.cancelled:
                code = self.cancelled
            self.save()
            print("Web completion failed; public evidence records the guarded recovery result", file=sys.stderr)
            return code


def capture(baseline, expected_web, report):
    validate_image(expected_web, "web")
    states, raw = {}, {}
    for app in ["hidi-api", "hidi-web"]:
        raw[app] = azure_read(app)
        states[app] = require_fixed_api(raw[app]) if app == "hidi-api" else snapshot(raw[app])
        require_ready(states[app])
        if raw[app]["properties"].get("provisioningState") != "Succeeded":
            raise CompletionFailure("Live app provisioning is not complete")
    if states["hidi-web"]["image"] != expected_web:
        raise CompletionFailure("A different live web release is active")
    # Fresh second reads also protect against drift while capturing the pair.
    for app in ["hidi-api", "hidi-web"]:
        current = azure_read(app)
        current_state = require_fixed_api(current) if app == "hidi-api" else snapshot(current)
        require_ready(current_state)
        if current["properties"].get("provisioningState") != "Succeeded":
            raise CompletionFailure("Live app provisioning changed during baseline capture")
        if current_state != states[app]:
            raise CompletionFailure("Live state changed while capturing the private baseline")
    for app, data in raw.items():
        private_json(Path(baseline) / (app + ".json"), data)
    Path(report).parent.mkdir(parents=True, exist_ok=True)
    Path(report).write_text(json.dumps({"apiWritten": False, "before": states}, indent=2))
    print("Captured fresh ready web baseline; fixed API image, revision and raw settings verified.")


def check_baseline(baseline, expected_web):
    validate_image(expected_web, "web")
    for app in ["hidi-api", "hidi-web"]:
        before = json.loads((Path(baseline) / (app + ".json")).read_text())
        current = azure_read(app)
        if app == "hidi-api":
            require_fixed_api(before)
            require_fixed_api(current)
        else:
            require_ready(snapshot(before))
            require_ready(snapshot(current))
            if before["properties"].get("provisioningState") != "Succeeded" or current["properties"].get("provisioningState") != "Succeeded":
                raise CompletionFailure("Web provisioning is not complete during candidate preparation")
        if snapshot(current) != snapshot(before):
            raise CompletionFailure("Image, revision or raw settings changed during candidate preparation")
        if app == "hidi-web" and snapshot(current)["image"] != expected_web:
            raise CompletionFailure("A different web release is active")
    print("Fresh raw API and web baselines remain unchanged.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=["capture", "check", "rollout"])
    parser.add_argument("--baseline", required=True)
    parser.add_argument("--expected-web", required=True)
    parser.add_argument("--candidate-web")
    parser.add_argument("--deadline", type=int)
    parser.add_argument("--run-id")
    parser.add_argument("--report", required=True)
    args = parser.parse_args()
    try:
        if args.mode == "capture":
            capture(args.baseline, args.expected_web, args.report)
            return 0
        if args.mode == "check":
            check_baseline(args.baseline, args.expected_web)
            return 0
        if args.candidate_web is None or args.deadline is None or args.run_id is None:
            raise CompletionFailure("Rollout requires explicit candidate, deadline and run identifier")
        job = Completion(args.baseline, args.expected_web, args.candidate_web, args.deadline, args.run_id, args.report)
        signal.signal(signal.SIGTERM, job.signal)
        signal.signal(signal.SIGINT, job.signal)
        return job.run()
    except Exception:
        print("Web completion stopped; inspect the guarded recovery evidence", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
