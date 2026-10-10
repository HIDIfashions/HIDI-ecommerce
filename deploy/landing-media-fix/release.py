"""Guarded web-only landing media repair over the freshly captured live image."""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import time
import urllib.error
import urllib.request
from urllib.parse import quote, unquote_to_bytes, urljoin, urlsplit


HERE = Path(__file__).resolve().parent
PRIVATE = Path(os.environ.get("RUNNER_TEMP", "/tmp")) / "hidi-landing-media-private"
EVIDENCE = Path("evidence/landing-media-fix")
LEGACY_MEDIA_ORIGIN = "https://thidigk.thehidi.com"
REPORT_PATHS = {
    "patch": EVIDENCE / "patch.json",
    "preservation": EVIDENCE / "web-preservation.json",
    "landingCandidate": EVIDENCE / "candidate.json",
    "adminQuickTools": EVIDENCE / "admin-quick-tools.json",
    "fourCategories": Path("evidence/four-categories/candidate.json"),
    "retainedCommerce": EVIDENCE / "retained-commerce/report.json",
}


class ReleaseInterrupted(RuntimeError):
    pass


class AmbiguousArmWrite(RuntimeError):
    pass


class NoArmRedirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, headers, new_url):
        return None


ARM_OPENER = urllib.request.build_opener(NoArmRedirects)


def install_interrupt_handler():
    def interrupted(signum, frame):
        raise ReleaseInterrupted("Release interrupted; reconciling owned web state")
    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


photo = load("landing_media_photo", HERE.parent / "photo-upload/release.py")
cloud, images = photo.cloud, photo.images
cloud.BASE = "https://hidiindia.com"
preserve = load("landing_media_preserve", HERE.parent / "product-skn/release.py")
patcher = load("landing_media_patcher", HERE / "patch-runtime.py")


def setup():
    photo.PRIVATE, photo.EVIDENCE = PRIVATE, EVIDENCE
    PRIVATE.mkdir(parents=True, exist_ok=True)
    PRIVATE.chmod(0o700)
    EVIDENCE.mkdir(parents=True, exist_ok=True)


def save(name, value):
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    (EVIDENCE / name).write_text(json.dumps(value, indent=2) + "\n")


def read(name):
    return json.loads((EVIDENCE / name).read_text())


def image_id(image):
    return json.loads(images.docker("image", "inspect", image))[0]["Id"]


def immutable(image, app):
    assert re.fullmatch(re.escape(images.REGISTRY + "/hidi-" + app) + r"@sha256:[a-f0-9]{64}", image), "Immutable HIDI image required"


def run_key(separator="-"):
    run_id = os.environ["GITHUB_RUN_ID"]
    attempt = os.environ.get("GITHUB_RUN_ATTEMPT", "1")
    assert run_id.isdigit() and attempt.isdigit(), "Numeric GitHub run identity required"
    return run_id + separator + attempt


def sha256_file(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def public_snapshot():
    return {
        "hero": json.loads(cloud.get("/api/hidi/hero-config")),
        "landing": json.loads(cloud.get("/api/hidi/landing-media-config")),
        "privacySha256": hashlib.sha256(cloud.get("/api/hidi/privacy-policy")).hexdigest(),
        "configSha256": hashlib.sha256(cloud.get("/config.js")).hexdigest(),
    }


def write_private(name, value):
    path = PRIVATE / name
    path.write_text(json.dumps(value))
    path.chmod(0o600)


def private_json(name):
    return json.loads((PRIVATE / name).read_text())


def media_normalization_config(web):
    entries = web["properties"]["template"]["containers"][0].get("env", [])
    env = {
        item["name"]: item.get("value", "")
        for item in entries
        if isinstance(item.get("name"), str) and isinstance(item.get("value"), str)
    }
    provider = env.get("MEDIA_STORAGE_PROVIDER", "").strip().lower()
    if not provider and env.get("AZURE_STORAGE_ACCOUNT", "").strip():
        provider = "azure"
    assert provider in {"azure", "azblob", "blob"}, "Landing media repair is Azure-only"

    account = env.get("AZURE_STORAGE_ACCOUNT", "").strip()
    endpoint = env.get("AZURE_STORAGE_BLOB_ENDPOINT", "").strip()
    if not endpoint and account:
        endpoint = "https://" + account + ".blob.core.windows.net"
    blob_host = urlsplit(endpoint).hostname
    assert blob_host, "Exact Azure Blob endpoint is required"

    public_base = next((env.get(name, "").strip() for name in (
        "MEDIA_PUBLIC_BASE_URL", "AZURE_MEDIA_PUBLIC_BASE_URL", "R2_PUBLIC_BASE_URL",
    ) if env.get(name, "").strip()), "")
    origins = [
        LEGACY_MEDIA_ORIGIN,
        public_base,
        env.get("SITE_URL", ""),
        *env.get("WEB_ORIGIN", "").split(","),
    ]
    public_hosts = set()
    for value in origins:
        try:
            host = urlsplit(value.strip()).hostname
        except (AttributeError, ValueError):
            host = None
        if host:
            public_hosts.add(host)
    assert urlsplit(LEGACY_MEDIA_ORIGIN).hostname in public_hosts
    return {
        "provider": "azure",
        "blobHost": blob_host,
        "publicHosts": sorted(public_hosts),
    }


def backup(before):
    for name, state in before.items():
        app = name.removeprefix("hidi-")
        tag_name = "backup-landing-media-" + run_key()
        tag = images.REGISTRY + "/" + name + ":" + tag_name
        for args in (("pull", state["image"]), ("tag", state["image"], tag), ("push", tag)):
            subprocess.run(["docker", *args], check=True)
        digest = subprocess.check_output([
            "az", "acr", "repository", "show", "--name", "acrhidiprod0927",
            "--image", name + ":" + tag_name, "--query", "digest", "-o", "tsv", "--only-show-errors",
        ], text=True).strip()
        assert digest == state["image"].split("@", 1)[1], "Backup digest mismatch: " + name
        save(app + "-backup.json", {
            "verified": True, "backupTag": tag, "originalImage": state["image"],
            "digest": digest, "settingsHash": state["settingsHash"],
        })
        photo.unchanged(before)


def require_backups(before):
    for name, state in before.items():
        app = name.removeprefix("hidi-")
        report = read(app + "-backup.json")
        assert report.get("verified") is True
        assert report.get("originalImage") == state["image"]
        assert report.get("settingsHash") == state["settingsHash"]
        digest = subprocess.check_output([
            "az", "acr", "repository", "show", "--name", "acrhidiprod0927",
            "--image", name + ":backup-landing-media-" + run_key(),
            "--query", "digest", "-o", "tsv", "--only-show-errors",
        ], text=True).strip()
        assert digest == report.get("digest") == state["image"].split("@", 1)[1], "Fresh verified backup required: " + name


def capture():
    setup()
    photo.capture()
    before = photo.states()
    assert not re.fullmatch(r"hidi-web--landingmedia\d+a\d+", before["hidi-web"]["latest"]), "Refusing to recapture an owned landing candidate as a new baseline"
    for name, state in before.items():
        immutable(state["image"], name.removeprefix("hidi-"))
    backup(before)
    web_resource = photo.originals()["hidi-web"]
    arm_url = "https://management.azure.com" + web_resource["id"] + "?api-version=" + cloud.API_VERSION
    arm_current, arm_etag, _, _, _ = arm_request("GET", arm_url, arm_token())
    assert cloud.snapshot(arm_current) == before["hidi-web"], "Direct ARM preflight differs from captured web state"
    normalization = media_normalization_config(photo.originals()["hidi-web"])
    write_private("normalization-config.json", normalization)
    snapshot = public_snapshot()
    write_private("public-before.json", snapshot)
    for name, value in (
        ("hero-config.json", snapshot["hero"]),
        ("landing-media-config.json", snapshot["landing"]),
        ("privacy-policy.json", json.loads(cloud.get("/api/hidi/privacy-policy"))),
    ):
        write_private(name, value)
    save("public-before-summary.json", {
        "heroSha256": hashlib.sha256(json.dumps(snapshot["hero"], sort_keys=True).encode()).hexdigest(),
        "landingSha256": hashlib.sha256(json.dumps(snapshot["landing"], sort_keys=True).encode()).hexdigest(),
        "privacySha256": snapshot["privacySha256"], "configSha256": snapshot["configSha256"],
        "mediaSourceSha": os.environ["HIDI_MEDIA_SOURCE_SHA"],
        "normalizationProvider": normalization["provider"],
        "armEtagAvailable": bool(arm_etag or arm_current.get("etag")),
        "databaseWrites": False, "blobWrites": False,
    })
    images.extract(before["hidi-api"]["image"], PRIVATE / "api/base-app")
    photo.unchanged(before)
    print("PASS: fresh live images, settings, public media selection and verified rollback tags captured")


def compose(tag):
    setup()
    assert re.fullmatch(re.escape(images.REGISTRY + "/hidi-web") + r":landing-media-[0-9]+-[0-9]+", tag), "Owned landing media candidate tag required"
    before = photo.states()
    require_backups(before)
    photo.unchanged(before)
    folder = PRIVATE / "web"
    folder.mkdir()
    base, overlay, candidate = (folder / name for name in ("base-app", "overlay", "candidate-app"))
    images.extract(before["hidi-web"]["image"], base)
    plan = patcher.patch_runtime(base, overlay)
    save("patch.json", plan)
    subprocess.run(["node", "--check", str(overlay / "hero-media.mjs")], check=True)
    (folder / "Dockerfile").write_text("FROM " + before["hidi-web"]["image"] + "\nCOPY --chown=node:node overlay/ /app/\n")
    subprocess.run(["docker", "build", "--pull=false", "-t", tag, str(folder)], check=True)
    images.extract(tag, candidate)
    configs = json.loads(images.docker("image", "inspect", before["hidi-web"]["image"], tag))
    report = preserve.verify(base, candidate, overlay, set(plan["allowedFiles"]), configs)
    report.update({
        "baseImage": before["hidi-web"]["image"], "candidateTag": tag,
        "candidateImageId": configs[1]["Id"], "apiUnchanged": True,
    })
    save("web-preservation.json", report)
    photo.unchanged(before)
    print("PASS: two-file web overlay preserves every unrelated live byte, image setting and base layer")


def mark_tested(tag):
    setup()
    preserved = read("web-preservation.json")
    candidate = read("candidate.json")
    categories = json.loads(Path("evidence/four-categories/candidate.json").read_text())
    commerce = json.loads((EVIDENCE / "retained-commerce/report.json").read_text())
    admin_tools = json.loads((EVIDENCE / "admin-quick-tools.json").read_text())
    assert preserved.get("passed") is True and preserved.get("candidateTag") == tag
    assert preserved.get("candidateImageId") == image_id(tag), "Candidate image changed after preservation proof"
    assert candidate.get("passed") is True and candidate.get("legacyUrlsNormalized") is True
    assert candidate.get("adminSlots") == ["hero", "range-everyday", "range-work-edit", "range-occasion", "ananya", "hidi-edit-banner"]
    assert candidate.get("blobWrites") == 0 and candidate.get("databaseWrites") == 0
    browsers = candidate.get("browserResults", [])
    assert {item.get("engine") for item in browsers} == {"chromium", "firefox", "webkit"}
    assert all(item.get("heroPaint") and item.get("casualPaint") and item.get("ananyaPaint") for item in browsers)
    assert all(not item.get("mediaFailures") and not item.get("blockingPageErrors") for item in browsers)
    assert categories.get("passed") is True and categories.get("actualRetainedNextAndLanding") is True
    assert commerce.get("passed") is True and commerce.get("liveWrites") == 0
    assert admin_tools.get("passed") is True and admin_tools.get("customerRoutesRetained") is True
    manifest = {name: sha256_file(path) for name, path in REPORT_PATHS.items()}
    save("candidate-regression.json", {
        "passed": True, "candidateImageId": preserved["candidateImageId"],
        "sourceSha": os.environ["GITHUB_SHA"],
        "mediaSourceSha": os.environ["HIDI_MEDIA_SOURCE_SHA"],
        "reportSha256": manifest["landingCandidate"],
        "reportManifest": manifest,
        "retainedFourCategoryRegression": True, "databaseWrites": False, "blobWrites": False,
    })


def verify_report_manifest(tested):
    expected = tested.get("reportManifest")
    assert isinstance(expected, dict) and set(expected) == set(REPORT_PATHS), "Complete candidate report manifest required"
    actual = {name: sha256_file(path) for name, path in REPORT_PATHS.items()}
    assert actual == expected, "Candidate evidence changed after testing"


def publish(tag):
    setup()
    preserved, tested = read("web-preservation.json"), read("candidate-regression.json")
    assert tested.get("passed") is True
    assert preserved.get("candidateImageId") == tested.get("candidateImageId") == image_id(tag)
    assert tested.get("sourceSha") == os.environ["GITHUB_SHA"]
    assert tested.get("mediaSourceSha") == os.environ["HIDI_MEDIA_SOURCE_SHA"]
    verify_report_manifest(tested)
    photo.unchanged(photo.states())
    subprocess.run(["docker", "push", tag], check=True)
    digest = subprocess.check_output([
        "az", "acr", "repository", "show", "--name", "acrhidiprod0927",
        "--image", "hidi-web:landing-media-" + run_key(),
        "--query", "digest", "-o", "tsv", "--only-show-errors",
    ], text=True).strip()
    image = images.REGISTRY + "/hidi-web@" + digest
    immutable(image, "web")
    subprocess.run(["docker", "pull", image], check=True)
    assert image_id(image) == tested["candidateImageId"], "Published image differs from tested candidate"
    save("published.json", {"verified": True, "image": image, "candidateImageId": tested["candidateImageId"], "sourceSha": os.environ["GITHUB_SHA"], "mediaSourceSha": os.environ["HIDI_MEDIA_SOURCE_SHA"], "reportManifest": tested["reportManifest"]})
    with open(os.environ["GITHUB_ENV"], "a") as output:
        output.write("WEB_IMAGE=" + image + "\n")
    print("PASS: published immutable web image independently matches the tested candidate")


def normalized_url(value, config):
    if not isinstance(value, str):
        return value
    try:
        parsed = urlsplit(value)
        path = parsed.path
    except ValueError:
        return value
    absolute = bool(re.match(r"^[a-z][a-z\d+.-]*:", value, re.I)) or value.startswith("//")
    encoded = ""
    if path.startswith("/api/hidi/hero-asset/"):
        if absolute and parsed.hostname not in config["publicHosts"]:
            return value
        encoded = path.removeprefix("/api/hidi/hero-asset/")
    elif path.startswith("/media/brand/"):
        if absolute and parsed.hostname not in config["publicHosts"]:
            return value
        encoded = path.removeprefix("/media/")
    else:
        markers = ("/brand/hero/media/", "/brand/landing-media/media/")
        marker = next((item for item in markers if item in path), "")
        if marker and parsed.hostname != config["blobHost"]:
            return value
        if marker:
            encoded = path[path.index(marker) + 1:]
    if not encoded:
        return value
    if re.search(r"%(?![0-9a-fA-F]{2})", encoded):
        return value
    try:
        key = "/".join(unquote_to_bytes(part).decode("utf-8", "strict") for part in encoded.split("/"))
    except (UnicodeDecodeError, ValueError):
        return value
    if not key.startswith(("brand/hero/media/", "brand/landing-media/media/")) or ".." in key or "\\" in key or "\0" in key:
        return value
    return "/api/hidi/hero-asset/" + "/".join(quote(part, safe="-_.!~*'()") for part in key.split("/"))


def normalized_payload(value, config, key=""):
    if isinstance(value, dict):
        return {name: normalized_payload(item, config, name) for name, item in value.items()}
    if isinstance(value, list):
        return [normalized_payload(item, config, key) for item in value]
    return normalized_url(value, config) if key == "url" else value


def arm_token():
    token = subprocess.check_output([
        "az", "account", "get-access-token", "--resource", "https://management.azure.com/",
        "--query", "accessToken", "-o", "tsv", "--only-show-errors",
    ], text=True, timeout=90).strip()
    assert token, "Azure management token unavailable"
    return token


def arm_request(method, url, token, body=None, etag=None):
    headers = {"Authorization": "Bearer " + token}
    if body is not None:
        headers["Content-Type"] = "application/json"
    if etag is not None:
        headers["If-Match"] = etag
    request = urllib.request.Request(
        url,
        data=None if body is None else json.dumps(body).encode(),
        headers=headers,
        method=method,
    )
    try:
        # Never allow urllib to forward the ARM bearer token across a redirect.
        with ARM_OPENER.open(request, timeout=180) as response:
            payload = response.read(16 * 1024 * 1024)
            operation = (
                response.headers.get("Azure-AsyncOperation")
                or response.headers.get("Operation-Location")
                or response.headers.get("Location")
            )
            retry_after = response.headers.get("Retry-After")
            return json.loads(payload or b"{}"), response.headers.get("ETag"), operation, response.status, retry_after
    except urllib.error.HTTPError as error:
        code = "HTTP_" + str(error.code)
        try:
            candidate = json.loads(error.read(65536)).get("error", {}).get("code")
            if isinstance(candidate, str) and re.fullmatch(r"[A-Za-z0-9_.-]{1,100}", candidate):
                code = candidate
        except (ValueError, AttributeError):
            pass
        raise cloud.AzureOperationError("Conditional Azure operation rejected: " + code) from None


def trusted_arm_operation_url(value):
    operation = urljoin("https://management.azure.com/", value)
    parsed = urlsplit(operation)
    if (
        parsed.scheme.lower() != "https"
        or parsed.netloc.lower() != "management.azure.com"
        or parsed.fragment
        or not parsed.path.startswith(("/subscriptions/", "/providers/"))
    ):
        raise AmbiguousArmWrite("Azure returned an untrusted operation URL")
    return operation


def wait_arm_operation(operation, token, retry_after=None):
    if not operation:
        return
    operation = trusted_arm_operation_url(operation)
    deadline = time.monotonic() + 600
    while time.monotonic() < deadline:
        delay = 5
        try:
            if retry_after is not None:
                delay = min(30, max(1, int(retry_after)))
        except (TypeError, ValueError):
            pass
        time.sleep(delay)
        payload, _, next_operation, status_code, retry_after = arm_request("GET", operation, token)
        state = str(payload.get("status", "")).lower() if isinstance(payload, dict) else ""
        if state in {"succeeded", "success", "completed"} or (not state and status_code in {200, 201, 204}):
            return
        if state in {"failed", "canceled", "cancelled"}:
            raise cloud.AzureOperationError("Azure image update operation ended: " + state)
        operation = trusted_arm_operation_url(next_operation or operation)
    # The management operation can still complete after our polling budget.
    # Treat that as an ambiguous write so recovery observes the owned revision
    # instead of assuming that the PATCH failed.
    raise AmbiguousArmWrite("Azure image update operation did not finish within the polling budget")


def conditional_write_image(expected, image, suffix, write_marker=None):
    url = "https://management.azure.com" + expected["id"] + "?api-version=" + cloud.API_VERSION
    token = arm_token()
    current, etag, _, _, _ = arm_request("GET", url, token)
    etag = etag or current.get("etag")
    assert cloud.snapshot(current) == cloud.snapshot(expected), "Container App changed before conditional image write"
    body = cloud.image_patch(current, image, suffix)
    # Container Apps' stable ARM schema does not advertise ETags. Use its
    # response ETag when present; otherwise the immediately preceding exact
    # snapshot comparison remains the provider's strongest available guard.
    if write_marker:
        write_private(write_marker, {"attempted": True, "mayComplete": True})
    try:
        _, _, operation, status_code, retry_after = arm_request("PATCH", url, token, body=body, etag=etag)
    except (urllib.error.URLError, TimeoutError) as error:
        raise AmbiguousArmWrite("Azure image write response was lost") from error
    if status_code == 202 or operation:
        wait_arm_operation(operation, token, retry_after)


def wait_ready(image, suffix, baseline):
    deadline = time.monotonic() + 600
    while time.monotonic() < deadline:
        api = cloud.snapshot(cloud.app("hidi-api"))
        assert api == baseline["hidi-api"], "API changed during web-only release"
        data = cloud.app("hidi-web")
        state = cloud.snapshot(data)
        assert state["settingsHash"] == baseline["hidi-web"]["settingsHash"], "Web settings changed independently"
        if state["image"] == image and state["latest"] == state["ready"] == "hidi-web--" + suffix:
            return data
        assert state["image"] in (baseline["hidi-web"]["image"], image), "Concurrent web image deployment"
        assert state["latest"] in (baseline["hidi-web"]["latest"], "hidi-web--" + suffix), "Concurrent web revision"
        time.sleep(5)
    raise AssertionError("Landing media web revision did not become ready")


def require_candidate(image, before):
    preserved, tested, published = read("web-preservation.json"), read("candidate-regression.json"), read("published.json")
    plan = read("patch.json")
    assert preserved.get("passed") is True and preserved.get("baseImage") == before["hidi-web"]["image"]
    assert set(preserved.get("changedFiles", [])) == set(plan["allowedFiles"]) == {"hero-media.mjs", "dist/landing-media-control.html"}
    assert tested.get("passed") is True and published.get("verified") is True and published.get("image") == image
    assert preserved.get("candidateImageId") == tested.get("candidateImageId") == published.get("candidateImageId")
    assert tested.get("sourceSha") == published.get("sourceSha") == os.environ["GITHUB_SHA"]
    assert tested.get("mediaSourceSha") == published.get("mediaSourceSha") == os.environ["HIDI_MEDIA_SOURCE_SHA"]
    assert tested.get("reportManifest") == published.get("reportManifest")
    verify_report_manifest(tested)


def routes():
    for path in (
        "/health", "/healthz", "/api/store/health/ready", "/", "/collections/casual-wear",
        "/collections/work-wear", "/collections/occasional-wear", "/collections/ananyas-pick",
        "/collections/all", "/cart", "/checkout", "/account", "/wishlist", "/shipping", "/returns",
        "/admin", "/admin/products", "/admin/import", "/admin/inventory/receive", "/admin/landing-media",
        "/admin/packing-scanner", "/admin/product-quick-fill", "/admin/product-bulk", "/admin/product-delete",
    ):
        cloud.get(path)
    for path in ("/api/admin/products/options", "/api/admin/orders?status=CONFIRMED", "/api/hidi/privacy-policy/admin"):
        cloud.get(path, 401)


def wait_restored(original, candidate, owned_revision, rollback_suffix, baseline, expected_settings):
    rollback_revision = "hidi-web--" + rollback_suffix
    deadline = time.monotonic() + 600
    while time.monotonic() < deadline:
        data = cloud.app("hidi-web")
        state = cloud.snapshot(data)
        assert state["settingsHash"] == expected_settings, "Web settings changed during rollback"
        if state["image"] == original and state["latest"] == state["ready"] == rollback_revision:
            return data
        assert state["image"] in {original, candidate}, "Independent web image appeared during rollback"
        assert state["latest"] in {baseline["hidi-web"]["latest"], owned_revision, rollback_revision}, "Independent web revision appeared during rollback"
        time.sleep(5)
    raise AssertionError("Rollback revision did not become ready")


def candidate_public_fields_live(current, captured, candidate_public):
    changed_keys = [key for key in captured if captured.get(key) != candidate_public.get(key)]
    return any(current.get(key) == candidate_public.get(key) for key in changed_keys)


def settle_restored_public(captured, candidate_public):
    deadline = time.monotonic() + 120
    captured_streak = 0
    while time.monotonic() < deadline:
        current = public_snapshot()
        if current == captured:
            captured_streak += 1
            if captured_streak >= 3:
                return {"publicSnapshotRestored": True, "independentPublicChangePreserved": False}
            time.sleep(5)
            continue
        captured_streak = 0
        if candidate_public_fields_live(current, captured, candidate_public):
            time.sleep(5)
            continue
        return {"publicSnapshotRestored": False, "independentPublicChangePreserved": True}
    raise AssertionError("Candidate responses remained live after rollback became ready")


def restored_result(restored_data, settings_reference, before, captured, candidate_public):
    restored = cloud.snapshot(restored_data)
    result = {
        "passed": True,
        "webStatus": "restored",
        "state": restored,
        "apiUnchanged": cloud.snapshot(cloud.app("hidi-api")) == before["hidi-api"],
        "webSettingsPreservedDuringRecovery": restored["settingsHash"] == settings_reference,
        "webSettingsUnchangedFromCapture": restored["settingsHash"] == before["hidi-web"]["settingsHash"],
    }
    result.update(settle_restored_public(captured, candidate_public))
    return result


def owned_state_active(state, candidate, owned_revision, rollback_revision):
    return bool(state) and (
        state["image"] == candidate
        or state["latest"] in {owned_revision, rollback_revision}
        or state["ready"] in {owned_revision, rollback_revision}
    )


def reconcile_failure(image, before, captured, candidate_public, suffix, forward_may_complete=False):
    owned_revision = "hidi-web--" + suffix
    rollback_suffix = "landingmediarb" + run_key("a")
    rollback_revision = "hidi-web--" + rollback_suffix
    deadline = time.monotonic() + 600
    last_state = None
    rollback_attempted = False
    while time.monotonic() < deadline:
        data = cloud.app("hidi-web")
        current = cloud.snapshot(data)
        last_state = current
        if current["latest"] == rollback_revision and current["image"] in {before["hidi-web"]["image"], image}:
            restored_data = wait_restored(
                before["hidi-web"]["image"], image, owned_revision,
                rollback_suffix, before, current["settingsHash"],
            )
            return restored_result(restored_data, current["settingsHash"], before, captured, candidate_public)
        if current["image"] == image and current["latest"] == owned_revision:
            # Re-read the exact owned state and use an ETag precondition when
            # the Container Apps ARM response supplies one.
            if rollback_attempted:
                time.sleep(5)
                continue
            rollback_attempted = True
            try:
                conditional_write_image(data, before["hidi-web"]["image"], rollback_suffix)
            except (AmbiguousArmWrite, urllib.error.URLError, TimeoutError):
                time.sleep(5)
                continue
            restored_data = wait_restored(
                before["hidi-web"]["image"], image, owned_revision,
                rollback_suffix, before, current["settingsHash"],
            )
            return restored_result(restored_data, current["settingsHash"], before, captured, candidate_public)
        # If another deployment has started while traffic still points at one
        # of this run's revisions, observe it until the ownership is resolved.
        # Reporting an independent change at this point would leave candidate
        # traffic active while claiming that recovery had completed.
        if current["ready"] in {owned_revision, rollback_revision}:
            time.sleep(5)
            continue
        if current["settingsHash"] != before["hidi-web"]["settingsHash"]:
            if current["image"] == before["hidi-web"]["image"] and current["latest"] == before["hidi-web"]["latest"]:
                time.sleep(5)
                continue
            if forward_may_complete:
                time.sleep(5)
                continue
            return {"passed": True, "webStatus": "independent-change-not-overwritten", "apiUnchanged": cloud.snapshot(cloud.app("hidi-api")) == before["hidi-api"], "state": current}
        allowed_images = {before["hidi-web"]["image"], image}
        allowed_revisions = {before["hidi-web"]["latest"], owned_revision, rollback_revision}
        if current["image"] not in allowed_images or current["latest"] not in allowed_revisions:
            if forward_may_complete:
                time.sleep(5)
                continue
            return {"passed": True, "webStatus": "independent-change-not-overwritten", "apiUnchanged": cloud.snapshot(cloud.app("hidi-api")) == before["hidi-api"], "state": current}
        time.sleep(5)

    if owned_state_active(last_state, image, owned_revision, rollback_revision):
        return {
            "passed": False,
            "webStatus": "restore-failed",
            "reason": "owned release state remained active after the recovery deadline",
            "apiUnchanged": cloud.snapshot(cloud.app("hidi-api")) == before["hidi-api"],
            "state": last_state,
        }
    if forward_may_complete:
        return {
            "passed": False,
            "webStatus": "restore-failed",
            "reason": "forward Azure write remained ambiguous after the recovery deadline",
            "apiUnchanged": cloud.snapshot(cloud.app("hidi-api")) == before["hidi-api"],
            "state": last_state,
        }
    if last_state == before["hidi-web"]:
        result = {
            "passed": True,
            "webStatus": "original-retained",
            "state": last_state,
            "apiUnchanged": cloud.snapshot(cloud.app("hidi-api")) == before["hidi-api"],
        }
        result.update(settle_restored_public(captured, candidate_public))
        return result
    return {"passed": True, "webStatus": "independent-change-not-overwritten", "apiUnchanged": cloud.snapshot(cloud.app("hidi-api")) == before["hidi-api"], "state": last_state}


def apply(image):
    setup()
    immutable(image, "web")
    before = photo.states()
    require_backups(before)
    require_candidate(image, before)
    photo.unchanged(before)
    captured = private_json("public-before.json")
    assert public_snapshot() == captured, "Published media or policy changed after capture"
    normalization = private_json("normalization-config.json")
    expected = {
        **captured,
        "hero": normalized_payload(captured["hero"], normalization),
        "landing": normalized_payload(captured["landing"], normalization),
    }
    suffix = "landingmedia" + run_key("a")
    write_private("forward-write.json", {"attempted": False, "mayComplete": False})
    install_interrupt_handler()
    try:
        photo.unchanged(before)
        conditional_write_image(photo.originals()["hidi-web"], image, suffix, "forward-write.json")
        deployed_web = cloud.snapshot(wait_ready(image, suffix, before))
        deployed = {"hidi-api": before["hidi-api"], "hidi-web": deployed_web}
        routes()
        subprocess.run(["node", str(HERE / "live.mjs")], check=True, timeout=900)
        actual = public_snapshot()
        assert actual == expected, "Live public selection changed beyond approved URL normalization"
        photo.unchanged(deployed)
        save("after.json", {
            "passed": True, "states": deployed, "sourceSha": os.environ["GITHUB_SHA"],
            "mediaSourceSha": os.environ["HIDI_MEDIA_SOURCE_SHA"],
            "apiUnchanged": True, "webSettingsPreserved": True, "privacyAndConfigPreserved": True,
            "mediaSelectionsPreserved": True, "approvedUrlNormalizationOnly": True,
            "databaseWrites": False, "blobWrites": False,
        })
        print("PASS: landing uploads restored; selections, API, settings, SQL and Blob content preserved")
    except Exception:
        try:
            marker = private_json("forward-write.json")
            recovery = reconcile_failure(
                image, before, captured, expected, suffix,
                bool(marker.get("attempted") and marker.get("mayComplete")),
            )
        except Exception as recovery_error:
            recovery = {"passed": False, "webStatus": "restore-failed", "errorType": type(recovery_error).__name__}
        recovery.update({"apiWrites": False, "databaseWrites": False, "blobWrites": False})
        save("rollback.json", recovery)
        raise


def recover(image):
    setup()
    immutable(image, "web")
    before = photo.states()
    captured = private_json("public-before.json")
    normalization = private_json("normalization-config.json")
    candidate_public = {
        **captured,
        "hero": normalized_payload(captured["hero"], normalization),
        "landing": normalized_payload(captured["landing"], normalization),
    }
    # The recovery process may be starting after an abrupt process kill. It
    # must assume the forward PATCH could have been accepted even if the local
    # intent marker was never flushed.
    result = reconcile_failure(
        image, before, captured, candidate_public,
        "landingmedia" + run_key("a"), forward_may_complete=True,
    )
    result.update({"externalRecovery": True, "apiWrites": False, "databaseWrites": False, "blobWrites": False})
    save("external-recovery.json", result)
    assert result.get("passed") is True and result.get("webStatus") != "restore-failed"
    print("PASS: external release reconciliation completed without overwriting independent state")


def self_test():
    shaped = {"properties": {"template": {"containers": [{"env": [
        {"name": "MEDIA_STORAGE_PROVIDER", "value": "azure"},
        {"name": "AZURE_STORAGE_ACCOUNT", "value": "sthidiprod0927"},
        {"name": "MEDIA_PUBLIC_BASE_URL", "value": "https://primary.example/media"},
        {"name": "AZURE_MEDIA_PUBLIC_BASE_URL", "value": "https://ignored.example/media"},
        {"name": "WEB_ORIGIN", "value": "https://hidiindia.com, https://www.hidiindia.com"},
    ]}]}}}
    shaped_config = media_normalization_config(shaped)
    assert "primary.example" in shaped_config["publicHosts"] and "ignored.example" not in shaped_config["publicHosts"]
    config = {
        "provider": "azure",
        "blobHost": "sthidiprod0927.blob.core.windows.net",
        "publicHosts": ["hidiindia.com", "thidigk.thehidi.com"],
    }
    key = "brand/landing-media/media/20261010/a b.png"
    proxy = "/api/hidi/hero-asset/brand/landing-media/media/20261010/a%20b.png"
    assert normalized_url("https://thidigk.thehidi.com/media/" + key, config) == proxy
    assert normalized_url("/media/" + key, config) == proxy
    assert normalized_url("https://sthidiprod0927.blob.core.windows.net/hero/" + key, config) == proxy
    for value in (
        "https://unrelated.example/media/" + key,
        "https://other.blob.core.windows.net/hero/" + key,
        "https://thidigk.thehidi.com/media/brand/landing-media/media/%E0%A4%A.png",
    ):
        assert normalized_url(value, config) == value
    assert trusted_arm_operation_url("/subscriptions/operation/123") == "https://management.azure.com/subscriptions/operation/123"
    for value in (
        "http://management.azure.com/subscriptions/operation",
        "https://management.azure.com.evil.example/subscriptions/operation",
        "//evil.example/subscriptions/operation",
        "https://management.azure.com:443/subscriptions/operation",
        "https://management.azure.com/not-arm/operation",
    ):
        try:
            trusted_arm_operation_url(value)
        except AmbiguousArmWrite:
            pass
        else:
            raise AssertionError("Untrusted Azure operation URL was accepted")
    captured = {"hero": "old-hero", "landing": "old-landing", "privacySha256": "old-policy"}
    candidate = {**captured, "hero": "new-hero", "landing": "new-landing"}
    assert candidate_public_fields_live({"hero": "old-hero", "landing": "new-landing", "privacySha256": "independent"}, captured, candidate)
    assert not candidate_public_fields_live({"hero": "old-hero", "landing": "old-landing", "privacySha256": "independent"}, captured, candidate)
    original_state = {"image": "original", "latest": "old", "ready": "old"}
    assert not owned_state_active(original_state, "candidate", "forward", "rollback")
    for owned_state in (
        {"image": "candidate", "latest": "old", "ready": "old"},
        {"image": "original", "latest": "forward", "ready": "old"},
        {"image": "original", "latest": "other", "ready": "rollback"},
    ):
        assert owned_state_active(owned_state, "candidate", "forward", "rollback")
    print("PASS: strict release-side URL normalization matches the bounded runtime migration")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=("self-test", "capture", "compose", "mark-tested", "publish", "apply", "recover"))
    parser.add_argument("--tag")
    parser.add_argument("--image")
    args = parser.parse_args()
    if args.mode == "self-test":
        self_test()
    elif args.mode == "capture":
        capture()
    elif args.mode == "compose":
        compose(args.tag)
    elif args.mode == "mark-tested":
        mark_tested(args.tag)
    elif args.mode == "publish":
        publish(args.tag)
    elif args.mode == "apply":
        apply(args.image)
    else:
        recover(args.image)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(str(error) if isinstance(error, (AssertionError, cloud.AzureOperationError)) else "Landing media release stopped; inspect bounded evidence")
        raise SystemExit(1)
