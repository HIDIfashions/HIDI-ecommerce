"""Allow only the reviewed account release and fingerprint settings without revealing them."""
import copy
import hashlib
import json
import re
import subprocess

BASE_SOURCE = "5d8b2081f920ac09984e062d873e7caf32e7cc1b"
# Preserve the independently reviewed privacy-editor work on the shared branch.
# APPLICATION_FILES still bounds all application changes from BASE_SOURCE.
REVIEW_BASE = "32a1e35402f6855ef138a6e54065e65cc7cba249"
APPLICATION_FILES = {
    "apps/api/src/auth/supabase-auth.service.ts",
    "apps/web/components/account-orders-client.tsx",
    "apps/web/components/account-orders.module.css",
    "apps/web/lib/supabase-auth.ts",
    "apps/web/app/account/policy/page.tsx",
    "apps/web/components/site-footer.tsx",
    "apps/web/components/admin/admin-nav.tsx",
    "apps/web/components/admin/admin-workspace.tsx",
}
RELEASE_FILES = APPLICATION_FILES | {
    ".github/workflows/account-otp-release.yml",
    ".github/workflows/account-otp-diagnose.yml",
    ".github/workflows/account-otp-web-completion.yml",
    "deploy/account_otp_release_guard.py",
    "deploy/diagnose-account-otp-settings.py",
    "deploy/verify-account-otp-live-api.py",
    "deploy/complete-account-otp-web.py",
    "deploy/compose-account-privacy-links.py",
    "deploy/privacy-policy/links.js",
    "deploy/smoke-account-otp-candidates.sh",
    "deploy/update-account-otp-images.sh",
    "tests/account-otp-release.test.py",
    "tests/account-otp-web-completion.test.py",
    "tests/account-privacy-links-preservation.test.py",
    "tests/admin-workspace.browser.mjs",
    "tests/editorial-storefront.browser.mjs",
    "tests/auth-otp-frontend.test.cjs",
    "tests/auth-otp-resend.browser.mjs",
    "tests/auth-verification.test.ts",
}


def validate_image(image, app):
    assert re.fullmatch(r"acrhidiprod0927\.azurecr\.io/hidi-" + app + r"@sha256:[0-9a-f]{64}", image), "Expected a freshly reviewed HIDI image digest"


def validate_paths(application_paths, review_paths):
    assert set(application_paths) == APPLICATION_FILES, "Application source changed outside the reviewed account and native privacy-link files: " + str(sorted(set(application_paths) ^ APPLICATION_FILES))
    assert set(review_paths) <= RELEASE_FILES, "Release contains an unreviewed file: " + str(sorted(set(review_paths) - RELEASE_FILES))


def validate_source(source, reviewed_source):
    assert re.fullmatch(r"[0-9a-f]{40}", reviewed_source), "Expected the full reviewed source commit"
    assert source == reviewed_source, "Dispatch must use the exact reviewed source commit"
    for base in [BASE_SOURCE, REVIEW_BASE]:
        subprocess.run(["git", "merge-base", "--is-ancestor", base, source], check=True)
    application_paths = subprocess.check_output(["git", "diff", "--name-only", BASE_SOURCE, source, "--", "apps", "packages", "package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml"], text=True).splitlines()
    review_paths = subprocess.check_output(["git", "diff", "--name-only", REVIEW_BASE, source], text=True).splitlines()
    validate_paths(application_paths, review_paths)
    print("PASS: exact reviewed account source; packages, schema, configuration and other application files unchanged")


def snapshot(data):
    properties = data["properties"]
    containers = properties["template"]["containers"]
    assert len(containers) == 1, "Expected one application container"
    template = copy.deepcopy(properties["template"])
    template.pop("revisionSuffix", None)
    template["containers"][0].pop("image", None)
    template["containers"][0]["env"] = sorted(template["containers"][0].get("env", []), key=lambda value: value["name"])
    configuration = copy.deepcopy(properties["configuration"])
    configuration.get("ingress", {}).pop("traffic", None)
    settings = {
        "template": template,
        "configuration": configuration,
        "identity": data.get("identity", {}),
        "location": data.get("location"),
        "tags": data.get("tags", {}),
        "environmentId": properties.get("environmentId"),
        "managedEnvironmentId": properties.get("managedEnvironmentId"),
        "workloadProfileName": properties.get("workloadProfileName"),
    }
    return {
        "image": containers[0]["image"],
        "mode": properties["configuration"]["activeRevisionsMode"],
        "latest": properties["latestRevisionName"],
        "ready": properties.get("latestReadyRevisionName"),
        "settingsHash": hashlib.sha256(json.dumps(settings, sort_keys=True).encode()).hexdigest(),
    }
