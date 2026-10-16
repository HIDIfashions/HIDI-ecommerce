"""Guarded additive SKN release over fresh immutable Azure images.

Reuse the existing photo-release image/cloud primitives. SQL preparation is a
separate, explicitly checked private-owner step; image rollback keeps mappings.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tarfile

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
REPO = ROOT.parent
BASELINE = "38da6ad9e561e5f2c33740d863cb4bd03c8c18cd"
API_STEMS = {"admin/products/admin-products.service", "admin/admin-inventory.service", "products/products.service"}
NEW_API_STEMS = {"admin/products/product-skn"}
API_FILES = {"apps/api/dist/" + stem + ext for stem in API_STEMS | NEW_API_STEMS for ext in (".js", ".js.map")}
API_SOURCES = {"apps/api/src/" + stem + ".ts" for stem in API_STEMS | NEW_API_STEMS}
WEB_SOURCES = {
    "apps/web/app/collections/[slug]/page.tsx",
    "apps/web/app/api/admin/inventory/[variantId]/images/route.ts",
    "apps/web/components/admin-import/bulk-import-client.tsx",
    "apps/web/lib/admin-products-contract.ts",
}
WEB_ASSETS = {"handler.mjs", "navigation.js", "product-sheet.mjs", "product-batch.mjs", "product-bulk.html", "product-bulk.mjs", "product-photos.html", "product-photos.mjs", "product-photo-match.mjs"}
PRIVATE = Path(os.environ.get("RUNNER_TEMP", "/tmp")) / "hidi-product-skn-private"
EVIDENCE = Path("evidence/product-skn")
OWNER_REPORT_FIELDS = {"passed", "definitionsVerified", "databaseHash", "ownerSchemaHash", "migrationSha256", "apiImage", "apiSettingsHash", "verifiedAtUtc"}
OWNER_REPORT_MAX_BYTES = 8192


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


photo = load("skn_photo_release", ROOT / "photo-upload/release.py")
images, cloud = photo.images, photo.cloud
web_patcher = load("skn_web_patcher", HERE / "patch-web.py")
landing_patcher = load("skn_landing_patcher", HERE / "patch-landing.py")


def paths():
    photo.PRIVATE, photo.EVIDENCE = PRIVATE, EVIDENCE


def save(name, value):
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    (EVIDENCE / name).write_text(json.dumps(value, indent=2) + "\n")


def read(name):
    return json.loads((EVIDENCE / name).read_text())


def originals():
    return {name: json.loads((PRIVATE / (name + ".json")).read_text()) for name in ("hidi-api", "hidi-web")}


def states():
    return {name: cloud.snapshot(data) for name, data in originals().items()}


def unchanged(expected):
    for name, state in expected.items():
        current = cloud.snapshot(cloud.app(name))
        cloud.ready(current)
        assert current == state, "Concurrent application change: " + name


def immutable(image, name):
    assert re.fullmatch(re.escape(images.REGISTRY + "/" + name) + r"@sha256:[a-f0-9]{64}", image), "Immutable HIDI image required"


def baseline():
    protected = ["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "apps/api/package.json", "apps/api/tsconfig.json", "apps/api/nest-cli.json", "apps/api/prisma/schema.prisma", "apps/web/package.json", "apps/web/next.config.ts", "apps/web/tsconfig.json"]
    for name in protected:
        assert Path(name).read_bytes() == subprocess.check_output(["git", "show", BASELINE + ":" + name]), "Dependency, schema or build configuration changed: " + name
    changed = set(subprocess.check_output(["git", "diff", "--name-only", BASELINE, "--", "apps/api/src", "apps/web"], text=True).splitlines())
    assert changed <= API_SOURCES | WEB_SOURCES, "Unreviewed application source changes: " + str(sorted(changed - API_SOURCES - WEB_SOURCES))
    PRIVATE.mkdir(parents=True, exist_ok=True)
    PRIVATE.chmod(0o700)
    destination = PRIVATE / "baseline-source"
    destination.mkdir()
    archive = subprocess.check_output(["git", "archive", BASELINE, "apps/api/src", "apps/api/tsconfig.json", "apps/api/package.json"])
    with tarfile.open(fileobj=io.BytesIO(archive)) as stream:
        stream.extractall(destination, filter="data")
    api = destination / "apps/api"
    (api / "node_modules").symlink_to(Path("apps/api/node_modules").resolve(), target_is_directory=True)
    generated = api / "src/generated/prisma"
    if not generated.exists():
        generated.parent.mkdir(exist_ok=True)
        generated.symlink_to(Path("apps/api/src/generated/prisma").resolve(), target_is_directory=True)
    subprocess.run(["node", "apps/api/node_modules/typescript/bin/tsc", "-p", str(api / "tsconfig.json")], check=True)
    save("baseline-source.json", {"passed": True, "sourceCommit": BASELINE, "reviewedSourceFiles": sorted(changed), "dependenciesAndSchemaUnchanged": True})


def capture():
    paths()
    photo.capture()
    print("PASS: fresh immutable images, private settings and public content captured")


def backup():
    before = states()
    unchanged(before)
    for name, state in before.items():
        tag_name = "backup-product-skn-" + os.environ["GITHUB_RUN_ID"]
        tag = images.REGISTRY + "/" + name + ":" + tag_name
        for args in (("pull", state["image"]), ("tag", state["image"], tag), ("push", tag)):
            subprocess.run(["docker", *args], check=True)
        digest = subprocess.check_output(["az", "acr", "repository", "show", "--name", "acrhidiprod0927", "--image", name + ":" + tag_name, "--query", "digest", "-o", "tsv", "--only-show-errors"], text=True).strip()
        assert digest == state["image"].split("@", 1)[1], "Backup digest mismatch"
        save(name + "-backup.json", {"verified": True, "image": tag, "originalImage": state["image"], "digest": digest, "settingsHash": state["settingsHash"]})
    unchanged(before)


def require_backups():
    for name, state in states().items():
        report = read(name + "-backup.json")
        assert report.get("verified") is True and report.get("originalImage") == state["image"] and report.get("settingsHash") == state["settingsHash"] and report.get("digest") == state["image"].split("@", 1)[1], "Fresh verified rollback backup required"


def verify_api_baseline(base):
    for stem in API_STEMS:
        for ext in (".js", ".js.map"):
            name = "apps/api/dist/" + stem + ext
            assert (base / name).read_bytes() == (PRIVATE / "baseline-source" / name).read_bytes(), "Live API differs from pinned baseline: " + name
    for stem in NEW_API_STEMS:
        for ext in (".js", ".js.map"):
            assert not (base / ("apps/api/dist/" + stem + ext)).exists(), "New SKN helper already exists in retained image"


def verify(base, candidate, overlay, allowed, configs):
    first, last = images.fingerprints(base), images.fingerprints(candidate)
    changed = {name for name in first.keys() | last.keys() if first.get(name) != last.get(name)}
    expected = {name for name in allowed if first.get(name) != images.fingerprints(overlay).get(name)}
    assert changed == expected and changed, "Unreviewed runtime file changes: " + str(sorted(changed ^ expected))
    for name in allowed:
        assert (candidate / name).read_bytes() == (overlay / name).read_bytes(), "Candidate overlay differs: " + name
    assert configs[0]["Config"] == configs[1]["Config"], "Image runtime configuration changed"
    layers = configs[0]["RootFS"]["Layers"]
    assert configs[1]["RootFS"]["Layers"][:len(layers)] == layers, "Retained image layers changed"
    return {"passed": True, "changedFiles": sorted(changed), "allowedFiles": sorted(allowed), "unrelatedFilesIdentical": len(first) - len(changed & first.keys()), "runtimeConfigurationPreserved": True, "baseLayersPreserved": True, "oldAssetsRetained": True}


def compose(app, tag):
    assert app in ("api", "web") and re.fullmatch(re.escape(images.REGISTRY + "/hidi-" + app) + r":product-skn-[0-9]+", tag), "Expected owned candidate tag"
    before = states()
    require_backups()
    unchanged(before)
    folder = PRIVATE / app
    folder.mkdir()
    base, overlay, candidate = (folder / name for name in ("base-app", "overlay", "candidate-app"))
    images.extract(before["hidi-" + app]["image"], base)
    if app == "api":
        verify_api_baseline(base)
        allowed = API_FILES
        for name in allowed:
            target = overlay / name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(name, target)
    else:
        assert (base / "admin-tools/handler.mjs").is_file() and (base / "server.mjs").is_file(), "Retained combined web runtime required"
        for name in WEB_ASSETS:
            target = overlay / "admin-tools" / name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / "admin-tools" / name, target)
        web = web_patcher.patch_web(base, overlay)
        landing = landing_patcher.patch_landing(base, overlay)
        save("web-patch.json", web)
        save("landing-patch.json", landing)
        allowed = {"admin-tools/" + name for name in WEB_ASSETS} | set(web["files"]) | set(landing["files"])
        for name in allowed:
            if name.endswith((".js", ".mjs")):
                subprocess.run(["node", "--check", str(overlay / name)], check=True)
    (folder / "Dockerfile").write_text("FROM " + before["hidi-" + app]["image"] + "\nCOPY --chown=node:node overlay/ /app/\n")
    subprocess.run(["docker", "build", "--pull=false", "-t", tag, str(folder)], check=True)
    images.extract(tag, candidate)
    report = verify(base, candidate, overlay, allowed, json.loads(images.docker("image", "inspect", before["hidi-" + app]["image"], tag)))
    report.update({"baseImage": before["hidi-" + app]["image"], "candidateTag": tag})
    save(app + "-preservation.json", report)
    unchanged(before)
    print("PASS: " + app + " additive candidate preserves every unrelated file, original layer and setting")


def candidate():
    runtime = PRIVATE / "web/candidate-app"
    env = {**os.environ, "HIDI_CANDIDATE_RUNTIME": str(runtime.resolve()), "HIDI_BROWSER_ENGINES": "chromium,firefox,webkit", "HIDI_TEST_ENGINE": ""}
    completed = []
    save("candidate.json", {"passed": False, "productionDatabaseWrites": False, "productionBlobWrites": False})
    subprocess.run(["node", "tests/product-skn-candidate.mjs"], env=env, check=True, timeout=240)
    http_report = read("candidate-http.json")
    assert http_report.get("passed") and http_report.get("checks") == 22 and http_report.get("actualNextHttp") and http_report.get("mainPhoto") and http_report.get("categories"), "Complete actual Next upload and collection regression required"
    completed.append("actualNextMultipart14MainFlagAndCollections8")
    for name, args in [
        ("retainedAdminRuntime", ["node", "tests/admin-quick-tools.runtime.mjs"]),
        ("retainedBulkBrowser", ["node", "--import", "./apps/api/node_modules/tsx/dist/loader.mjs", "tests/admin-quick-tools.browser.mjs"]),
        ("retainedDeletionBrowser", ["node", "tests/admin-product-delete.browser.mjs"]),
        ("navigationBrowser", ["node", "tests/admin-navigation.browser.mjs"]),
        ("sknPhotosThreeBrowsers", ["node", "tests/product-skn-photos.browser.mjs"]),
        ("retainedCustomerButtons", ["node", "deploy/button-states/revert-candidate.mjs"]),
    ]:
        subprocess.run(args, env=env, check=True, timeout=600)
        completed.append(name)
        save("candidate.json", {"passed": False, "completed": completed})
    browsers = json.loads(Path("test-results/product-skn-photos/report.json").read_text())
    assert browsers.get("passed") is True and {value["engine"] for value in browsers["results"] if value.get("passed")} == {"chromium", "firefox", "webkit"}
    save("candidate.json", {"passed": True, "completed": completed, "actualRetainedImages": True, "photoLimitBytes": 12 * 1024 * 1024, "mainPhotoPayloadVerified": True, "sknPhotoBrowserEngines": ["chromium", "firefox", "webkit"], "productionDatabaseWrites": False, "productionBlobWrites": False})


def require_ready(api_state):
    schema = read("schema-ready.json")
    taxonomy = read("taxonomy-ready.json")
    for label, report in (("schema", schema), ("taxonomy", taxonomy)):
        assert report.get("passed") is True and report.get("apiImage") == api_state["image"] and report.get("apiSettingsHash") == api_state["settingsHash"], "Fresh private " + label + " readiness must match captured API"
        assert report.get("privateNetwork") is True and report.get("managedIdentity") is True, "Private retained SQL identity required"
    assert schema.get("featureReady") is True, "SKN migration requires an authorized private SQL owner before rollout"
    assert taxonomy.get("taxonomyReady") is True, "Wear categories and cross-category Ananya collection must exist before rollout"
    if schema.get("ownerDefinitionVerificationRequired"):
        owner = read("owner-migration.json")
        validate_owner_report(owner, schema, api_state)
    return schema, taxonomy


def utc_now():
    return datetime.now(timezone.utc)


def validate_owner_report(report, schema, api_state, supplied=False):
    assert isinstance(report, dict), "SQL owner verification report must be one JSON object"
    if supplied:
        assert set(report) == OWNER_REPORT_FIELDS, "SQL owner verification report fields differ from the bounded contract"
    assert report.get("passed") is True and report.get("definitionsVerified") is True, "SQL owner must confirm the exact mapping/default/check definitions"
    for field in ("databaseHash", "ownerSchemaHash", "migrationSha256", "apiSettingsHash"):
        assert isinstance(report.get(field), str) and re.fullmatch(r"[a-f0-9]{64}", report[field]), "Invalid SQL owner report hash: " + field
    assert report["databaseHash"] == schema.get("databaseHash"), "SQL owner verification report targets a different database"
    assert report["ownerSchemaHash"] == schema.get("expectedOwnerSchemaHash"), "SQL owner verification report differs from the expected schema contract"
    assert report["migrationSha256"] == hashlib.sha256((HERE / "migration.sql").read_bytes()).hexdigest(), "SQL owner verification report differs from the exact migration file"
    assert report.get("apiImage") == api_state["image"] and report["apiSettingsHash"] == api_state["settingsHash"], "SQL owner verification report differs from the fresh API capture"
    immutable(report["apiImage"], "hidi-api")
    if supplied or "verifiedAtUtc" in report:
        stamp = report.get("verifiedAtUtc")
        assert isinstance(stamp, str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)", stamp), "SQL owner verification timestamp must be UTC"
        try:
            verified_at = datetime.fromisoformat(stamp.replace("Z", "+00:00"))
        except ValueError:
            raise AssertionError("SQL owner verification timestamp is invalid") from None
        assert 0 <= (utc_now() - verified_at).total_seconds() <= 24 * 60 * 60, "SQL owner verification report must be from the last 24 hours and cannot be future dated"
    else:
        # Only the existing guarded owner helper can create this richer local
        # report. Imported reports always carry the UTC attestation timestamp.
        assert report.get("ownerMigrationExecuted") is True and report.get("pitrCheckpointVerified") is True, "Existing owner verification report lacks guarded migration proof"
    return report


def unique_json_object(pairs):
    result = {}
    for key, value in pairs:
        assert key not in result, "SQL owner verification JSON contains duplicate fields"
        result[key] = value
    return result


def owner_evidence():
    before = states()
    unchanged(before)
    schema = read("schema-ready.json")
    api = before["hidi-api"]
    assert schema.get("passed") is True and schema.get("featureReady") is True and schema.get("apiImage") == api["image"] and schema.get("apiSettingsHash") == api["settingsHash"], "Read-only schema readiness must match the captured API before owner evidence"
    if not schema.get("ownerDefinitionVerificationRequired"):
        print("PASS: mapping definitions are visible in the read-only schema check; no owner report needed")
        return
    existing = EVIDENCE / "owner-migration.json"
    if existing.is_file():
        try:
            validate_owner_report(read("owner-migration.json"), schema, api)
            print("PASS: existing guarded SQL owner definition verification matches the fresh API capture")
            return
        except (AssertionError, ValueError, TypeError):
            pass
    supplied = os.environ.get("HIDI_SKN_OWNER_DEFINITION_REPORT", "")
    assert supplied.strip(), "SQL owner definition verification report is required: run workflow_dispatch with owner_definition_report after applying and verifying deploy/product-skn/migration.sql"
    assert len(supplied.encode("utf-8")) <= OWNER_REPORT_MAX_BYTES, "SQL owner verification report exceeds the 8192-byte limit"
    try:
        report = json.loads(supplied, object_pairs_hook=unique_json_object)
    except (ValueError, TypeError):
        raise AssertionError("SQL owner verification report is invalid JSON") from None
    validate_owner_report(report, schema, api, supplied=True)
    unchanged(before)
    save("owner-migration.json", report)
    print("PASS: bounded SQL owner verification report accepted; no DDL, grants or SQL rows changed")


def publish():
    before = states()
    require_backups()
    unchanged(before)
    assert read("candidate.json").get("passed") is True, "Actual candidate regression must finish before publication"
    result = {}
    for app in ("api", "web"):
        report = read(app + "-preservation.json")
        assert report.get("passed") is True and report.get("baseImage") == before["hidi-" + app]["image"]
        tag = report["candidateTag"]
        subprocess.run(["docker", "push", tag], check=True)
        digest = subprocess.check_output(["az", "acr", "repository", "show", "--name", "acrhidiprod0927", "--image", tag.split("/", 1)[1], "--query", "digest", "-o", "tsv", "--only-show-errors"], text=True).strip()
        image = images.REGISTRY + "/hidi-" + app + "@" + digest
        immutable(image, "hidi-" + app)
        local = json.loads(images.docker("image", "inspect", tag))[0]
        assert image in local["RepoDigests"], "Published digest differs from the tested local candidate"
        result["hidi-" + app] = {"image": image, "candidateTag": tag, "verified": True, "baseImage": before["hidi-" + app]["image"]}
        with open(os.environ["GITHUB_ENV"], "a") as output:
            output.write(app.upper() + "_IMAGE=" + image + "\n")
    save("candidate-images.json", {"passed": True, "images": result})
    unchanged(before)


def verify_live():
    for route in ("/health", "/healthz", "/api/store/health/ready", "/", "/collections/all", "/collections/everyday", "/collections/work-edit", "/collections/occasion", "/cart", "/checkout", "/account", "/wishlist", "/shipping", "/returns", "/admin", "/admin/products", "/admin/import", "/admin/inventory/receive", "/admin/products/price-tags", "/admin/landing-media", "/admin/packing-scanner", "/admin/product-quick-fill", "/admin/product-bulk", "/admin/product-delete", "/admin/privacy-policy", "/admin/product-photos"):
        cloud.get(route)
    for slug, label in web_patcher.NEW_LABELS.items():
        assert ("<h1>" + label["title"] + "</h1>").encode() in cloud.get("/collections/" + slug), "Live collection heading mismatch: " + slug
    for route in ("/api/admin/products/options", "/api/admin/products?status=ALL&q=12345", "/api/admin/orders?status=CONFIRMED", "/api/hidi/privacy-policy/admin"):
        cloud.get(route, 401)
    for name in WEB_ASSETS - {"handler.mjs", "product-bulk.html", "product-photos.html"}:
        assert cloud.get("/admin-tools-assets/" + name) == (ROOT / "admin-tools" / name).read_bytes(), "Live admin asset mismatch: " + name
    cloud.get("/admin-tools-assets/handler.mjs", 404)
    for name, prefix in (("web-patch.json", "/_next/"), ("landing-patch.json", "/")):
        for source, destination in read(name)["renamedAssets"].items():
            url = prefix + (destination.split("apps/web/.next/", 1)[1] if prefix == "/_next/" else destination.removeprefix("dist/"))
            assert cloud.get(url) == (PRIVATE / "web/candidate-app" / destination).read_bytes(), "Live immutable asset mismatch: " + url
            old_url = prefix + (source.split("apps/web/.next/", 1)[1] if prefix == "/_next/" else source.removeprefix("dist/"))
            assert cloud.get(old_url) == (PRIVATE / "web/base-app" / source).read_bytes(), "Previously cached asset was not retained"


def apply():
    before, old = states(), originals()
    require_backups()
    unchanged(before)
    require_ready(before["hidi-api"])
    candidate_report = read("candidate.json")
    assert candidate_report.get("passed") is True and candidate_report.get("actualRetainedImages") is True and candidate_report.get("mainPhotoPayloadVerified") is True and candidate_report.get("photoLimitBytes") == 12 * 1024 * 1024, "Complete actual-candidate regression required"
    targets = {name: os.environ[name.removeprefix("hidi-").upper() + "_IMAGE"] for name in before}
    published = read("candidate-images.json")
    assert published.get("passed") is True, "Verified immutable candidate publication required"
    for name, image in targets.items():
        immutable(image, name)
        report = read(name.removeprefix("hidi-") + "-preservation.json")
        assert report.get("passed") is True and report.get("baseImage") == before[name]["image"], "Candidate preservation must match fresh capture"
        expected = published["images"][name]
        assert expected.get("verified") is True and expected.get("image") == image and expected.get("baseImage") == before[name]["image"] and expected.get("candidateTag") == report.get("candidateTag"), "Rollout image differs from tested candidate"
    public = read("public-before.json")
    assert photo.public_state() == public, "Published content changed independently"
    deployed, run = {}, os.environ["GITHUB_RUN_ID"]
    try:
        for name in ("hidi-api", "hidi-web"):
            unchanged({other: deployed.get(other, before[other]) for other in before})
            suffix = "productskn" + name.removeprefix("hidi-") + run
            cloud.write_image(old[name], targets[name], suffix)
            state = cloud.snapshot(photo.wait_ready(name, targets[name], suffix))
            deployed[name] = state
            assert state["settingsHash"] == before[name]["settingsHash"], "Protected application settings changed"
        verify_live()
        assert photo.public_state() == public, "Hero, media, privacy or public configuration changed"
        unchanged(deployed)
        save("after.json", {"passed": True, "states": deployed, "appSettingsPreserved": True, "publishedContentPreserved": True, "oldAssetsRetained": True, "stableFiveDigitSkn": True, "crossCategoryAnanyaCollection": True, "sourceSha": os.environ["GITHUB_SHA"], "sqlMappingRetainedOnRollback": True})
        print("PASS: permanent five-digit SKNs, matched bulk photos and Ananya collection deployed; retained content and settings preserved")
    except Exception:
        recovery = {}
        for name in ("hidi-web", "hidi-api"):
            try:
                data = cloud.app(name)
                current = cloud.snapshot(data)
                owned = name + "--productskn" + name.removeprefix("hidi-") + run
                if current["image"] == targets[name] and current["latest"] == owned and current["settingsHash"] == before[name]["settingsHash"]:
                    suffix = "sknrollback" + name.removeprefix("hidi-") + run
                    cloud.write_image(data, before[name]["image"], suffix)
                    restored = cloud.snapshot(photo.wait_ready(name, before[name]["image"], suffix))
                    assert restored["settingsHash"] == before[name]["settingsHash"]
                    recovery[name] = "restored"
                elif current == before[name]:
                    recovery[name] = "original-retained"
                else:
                    recovery[name] = "independent-change-not-overwritten"
            except Exception:
                recovery[name] = "recovery-failed-review-required"
        save("rollback.json", {"apps": recovery, "sqlMappingRetained": True, "sqlSchemaRemoved": False})
        raise


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["baseline", "capture", "backup", "compose", "candidate", "publish", "owner-evidence", "apply"])
    parser.add_argument("--app", choices=["api", "web"])
    parser.add_argument("--tag")
    args = parser.parse_args()
    try:
        if args.action == "compose":
            compose(args.app, args.tag)
        else:
            globals()[args.action.replace("-", "_")]()
    except Exception as error:
        print(str(error) if isinstance(error, (AssertionError, RuntimeError, cloud.AzureOperationError)) else "Guarded product SKN release stopped; inspect sanitized evidence")
        raise SystemExit(1)
