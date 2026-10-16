"""Read-only diagnosis of the first account OTP image update; never emit env/secret values."""
import copy
from datetime import datetime, timezone
import hashlib
import hmac
import json
from pathlib import Path
import re
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
# API 2025-07-01 CommonDefinitions.json Scale documents these unset defaults.
# Its ContainerResources.ephemeralStorage is readOnly; retain the current value.
SCALE_DEFAULTS = {"cooldownPeriod": 300, "pollingInterval": 30}
DEFAULTS_SOURCE = "https://github.com/Azure/azure-rest-api-specs/blob/main/specification/app/resource-manager/Microsoft.App/ContainerApps/stable/2025-07-01/CommonDefinitions.json"
SUBSCRIPTION = "91d9572d-0f0b-47fe-802d-0eef36d7c719"
API_RESOURCE_ID = "/subscriptions/" + SUBSCRIPTION + "/resourceGroups/rg-hidi-prod/providers/Microsoft.App/containerApps/hidi-api"
GRAPH_URL = "https://management.azure.com/providers/Microsoft.ResourceGraph/resources?api-version=2024-04-01"
SNAPSHOT_PREFIX = "https://management.azure.com" + API_RESOURCE_ID + "/providers/Microsoft.Resources/snapshots/"
HISTORY_START, HISTORY_END = "2026-10-10T00:30:00Z", "2026-10-10T00:36:00Z"
HISTORY_QUERY = (
    "resourcechanges | where properties.targetResourceId =~ '" + API_RESOURCE_ID + "'"
    " | extend changeTime=todatetime(properties.changeAttributes.timestamp)"
    " | where changeTime >= datetime(" + HISTORY_START + ") and changeTime <= datetime(" + HISTORY_END + ")"
    " | where properties.changeType == 'Update' | order by changeTime asc, id asc | project id, changeTime, properties"
)
MAX_HISTORY_PAGES, HISTORY_PAGE_SIZE, MAX_HISTORY_RECORDS = 2, 4, 8


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


def graph_body(skip_token=None):
    body = {"subscriptions": [SUBSCRIPTION], "query": HISTORY_QUERY, "options": {"resultFormat": "objectArray", "$top": HISTORY_PAGE_SIZE}}
    if skip_token is not None:
        assert isinstance(skip_token, str) and 0 < len(skip_token) <= 4096, "Invalid bounded history continuation"
        body["options"]["$skipToken"] = skip_token
    return body


def snapshot_url(snapshot_id):
    assert isinstance(snapshot_id, str) and re.fullmatch(r"[A-Za-z0-9_-]{1,256}", snapshot_id), "Invalid target snapshot identifier"
    return SNAPSHOT_PREFIX + snapshot_id + "?api-version=2022-11-01-preview"


def azure_rest_read(method, url, body=None):
    """Only the fixed read-query POST and target-scoped snapshot GET are callable."""
    if method == "POST":
        assert url == GRAPH_URL and isinstance(body, dict) and body == graph_body(body.get("options", {}).get("$skipToken")), "Rejected non-allowlisted history query"
    else:
        assert method == "GET" and body is None and url.startswith(SNAPSHOT_PREFIX), "Rejected non-allowlisted snapshot operation"
        suffix = url[len(SNAPSHOT_PREFIX):]
        assert suffix.endswith("?api-version=2022-11-01-preview") and url == snapshot_url(suffix.split("?", 1)[0]), "Rejected non-allowlisted snapshot URL"
    arguments = ["az", "rest", "--method", method, "--url", url, "--only-show-errors", "-o", "json"]
    if body is not None:
        arguments += ["--body", json.dumps(body, separators=(",", ":"))]
    result = subprocess.run(arguments, capture_output=True, text=True, timeout=45)
    if result.returncode or len(result.stdout) > 4 * 1024 * 1024:
        raise RuntimeError("Bounded Azure history read failed")
    try:
        return json.loads(result.stdout)
    except (ValueError, TypeError):
        raise RuntimeError("Azure history read returned invalid JSON") from None


def incident_time(value):
    assert isinstance(value, str), "Invalid history timestamp"
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    assert parsed.tzinfo is not None, "History timestamp must include timezone"
    return parsed.astimezone(timezone.utc)


def read_incident_history():
    records, seen_ids, tokens = [], set(), set()
    token, total = None, None
    for page in range(MAX_HISTORY_PAGES):
        response = azure_rest_read("POST", GRAPH_URL, graph_body(token))
        data = response.get("data")
        assert isinstance(data, list) and len(data) <= HISTORY_PAGE_SIZE, "Invalid bounded history page"
        assert type(response.get("count")) is int and response["count"] == len(data), "History page count differs"
        assert type(response.get("totalRecords")) is int and len(data) <= response["totalRecords"] <= MAX_HISTORY_RECORDS, "History exceeded the explicit record bound"
        if total is None:
            total = response["totalRecords"]
        assert response["totalRecords"] == total, "History count changed during pagination"
        truncated = response.get("resultTruncated")
        assert type(truncated) is bool or truncated in ["false", "true"], "Invalid history truncation marker"
        assert len(records) + len(data) <= MAX_HISTORY_RECORDS, "History exceeded the explicit record bound"
        for record in data:
            properties = record["properties"]
            assert properties["targetResourceId"].lower() == API_RESOURCE_ID.lower(), "History targets a different resource"
            assert properties["changeType"] == "Update", "History contains an unexpected change type"
            timestamp = incident_time(properties["changeAttributes"]["timestamp"])
            assert incident_time(HISTORY_START) <= timestamp <= incident_time(HISTORY_END), "History falls outside the incident window"
            record_id = record["id"]
            assert isinstance(record_id, str) and record_id not in seen_ids, "History repeats a change record"
            seen_ids.add(record_id)
            changes = properties.get("changes", {})
            assert isinstance(changes, dict) and len(changes) <= 256, "Invalid bounded property history"
            assert all(change.get("isTruncated", False) in [False, "false"] for change in changes.values()), "A history field was truncated"
            snapshot_url(properties["changeAttributes"]["previousResourceSnapshotId"])
            records.append(record)
        token = response.get("$skipToken")
        if not token:
            assert truncated is False or truncated == "false", "History results were truncated without continuation"
            assert len(records) == response["totalRecords"], "History was not completely returned"
            return records
        assert data and token not in tokens and page + 1 < MAX_HISTORY_PAGES, "History continuation exceeds the explicit bound"
        tokens.add(token)
    raise RuntimeError("Bounded history did not complete")


def protected_settings(data):
    """The existing snapshot's field schema, solely for HMAC difference reporting."""
    properties = data["properties"]
    configuration = copy.deepcopy(properties["configuration"])
    configuration.get("ingress", {}).pop("traffic", None)
    return {
        "template": protected_template(properties["template"]), "configuration": configuration,
        "identity": data.get("identity", {}), "location": data.get("location"), "tags": data.get("tags", {}),
        "environmentId": properties.get("environmentId"), "managedEnvironmentId": properties.get("managedEnvironmentId"),
        "workloadProfileName": properties.get("workloadProfileName"),
    }


def protected_resource_change_report(before, after, key):
    classification = template_change_report(before["properties"]["template"], after["properties"]["template"], key)
    changes = changed_field_digests(protected_settings(before), protected_settings(after), key, "")
    template_paths = {item["path"] for item in classification["changedProtectedFields"]}
    all_paths = {item["path"] for item in changes}
    for field in classification:
        if field.startswith("only"):
            classification[field] = classification[field] and all_paths == template_paths
    classification["changedProtectedFields"] = changes
    return classification


def historical_snapshot_model(response, expected_snapshot_id):
    assert response["name"] == expected_snapshot_id and response["type"].lower() == "microsoft.resources/snapshots", "Unexpected historical snapshot envelope"
    expected_id = API_RESOURCE_ID + "/providers/Microsoft.Resources/snapshots/" + expected_snapshot_id
    assert response["id"].lower() == expected_id.lower(), "Historical snapshot belongs to another resource"
    resource = copy.deepcopy(response["properties"]["content"])
    assert resource["id"].lower() == API_RESOURCE_ID.lower(), "Historical content belongs to another resource"
    assert resource["type"].lower() == "microsoft.app/containerapps", "Historical content has a different resource type"
    # These revision status fields are not fingerprinted. No protected field is
    # added, dropped, merged or normalized to compensate for an API model shape.
    supplied = []
    if "latestRevisionName" not in resource["properties"]:
        resource["properties"]["latestRevisionName"] = "diagnostic-unhashed-placeholder"
        supplied.append("/properties/latestRevisionName")
    return resource, supplied


def declared_history_changes(changes, key):
    result = []
    for path, change in sorted(changes.items()):
        assert isinstance(path, str) and len(path) <= 1024, "Invalid history field path"
        protected = path.startswith(("properties.template.", "properties.configuration.", "identity.", "tags.")) or path in ["identity", "tags", "location", "properties.environmentId", "properties.managedEnvironmentId", "properties.workloadProfileName"]
        excluded = path == "properties.template.revisionSuffix" or path.endswith(".image") or path.startswith("properties.configuration.ingress.traffic")
        if not protected or excluded:
            continue
        description = {"path": path}
        for output_name, input_name in [("before", "previousValue"), ("after", "newValue")]:
            description[output_name] = changed_field_digests({}, {"field": change[input_name]}, key)[0]["after"] if input_name in change else {"present": False}
        result.append(description)
    return result


def resource_history_report(api, key):
    records = read_incident_history()
    report = {"purpose": "read-only-historical-baseline-proof", "window": {"start": HISTORY_START, "end": HISTORY_END}, "complete": True, "recordCount": len(records), "status": "empty-unresolved" if not records else "baseline-unresolved", "baselineMatched": False, "records": []}
    seen_snapshots = set()
    for index, record in enumerate(records):
        properties = record["properties"]
        attributes = properties["changeAttributes"]
        snapshot_id = attributes["previousResourceSnapshotId"]
        assert snapshot_id not in seen_snapshots, "History repeats a previous snapshot"
        seen_snapshots.add(snapshot_id)
        response = azure_rest_read("GET", snapshot_url(snapshot_id))
        resource, supplied = historical_snapshot_model(response, snapshot_id)
        state = snapshot(resource)
        matched = state["settingsHash"] == BASELINE_HASH and state["image"] == OLD_API
        version = response["properties"].get("apiVersion")
        assert isinstance(version, str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}(?:-preview)?", version), "Invalid captured resource API version"
        entry = {
            "index": index, "timestamp": incident_time(attributes["timestamp"]).isoformat(), "changeType": "Update",
            "capturedApiVersion": version, "unhashedMetadataSupplied": supplied,
            "priorSnapshotSettingsHash": state["settingsHash"], "priorImageMatches": state["image"] == OLD_API, "baselineMatched": matched,
            "declaredFieldChanges": {"purpose": "diagnostic-only", "fields": declared_history_changes(properties.get("changes", {}), key)},
        }
        if matched:
            entry.update(protected_resource_change_report(resource, api, key))
            report["baselineMatched"] = True
            report["status"] = "exact-baseline-matched"
        report["records"].append(entry)
    return report


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
    before_scale, after_scale = before.get("scale", {}), after.get("scale", {})
    default_scale_paths = {
        "/template/scale/" + field for field, default in SCALE_DEFAULTS.items()
        if field in before_scale and before_scale[field] is None
        and type(after_scale.get(field)) is int and after_scale[field] == default
    }
    paths = {item["path"] for item in changes}
    return {
        "changedProtectedFields": changes,
        "onlyMissingToEmptyValueOnRetainedSecretRefs": bool(changes) and paths == blank_secret_paths,
        "onlyAbsentOrNullToEmptyValueOnRetainedSecretRefs": bool(changes) and paths == absent_or_null_paths,
        "onlyMissingSecretRefValuesAndDocumentedScaleDefaults": bool(blank_secret_paths) and bool(default_scale_paths) and paths == blank_secret_paths | default_scale_paths,
        "onlyAbsentOrNullSecretRefValuesAndDocumentedScaleDefaults": bool(absent_or_null_paths) and bool(default_scale_paths) and paths == absent_or_null_paths | default_scale_paths,
    }


def baseline_reconstructions(api, old_template):
    """Four prior hypotheses plus nine bounded env/scale forms; never normalize snapshot."""
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
    current_scale = api["properties"]["template"].get("scale", {})
    old_scale = old_template.get("scale", {})
    scale_forms = (("cooldownPeriod",), ("pollingInterval",), ("cooldownPeriod", "pollingInterval"))
    for env_basis, env_candidate, env_eligible in candidates[1:].copy():
        for fields in scale_forms:
            candidate = copy.deepcopy(env_candidate)
            eligible = env_eligible and all(
                field in old_scale and old_scale[field] is None
                and type(current_scale.get(field)) is int and current_scale[field] == SCALE_DEFAULTS[field]
                for field in fields
            )
            if eligible:
                for field in fields:
                    candidate["properties"]["template"]["scale"][field] = None
            candidates.append((env_basis + "-scale-null-" + "-".join(fields), candidate, eligible))
    return candidates


def observed_nonsecret_scalars(before_template, after_template, key):
    """Expose only the three reviewed resource/default scalars; malformed data stays keyed."""
    observations = {}
    for field, path in [
        ("ephemeralStorage", "/template/containers/0/resources/ephemeralStorage"),
        ("cooldownPeriod", "/template/scale/cooldownPeriod"),
        ("pollingInterval", "/template/scale/pollingInterval"),
    ]:
        pair = {}
        for label, template in [("before", before_template), ("after", after_template)]:
            parent = template["containers"][0].get("resources", {}) if field == "ephemeralStorage" else template.get("scale", {})
            if field not in parent:
                pair[label] = {"present": False}
                continue
            value = parent[field]
            safe = value is None or (field != "ephemeralStorage" and type(value) is int) or (field == "ephemeralStorage" and isinstance(value, str) and re.fullmatch(r"\d+(?:\.\d+)?(?:Ki|Mi|Gi|Ti|Pi|Ei)", value))
            description = changed_field_digests({}, {field: value}, key, path)[0]["after"]
            if safe:
                description = {"present": True, "type": description["type"], "value": value}
            pair[label] = description
        observations[path] = pair
    return observations


def build_report(api, web, old_revision, key):
    states = {"hidi-api": snapshot(api), "hidi-web": snapshot(web)}
    assert api["id"].lower() == API_RESOURCE_ID.lower(), "Current API has a different resource ID"
    state = states["hidi-api"]
    assert state["image"] == EXPECTED_API, "Current image differs from the diagnostic incident pin"
    assert state["mode"] == "Single" and state["latest"] == state["ready"] == EXPECTED_REVISIONS["hidi-api"], "Current revision differs from the ready incident pin"
    # Web may be independently released; it does not authorize API inference.
    web_state = states["hidi-web"]
    assert re.fullmatch(r"acrhidiprod0927\.azurecr\.io/hidi-web@sha256:[0-9a-f]{64}", web_state["image"]), "Web image must be immutable"
    assert web_state["mode"] == "Single" and web_state["latest"] == web_state["ready"] and isinstance(web_state["latest"], str) and web_state["latest"].startswith("hidi-web--"), "Web must have a ready Single revision"
    assert old_revision["name"] == OLD_REVISION, "Unexpected old API revision"
    old_template = old_revision["properties"]["template"]
    assert old_template["containers"][0]["image"] == OLD_API, "Old revision image differs from the retained baseline"
    candidates, matches = [], []
    for basis, candidate, eligible in baseline_reconstructions(api, old_template):
        # Phase 3 does not test unsupported historical/default representations.
        candidate_hash = snapshot(candidate)["settingsHash"] if eligible or "-scale-null-" not in basis else None
        matched = eligible and candidate_hash == BASELINE_HASH
        entry = {"basis": basis, "eligible": eligible, "settingsHash": candidate_hash, "baselineMatched": matched}
        if matched:
            entry.update(template_change_report(candidate["properties"]["template"], api["properties"]["template"], key))
            matches.append(entry)
        candidates.append(entry)
    original = candidates[0]
    report = {"schemaVersion": 3, "operation": "read-only", "states": states, "baselineSettingsHash": BASELINE_HASH, "reconstructedSettingsHash": original["settingsHash"], "reconstructedBaselineMatches": original["baselineMatched"], "baselineMatched": bool(matches), "baselineCandidates": candidates, "matchedBaselineBases": [entry["basis"] for entry in matches]}
    report["documentedDefaultsSource"] = DEFAULTS_SOURCE
    report["observedNonsecretScalars"] = observed_nonsecret_scalars(old_template, api["properties"]["template"], key)
    # Revision GET and app GET models can expose different default/null fields.
    # This comparison is informative only until an exact full baseline matches.
    report["oldRevisionTemplateShapeComparison"] = {"purpose": "diagnostic-only", "baselineMatched": original["baselineMatched"], **template_change_report(old_template, api["properties"]["template"], key)}
    if matches:
        for field in ["changedProtectedFields", "onlyMissingToEmptyValueOnRetainedSecretRefs", "onlyAbsentOrNullToEmptyValueOnRetainedSecretRefs", "onlyMissingSecretRefValuesAndDocumentedScaleDefaults", "onlyAbsentOrNullSecretRefValuesAndDocumentedScaleDefaults"]:
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
        key = secrets.token_bytes(32)
        report = build_report(api, web, old, key)
        report["schemaVersion"] = 4
        report["resourceChangeHistory"] = resource_history_report(api, key)
        history = report["resourceChangeHistory"]
        # In this phase the prior model hypotheses are diagnostic evidence;
        # an empty or incompatible history cannot authorize baseline inference.
        report["baselineMatched"] = history["baselineMatched"]
        report["matchedBaselineBases"] = []
        for field in list(report):
            if field == "changedProtectedFields" or field.startswith("only"):
                del report[field]
        if history["baselineMatched"]:
            matched = next(entry for entry in history["records"] if entry["baselineMatched"])
            report["matchedBaselineBases"].append("resource-change-prior-snapshot")
            for field, value in matched.items():
                if field == "changedProtectedFields" or field.startswith("only"):
                    report[field] = value
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
