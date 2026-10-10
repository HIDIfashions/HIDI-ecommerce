"""Read-only diagnosis of the first account OTP image update; never emit Azure values."""
import copy
import hashlib
import hmac
import json
from pathlib import Path
import secrets
import subprocess
import sys
import urllib.request

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from deploy.account_otp_release_guard import snapshot

EXPECTED_API = "acrhidiprod0927.azurecr.io/hidi-api@sha256:69d4c89fd6531658eba730b7254b7d34c9a274953e2fed4b46ce22caa13e56e6"
EXPECTED_WEB = "acrhidiprod0927.azurecr.io/hidi-web@sha256:e388b7f6c160d7ce7543649591d704f7e99c29ea5a86d2cf070acb5ca016e999"
OLD_API = "acrhidiprod0927.azurecr.io/hidi-api@sha256:89e6d010f2a4f9dcaea14451926f3512aec3ad5f079d110475ccc8c13b4a0448"
OLD_REVISION = "hidi-api--0000026"
BASELINE_HASH = "067208bb9c0f464abd3a9e8ffbd25bcdb7ea6014b18150e254143cadecf4b9d2"
EXPECTED_REVISIONS = {"hidi-api": "hidi-api--0000027", "hidi-web": "hidi-web--layout38001797854"}
AZURE_READS = (
    ("containerapp", "show", "-g", "rg-hidi-prod", "-n", "hidi-api"),
    ("containerapp", "show", "-g", "rg-hidi-prod", "-n", "hidi-web"),
    ("containerapp", "revision", "show", "-g", "rg-hidi-prod", "-n", "hidi-api", "--revision", OLD_REVISION),
)
PUBLIC_GETS = (
    "https://thidigk.thehidi.com/health",
    "https://thidigk.thehidi.com/api/store/health/ready",
    "https://thidigk.thehidi.com/api/store/auth/config",
)


def azure_read(arguments):
    if tuple(arguments) not in AZURE_READS:
        raise RuntimeError("Diagnostic rejected a non-allowlisted Azure operation")
    result = subprocess.run(["az", *arguments, "--only-show-errors", "-o", "json"], capture_output=True, text=True, timeout=60)
    if result.returncode:
        raise RuntimeError("Azure diagnostic read failed")
    try:
        return json.loads(result.stdout)
    except (ValueError, TypeError):
        raise RuntimeError("Azure diagnostic read returned invalid JSON") from None


def protected_template(template):
    value = copy.deepcopy(template)
    value.pop("revisionSuffix", None)
    assert len(value["containers"]) == 1, "Expected one retained API container"
    value["containers"][0].pop("image", None)
    value["containers"][0]["env"] = sorted(value["containers"][0].get("env", []), key=lambda item: item["name"])
    return value


def changed_field_digests(before, after, key, path="/template"):
    """Report presence/type and keyed digests, including empty collection changes."""
    missing = object()

    def describe(value):
        if value is missing:
            return {"present": False}
        kind = "null" if value is None else "boolean" if isinstance(value, bool) else "object" if isinstance(value, dict) else "array" if isinstance(value, list) else "string" if isinstance(value, str) else "number"
        encoded = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()
        return {"present": True, "type": kind, "hmac": hmac.new(key, encoded, hashlib.sha256).hexdigest()}

    def compare(left, right, current_path):
        if type(left) is type(right) and left == right:
            return []
        if isinstance(left, dict) and isinstance(right, dict):
            changes = []
            for name in sorted(left.keys() | right.keys()):
                escaped = name.replace("~", "~0").replace("/", "~1")
                changes.extend(compare(left.get(name, missing), right.get(name, missing), current_path + "/" + escaped))
            return changes
        if isinstance(left, list) and isinstance(right, list):
            changes = []
            for index in range(max(len(left), len(right))):
                changes.extend(compare(left[index] if index < len(left) else missing, right[index] if index < len(right) else missing, current_path + "/" + str(index)))
            return changes
        return [{"path": current_path, "before": describe(left), "after": describe(right)}]

    return compare(before, after, path)


def template_change_report(before_template, after_template, key):
    before, after = protected_template(before_template), protected_template(after_template)
    changes = changed_field_digests(before, after, key)
    before_env, after_env = before["containers"][0]["env"], after["containers"][0]["env"]
    blank_secret_paths, absent_or_null_paths = set(), set()
    for index, (old, current) in enumerate(zip(before_env, after_env)):
        reference = old.get("secretRef")
        if isinstance(reference, str) and reference and old.get("value") is None and current.get("value") == "" and {name: value for name, value in current.items() if name != "value"} == {name: value for name, value in old.items() if name != "value"}:
            path = "/template/containers/0/env/" + str(index) + "/value"
            absent_or_null_paths.add(path)
            if "value" not in old:
                blank_secret_paths.add(path)
    return {
        "changedProtectedFields": changes,
        "onlyMissingToEmptyValueOnRetainedSecretRefs": bool(changes) and {item["path"] for item in changes} == blank_secret_paths,
        "onlyAbsentOrNullToEmptyValueOnRetainedSecretRefs": bool(changes) and {item["path"] for item in changes} == absent_or_null_paths,
    }


def baseline_reconstructions(api, old_template):
    """Exactly four read-only hypotheses; none changes the deployed snapshot algorithm."""
    candidates = []
    full = copy.deepcopy(api)
    full["properties"]["template"] = copy.deepcopy(old_template)
    candidates.append(("old-revision-full-template", full, True))
    current_env = protected_template(api["properties"]["template"])["containers"][0]["env"]
    old_env = protected_template(old_template)["containers"][0]["env"]
    without_values = lambda env: [{name: value for name, value in entry.items() if name != "value"} for entry in env]
    non_value_fields_equal = without_values(current_env) == without_values(old_env)
    env_only = copy.deepcopy(api)
    env_only["properties"]["template"]["containers"][0]["env"] = copy.deepcopy(old_env)
    candidates.append(("old-revision-env-only", env_only, non_value_fields_equal))
    for basis in ["current-empty-secret-values-absent", "current-empty-secret-values-null"]:
        candidate = copy.deepcopy(api)
        for entry in candidate["properties"]["template"]["containers"][0].get("env", []):
            reference = entry.get("secretRef")
            if isinstance(reference, str) and reference and entry.get("value") == "":
                if basis.endswith("-absent"):
                    del entry["value"]
                else:
                    entry["value"] = None
        candidates.append((basis, candidate, True))
    return candidates


def build_report(api, web, old_revision, key):
    states = {"hidi-api": snapshot(api), "hidi-web": snapshot(web)}
    for app, expected in [("hidi-api", EXPECTED_API), ("hidi-web", EXPECTED_WEB)]:
        state = states[app]
        assert state["image"] == expected, "Current image differs from the diagnostic incident pin"
        assert state["mode"] == "Single" and state["latest"] == state["ready"] == EXPECTED_REVISIONS[app], "Current revision differs from the ready incident pin"
    assert old_revision["name"] == OLD_REVISION, "Unexpected old API revision"
    old_template = old_revision["properties"]["template"]
    assert old_template["containers"][0]["image"] == OLD_API, "Old revision image differs from the retained baseline"
    candidates, matches = [], []
    for basis, candidate, eligible in baseline_reconstructions(api, old_template):
        candidate_hash = snapshot(candidate)["settingsHash"]
        matched = eligible and candidate_hash == BASELINE_HASH
        entry = {"basis": basis, "eligible": eligible, "settingsHash": candidate_hash, "baselineMatched": matched}
        if matched:
            entry.update(template_change_report(candidate["properties"]["template"], api["properties"]["template"], key))
            matches.append(entry)
        candidates.append(entry)
    original = candidates[0]
    report = {"schemaVersion": 2, "operation": "read-only", "states": states, "baselineSettingsHash": BASELINE_HASH, "reconstructedSettingsHash": original["settingsHash"], "reconstructedBaselineMatches": original["baselineMatched"], "baselineMatched": bool(matches), "baselineCandidates": candidates, "matchedBaselineBases": [entry["basis"] for entry in matches]}
    # Revision GET and app GET models can expose different default/null fields.
    # This comparison is informative only until an exact full baseline matches.
    report["oldRevisionTemplateShapeComparison"] = {"purpose": "diagnostic-only", "baselineMatched": original["baselineMatched"], **template_change_report(old_template, api["properties"]["template"], key)}
    if matches:
        for field in ["changedProtectedFields", "onlyMissingToEmptyValueOnRetainedSecretRefs", "onlyAbsentOrNullToEmptyValueOnRetainedSecretRefs"]:
            report[field] = matches[0][field]
    return report


def public_gets():
    results = []
    for url in PUBLIC_GETS:
        request = urllib.request.Request(url, method="GET")
        with urllib.request.urlopen(request, timeout=15) as response:
            body = response.read(65537)
            assert response.status == 200 and len(body) <= 65536, "Public diagnostic GET failed"
        if url.endswith("/auth/config"):
            assert json.loads(body) == {"phoneOtp": True, "channel": "SMS", "provider": "msg91", "fallbackProvider": "firebase"}, "Public provider configuration differs from the retained configuration"
        results.append({"url": url, "status": 200})
    return results


def main():
    output = Path("evidence/account-otp-settings-diagnostic.json")
    try:
        api, web, old = [azure_read(arguments) for arguments in AZURE_READS]
        report = build_report(api, web, old, secrets.token_bytes(32))
        report["publicReadiness"] = public_gets()
        # Refuse to report a coherent incident diagnosis across an independent release.
        assert snapshot(azure_read(AZURE_READS[0])) == report["states"]["hidi-api"], "API changed during read-only diagnosis"
        assert snapshot(azure_read(AZURE_READS[1])) == report["states"]["hidi-web"], "Web changed during read-only diagnosis"
        output.parent.mkdir(exist_ok=True)
        output.write_text(json.dumps(report, indent=2) + "\n")
        print(json.dumps(report, indent=2))
        return 0 if report["baselineMatched"] else 2
    except Exception:
        # Neither Azure stderr, response JSON nor exception details are printable.
        print("Read-only settings diagnosis stopped; a pin, read or invariant failed", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
