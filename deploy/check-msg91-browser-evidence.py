"""Reuse successful UI evidence only for a verified packaging-only follow-up."""
import json
import os
from pathlib import Path
import subprocess

PRIOR_RUN = 37955713898
PRIOR_SOURCE = "445bcb73bd0e589777f2f6b5d9b2dbc77038f3d7"
WORKFLOW = ".github/workflows/msg91-auth-release.yml"
BROWSER_STEP = "Verify current admin and shopping UI in isolated browser fixtures"
BROWSER_CONDITION = "        if: steps.browser_evidence.outputs.reuse != 'true'\n"
PACKAGING_FILES = {
    WORKFLOW,
    "deploy/compose-msg91-images.py",
    "deploy/check-msg91-browser-evidence.py",
    "tests/msg91-image-preservation.test.py",
    "tests/msg91-browser-evidence.test.py",
}


def section(text, start, end):
    assert text.count(start) == 1 and text.count(end) == 1, "Ambiguous workflow section"
    return text.split(start, 1)[1].split(end, 1)[0]


def step(text, opening):
    lines = text.splitlines(keepends=True)
    matches = [i for i, line in enumerate(lines) if line.rstrip() == opening]
    assert len(matches) == 1, "Missing or ambiguous workflow step"
    start = matches[0]
    end = next((i for i in range(start + 1, len(lines)) if lines[i].startswith("      - ")), len(lines))
    return "".join(lines[start:end]).replace(BROWSER_CONDITION, "")


def runner(text):
    lines = [line for line in text.splitlines() if line.startswith("    runs-on:")]
    assert len(lines) == 1, "Missing or ambiguous runner configuration"
    return lines[0]


def can_reuse(run, jobs, changed, previous, current):
    try:
        assert run["id"] == PRIOR_RUN and run["head_sha"] == PRIOR_SOURCE and run["status"] == "completed"
        assert run["event"] == "push" and run["head_branch"] == "migration/azure-sql-blob"
        assert run["name"] == "MSG91 guarded auth image release"
        release = [job for job in jobs["jobs"] if job["name"] == "release" and job["run_id"] == PRIOR_RUN and job["status"] == "completed"]
        assert len(release) == 1
        browser = [item for item in release[0]["steps"] if item["name"] == BROWSER_STEP]
        assert len(browser) == 1 and browser[0]["status"] == "completed" and browser[0]["conclusion"] == "success"
        assert set(changed) <= PACKAGING_FILES, "Application, fixture, dependency or other source changed"
        assert runner(previous) == runner(current), "Runner configuration changed"
        assert section(previous, "\n    env:\n", "\n    steps:\n") == section(current, "\n    env:\n", "\n    steps:\n"), "Build environment changed"
        for opening in [
            "      - uses: actions/checkout@v4",
            "      - uses: pnpm/action-setup@v4",
            "      - uses: actions/setup-node@v4",
            "      - run: pnpm install --frozen-lockfile",
            "      - run: pnpm db:generate",
            "      - name: Build the compiled auth service and complete current Next storefront",
            "      - name: " + BROWSER_STEP,
        ]:
            assert step(previous, opening) == step(current, opening), "Browser/build inputs changed"
        return True
    except (AssertionError, KeyError, TypeError):
        return False


def gh(path):
    result = subprocess.run(["gh", "api", path], capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError("Previous workflow evidence unavailable")
    return json.loads(result.stdout)


def main():
    reuse = False
    try:
        subprocess.run(["git", "merge-base", "--is-ancestor", PRIOR_SOURCE, "HEAD"], check=True, capture_output=True)
        changed = subprocess.check_output(["git", "diff", "--name-only", PRIOR_SOURCE, "HEAD"], text=True).splitlines()
        previous = subprocess.check_output(["git", "show", PRIOR_SOURCE + ":" + WORKFLOW], text=True)
        current = Path(WORKFLOW).read_text()
        repository = os.environ["GITHUB_REPOSITORY"]
        run = gh("repos/" + repository + "/actions/runs/" + str(PRIOR_RUN))
        jobs = gh("repos/" + repository + "/actions/runs/" + str(PRIOR_RUN) + "/jobs?filter=latest&per_page=100")
        reuse = can_reuse(run, jobs, changed, previous, current)
    except (RuntimeError, OSError, ValueError, KeyError, subprocess.SubprocessError):
        pass
    with open(os.environ["GITHUB_OUTPUT"], "a") as output:
        output.write("reuse=" + str(reuse).lower() + "\n")
    Path("evidence").mkdir(exist_ok=True)
    Path("evidence/browser-evidence.json").write_text(json.dumps({"reuse": reuse, "run_id": PRIOR_RUN if reuse else None, "source_sha": PRIOR_SOURCE if reuse else None}, indent=2))
    print("Verified previous three-engine UI evidence; candidate Chromium remains required" if reuse else "Previous evidence does not match; run the full three-engine UI suite")


if __name__ == "__main__": main()
