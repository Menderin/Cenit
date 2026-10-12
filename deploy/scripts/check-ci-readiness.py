"""Validate the npm CI contract; a scaffold must never authorize a release."""

import json
import os
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[2]
REQUIRED_SCRIPTS = (
    "typecheck", "lint", "test:unit", "test:integration", "build", "test:e2e"
)
ACADEMIC_SCRIPTS = ("typecheck", "test:unit", "test:integration", "build:academic", "catalog:check")
WEB_SCRIPTS = ("build:web", "test:e2e:auth")


def permits_incomplete_application(branch):
    """Task pushes can test work in progress, without opening the main delivery gate."""
    return branch == "develop" or re.fullmatch(r"(?:feat|fix|test|docs|codex)/\S+", branch) is not None


def check_academic_foundation(root, package, branch):
    """An explicit backend can be tested on task/develop branches, never released."""
    if not permits_incomplete_application(branch):
        raise ValueError("Academic foundation is incomplete: delivery requires login, frontend and full application tests.")
    workspaces = package.get("workspaces")
    web = workspaces == ["apps/api", "apps/web", "packages/contracts"]
    if not web and workspaces != ["apps/api", "packages/contracts"]:
        raise ValueError("Academic foundation must declare the initialized workspaces.")
    if (root / "apps/web/package.json").exists() and not web:
        raise ValueError("Frontend workspace cannot skip its checks.")
    if web:
        for name in WEB_SCRIPTS:
            if not isinstance(package.get("scripts", {}).get(name), str) or not package["scripts"][name].strip():
                raise ValueError(f"Missing frontend check: {name}")
        for filename in ("apps/web/package.json", "apps/web/src/main.tsx", "playwright.auth.config.ts", "tests/e2e/auth.spec.ts"):
            if not (root / filename).is_file():
                raise ValueError(f"Missing frontend file: {filename}")
    for name in ACADEMIC_SCRIPTS:
        value = package.get("scripts", {}).get(name)
        if not isinstance(value, str) or not value.strip():
            raise ValueError(f"Missing academic check: {name}")
    for filename in (
        "package-lock.json", "apps/api/package.json", "packages/contracts/package.json",
        "apps/api/src/app.ts", "packages/contracts/src/academic/index.ts",
        "db/migrations/meta/_journal.json", "tests/integration/academic.test.ts",
    ):
        if not (root / filename).is_file():
            raise ValueError(f"Missing academic foundation file: {filename}")
    print("Academic foundation: run mandatory academic CI. Full application/release remains blocked.")
    return False


def check(root, branch):
    manifest = root / "package.json"
    if not manifest.is_file():
        if not permits_incomplete_application(branch):
            raise ValueError("Only develop and task branches permit a scaffold; delivery requires an initialized application and real tests.")
        print("Scaffold only: infrastructure CI applies; application tests are not available.")
        return False

    package = json.loads(manifest.read_text(encoding="utf-8"))
    if not re.fullmatch(r"npm@\d+\.\d+\.\d+", package.get("packageManager", "")):
        raise ValueError("packageManager must pin npm as npm@X.Y.Z.")
    stage = package.get("cenitStage")
    if stage == "academic-foundation":
        return check_academic_foundation(root, package, branch)
    if stage is not None:
        raise ValueError("Unknown explicit application stage.")
    for script in REQUIRED_SCRIPTS:
        value = package.get("scripts", {}).get(script)
        if not isinstance(value, str) or not value.strip():
            raise ValueError(f"Missing real root script: {script}")
    for filename in (
        "package-lock.json", "apps/web/package.json", "apps/api/package.json",
        "packages/contracts/package.json",
    ):
        if not (root / filename).is_file():
            raise ValueError(f"Missing npm workspace file: {filename}")
    return True


def main():
    try:
        ready = check(ROOT, os.environ.get("TARGET_BRANCH", "main"))
        output = os.environ.get("GITHUB_OUTPUT")
        if output:
            with open(output, "a", encoding="utf-8") as stream:
                stream.write(f"app_ready={str(ready).lower()}\n")
                manifest = ROOT / "package.json"
                academic = manifest.is_file() and json.loads(manifest.read_text(encoding="utf-8")).get("cenitStage") == "academic-foundation"
                stream.write(f"academic_ready={str(academic).lower()}\n")
                web = manifest.is_file() and "apps/web" in json.loads(manifest.read_text(encoding="utf-8")).get("workspaces", [])
                stream.write(f"web_ready={str(web).lower()}\n")
        return 0
    except (ValueError, OSError) as error:
        print(f"CI prerequisite error: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
