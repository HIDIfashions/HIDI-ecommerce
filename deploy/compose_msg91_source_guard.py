"""Reject unrelated application or dependency changes before composing the auth release."""
import subprocess

ALLOWED = {
    "apps/api/src/auth/supabase-auth.service.ts",
    "apps/web/components/account-orders-client.tsx",
    "apps/web/lib/supabase-auth.ts",
}


def validate_source(base, source):
    subprocess.run(["git", "merge-base", "--is-ancestor", base, source], check=True)
    paths = subprocess.check_output(["git", "diff", "--name-only", base, source, "--", "apps", "package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml"], text=True).splitlines()
    assert set(paths) == ALLOWED, "Source changed outside the reviewed auth files: " + str(sorted(set(paths) ^ ALLOWED))
    print("PASS: exact live application source plus the three reviewed auth files; dependencies and schema unchanged")
