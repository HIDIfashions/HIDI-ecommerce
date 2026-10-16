"""Require identical UI inputs before reusing an earlier successful browser step."""
import copy
import importlib.util
from pathlib import Path
import subprocess
import unittest


ROOT = Path(__file__).resolve().parents[1]
PRIOR_SOURCE = "445bcb73bd0e589777f2f6b5d9b2dbc77038f3d7"
PRIOR_RUN = 37955713898
WORKFLOW = ".github/workflows/msg91-auth-release.yml"
BROWSER_STEP = "Verify current admin and shopping UI in isolated browser fixtures"
PACKAGING_CHANGES = [
    WORKFLOW,
    "deploy/compose-msg91-images.py",
    "deploy/check-msg91-browser-evidence.py",
    "tests/msg91-image-preservation.test.py",
    "tests/msg91-browser-evidence.test.py",
]

spec = importlib.util.spec_from_file_location("browser_evidence", ROOT / "deploy/check-msg91-browser-evidence.py")
evidence = importlib.util.module_from_spec(spec)
spec.loader.exec_module(evidence)


class BrowserEvidence(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.previous = subprocess.check_output(
            ["git", "show", PRIOR_SOURCE + ":" + WORKFLOW], cwd=ROOT, text=True
        )
        cls.current = (ROOT / WORKFLOW).read_text()

    def setUp(self):
        self.run = {
            "id": PRIOR_RUN,
            "head_sha": PRIOR_SOURCE,
            "status": "completed",
            "event": "push",
            "head_branch": "migration/azure-sql-blob",
            "name": "MSG91 guarded auth image release",
            "conclusion": "failure",
        }
        self.jobs = {"jobs": [{
            "name": "release",
            "run_id": PRIOR_RUN,
            "status": "completed",
            "conclusion": "failure",
            "steps": [
                {"name": "Set up job", "status": "completed", "conclusion": "success"},
                {"name": BROWSER_STEP, "status": "completed", "conclusion": "success"},
                {"name": "Compose additive images and verify all protected files and runtime settings", "status": "completed", "conclusion": "failure"},
            ],
        }]}

    def reuse(self, **overrides):
        arguments = {
            "run": self.run,
            "jobs": self.jobs,
            "changed": PACKAGING_CHANGES,
            "previous": self.previous,
            "current": self.current,
        }
        arguments.update(overrides)
        return evidence.can_reuse(**arguments)

    def replace_once(self, old, new):
        self.assertEqual(self.current.count(old), 1, "Mutation must target the actual workflow unambiguously")
        return self.current.replace(old, new, 1)

    def test_completed_successful_browser_step_survives_later_packaging_failure(self):
        self.assertEqual(self.run["conclusion"], "failure")
        self.assertEqual(self.jobs["jobs"][0]["conclusion"], "failure")
        self.assertTrue(self.reuse())

    def test_authorized_browser_condition_and_packaging_files_are_reusable(self):
        condition = "        if: steps.browser_evidence.outputs.reuse != 'true'\n"
        self.assertNotIn(condition, self.previous)
        self.assertIn(condition, self.current)
        for changed in [[name] for name in PACKAGING_CHANGES] + [PACKAGING_CHANGES]:
            with self.subTest(changed=changed):
                self.assertTrue(self.reuse(changed=changed))

    def test_wrong_run_source_branch_event_or_state_rejects_reuse(self):
        for key, wrong in [
            ("id", PRIOR_RUN + 1),
            ("head_sha", "0" * 40),
            ("status", "in_progress"),
            ("event", "workflow_dispatch"),
            ("head_branch", "main"),
            ("name", "Different release workflow"),
        ]:
            with self.subTest(field=key):
                run = dict(self.run, **{key: wrong})
                self.assertFalse(self.reuse(run=run))

    def test_missing_run_and_job_metadata_rejects_reuse(self):
        for key in ["id", "head_sha", "status", "event", "head_branch", "name"]:
            with self.subTest(run_field=key):
                run = dict(self.run)
                del run[key]
                self.assertFalse(self.reuse(run=run))
        for key in ["name", "run_id", "status", "steps"]:
            with self.subTest(job_field=key):
                jobs = copy.deepcopy(self.jobs)
                del jobs["jobs"][0][key]
                self.assertFalse(self.reuse(jobs=jobs))
        for malformed in [None, {}, {"jobs": None}, {"jobs": []}]:
            with self.subTest(jobs=malformed):
                self.assertFalse(self.reuse(jobs=malformed))

    def test_release_job_must_be_unique_completed_and_from_the_verified_run(self):
        for key, wrong in [("name", "another-job"), ("run_id", PRIOR_RUN + 1), ("status", "queued")]:
            with self.subTest(field=key):
                jobs = copy.deepcopy(self.jobs)
                jobs["jobs"][0][key] = wrong
                self.assertFalse(self.reuse(jobs=jobs))
        jobs = copy.deepcopy(self.jobs)
        jobs["jobs"].append(copy.deepcopy(jobs["jobs"][0]))
        self.assertFalse(self.reuse(jobs=jobs))

    def test_browser_step_must_be_exact_unique_completed_and_successful(self):
        for key, wrong in [
            ("name", BROWSER_STEP + " (renamed)"),
            ("status", "in_progress"),
            ("conclusion", "failure"),
            ("conclusion", "skipped"),
            ("conclusion", "cancelled"),
        ]:
            with self.subTest(field=key, value=wrong):
                jobs = copy.deepcopy(self.jobs)
                jobs["jobs"][0]["steps"][1][key] = wrong
                self.assertFalse(self.reuse(jobs=jobs))
        for key in ["name", "status", "conclusion"]:
            with self.subTest(missing_browser_field=key):
                jobs = copy.deepcopy(self.jobs)
                del jobs["jobs"][0]["steps"][1][key]
                self.assertFalse(self.reuse(jobs=jobs))
        for duplicate in [False, True]:
            with self.subTest(duplicate=duplicate):
                jobs = copy.deepcopy(self.jobs)
                if duplicate:
                    jobs["jobs"][0]["steps"].append(copy.deepcopy(jobs["jobs"][0]["steps"][1]))
                else:
                    del jobs["jobs"][0]["steps"][1]
                self.assertFalse(self.reuse(jobs=jobs))

    def test_application_dependency_and_fixture_changes_force_fresh_browser_tests(self):
        for changed in [
            "apps/web/app/account/page.tsx",
            "apps/web/lib/auth.ts",
            "apps/api/src/auth/supabase-auth.service.ts",
            "apps/web/next.config.mjs",
            "package.json",
            "apps/web/package.json",
            "pnpm-lock.yaml",
            "tests/admin-workspace.browser.mjs",
            "tests/editorial-storefront.browser.mjs",
            "tests/fixtures/storefront.json",
            "deploy/public-auth.json",
            "deploy/smoke-msg91-candidates.sh",
        ]:
            with self.subTest(path=changed):
                self.assertFalse(self.reuse(changed=[*PACKAGING_CHANGES, changed]))

    def test_job_environment_changes_force_fresh_browser_tests(self):
        for old, new in [
            ("      API_URL: http://127.0.0.1:4100/v1\n", "      API_URL: http://127.0.0.1:4200/v1\n"),
            ("      ACR: acrhidiprod0927\n", "      ACR: another-registry\n"),
            ("      PLAYWRIGHT_BROWSERS_PATH: ${{ github.workspace }}/.cache/hidi-msg91-browsers\n", "      PLAYWRIGHT_BROWSERS_PATH: /tmp/other-browsers\n"),
            ("      ACR: acrhidiprod0927\n", "      ACR: acrhidiprod0927\n      NODE_OPTIONS: --require ./different-runtime.cjs\n"),
        ]:
            with self.subTest(change=old.strip()):
                self.assertFalse(self.reuse(current=self.replace_once(old, new)))

    def test_package_manager_node_install_and_generation_changes_reject_reuse(self):
        for old, new in [
            ("runs-on: ubuntu-latest", "runs-on: ubuntu-24.04"),
            ("actions/checkout@v4", "actions/checkout@v5"),
            ("fetch-depth: 0", "fetch-depth: 1"),
            ("pnpm/action-setup@v4", "pnpm/action-setup@v5"),
            ("version: 10.15.1", "version: 10.16.0"),
            ("actions/setup-node@v4", "actions/setup-node@v5"),
            ("node-version: 22", "node-version: 24"),
            ("pnpm install --frozen-lockfile", "pnpm install"),
            ("pnpm db:generate", "pnpm db:generate:other"),
        ]:
            with self.subTest(change=old):
                self.assertFalse(self.reuse(current=self.replace_once(old, new)))

    def test_auth_build_commands_and_public_build_settings_reject_reuse(self):
        for old, new in [
            ("pnpm --filter @hidi/api build", "pnpm --filter @hidi/api build:other"),
            ("pnpm --filter @hidi/web build", "pnpm --filter @hidi/web build:other"),
            ("export NEXT_PUBLIC_CUSTOMER_OTP_CHANNEL=sms", "export NEXT_PUBLIC_CUSTOMER_OTP_CHANNEL=whatsapp"),
            ("export NEXT_PUBLIC_WALLET_ENABLED=true", "export NEXT_PUBLIC_WALLET_ENABLED=false"),
        ]:
            with self.subTest(change=old):
                self.assertFalse(self.reuse(current=self.replace_once(old, new)))

    def test_browser_engines_fixture_commands_and_other_conditions_reject_reuse(self):
        for old, new in [
            ("install --with-deps chromium firefox webkit", "install --with-deps chromium"),
            ("node tests/admin-workspace.browser.mjs", "node tests/different-admin.browser.mjs"),
            ("HIDI_BROWSER_ENGINES=chromium,firefox,webkit node tests/editorial-storefront.browser.mjs", "HIDI_BROWSER_ENGINES=chromium node tests/editorial-storefront.browser.mjs"),
            ("HIDI_BROWSER_ENGINES=chromium,firefox,webkit node tests/editorial-polish.browser.mjs", "HIDI_BROWSER_ENGINES=chromium node tests/editorial-polish.browser.mjs"),
            ("        if: steps.browser_evidence.outputs.reuse != 'true'\n", "        if: false\n"),
        ]:
            with self.subTest(change=old):
                self.assertFalse(self.reuse(current=self.replace_once(old, new)))
        browser_start = "      - name: " + BROWSER_STEP + "\n"
        current = self.replace_once(browser_start, browser_start + "        env:\n          NODE_OPTIONS: --require ./different-runtime.cjs\n")
        self.assertFalse(self.reuse(current=current))


if __name__ == "__main__":
    unittest.main()
