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


def check(root, branch):
    manifest = root / "package.json"
    if not manifest.is_file():
        if branch == "produccion":
            raise ValueError("Produccion requires an initialized application and real tests.")
        print("Scaffold only: infrastructure CI applies; application tests are not available.")
        return False

    package = json.loads(manifest.read_text(encoding="utf-8"))
    if not re.fullmatch(r"npm@\d+\.\d+\.\d+", package.get("packageManager", "")):
        raise ValueError("packageManager must pin npm as npm@X.Y.Z.")
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
        return 0
    except (ValueError, OSError) as error:
        print(f"CI prerequisite error: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
