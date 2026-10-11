"""Release gates must reject the scaffold and partial application setup."""

import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[2] / "deploy/scripts/check-ci-readiness.py"
SPEC = importlib.util.spec_from_file_location("ci_readiness", SCRIPT)
READINESS = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(READINESS)


class ReadinessTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def write_package(self, **overrides):
        package = {
            "packageManager": "npm@11.0.0",
            "scripts": {name: "test-command" for name in READINESS.REQUIRED_SCRIPTS},
        }
        package.update(overrides)
        (self.root / "package.json").write_text(json.dumps(package), encoding="utf-8")

    def complete_workspace(self):
        self.write_package()
        for filename in (
            "package-lock.json", "apps/web/package.json", "apps/api/package.json",
            "packages/contracts/package.json",
        ):
            target = self.root / filename
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text("{}", encoding="utf-8")

    def test_scaffold_checks_only_infrastructure_on_develop(self):
        self.assertFalse(READINESS.check(self.root, "develop"))

    def test_task_pushes_can_check_scaffold_without_authorizing_application(self):
        for prefix in ("feat", "fix", "test", "docs", "codex"):
            with self.subTest(prefix=prefix):
                self.assertFalse(READINESS.check(self.root, f"{prefix}/login"))

    def test_scaffold_cannot_pass_production_checks(self):
        for branch in ("main", "produccion", "feature/unknown"):
            with self.subTest(branch=branch):
                with self.assertRaisesRegex(ValueError, "initialized application"):
                    READINESS.check(self.root, branch)

    def test_partial_application_cannot_be_silently_skipped(self):
        self.write_package()
        with self.assertRaisesRegex(ValueError, "Missing npm workspace file"):
            READINESS.check(self.root, "develop")

    def test_all_test_scripts_are_required(self):
        self.complete_workspace()
        for missing in READINESS.REQUIRED_SCRIPTS:
            with self.subTest(script=missing):
                scripts = {name: "test-command" for name in READINESS.REQUIRED_SCRIPTS}
                del scripts[missing]
                self.write_package(scripts=scripts)
                with self.assertRaisesRegex(ValueError, missing):
                    READINESS.check(self.root, "main")

    def test_npm_must_be_pinned(self):
        self.complete_workspace()
        self.write_package(packageManager="npm@latest")
        with self.assertRaisesRegex(ValueError, "must pin npm"):
            READINESS.check(self.root, "main")

    def test_complete_contract_enables_application_checks(self):
        self.complete_workspace()
        for branch in ("develop", "main"):
            with self.subTest(branch=branch):
                self.assertTrue(READINESS.check(self.root, branch))

    def academic_foundation(self):
        self.write_package(cenitStage="academic-foundation", workspaces=["apps/api", "packages/contracts"], scripts={name: "test-command" for name in READINESS.ACADEMIC_SCRIPTS})
        for filename in (
            "package-lock.json", "apps/api/package.json", "packages/contracts/package.json",
            "apps/api/src/app.ts", "packages/contracts/src/academic/index.ts",
            "db/migrations/meta/_journal.json", "tests/integration/academic.test.ts",
        ):
            path = self.root / filename
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("{}", encoding="utf-8")

    def test_explicit_academic_stage_never_authorizes_application_release(self):
        self.academic_foundation()
        self.assertFalse(READINESS.check(self.root, "develop"))
        for branch in ("main", "produccion", "feature/unknown"):
            with self.subTest(branch=branch):
                with self.assertRaisesRegex(ValueError, "incomplete"):
                    READINESS.check(self.root, branch)

    def test_task_pushes_require_academic_checks_without_authorizing_release(self):
        self.academic_foundation()
        for prefix in ("feat", "fix", "test", "docs", "codex"):
            with self.subTest(prefix=prefix):
                self.assertFalse(READINESS.check(self.root, f"{prefix}/login"))
        (self.root / "tests/integration/academic.test.ts").unlink()
        with self.assertRaisesRegex(ValueError, "Missing academic"):
            READINESS.check(self.root, "feat/login")

    def test_academic_stage_requires_all_checks_and_migration(self):
        self.academic_foundation()
        (self.root / "db/migrations/meta/_journal.json").unlink()
        with self.assertRaisesRegex(ValueError, "Missing academic"):
            READINESS.check(self.root, "develop")

    def test_unknown_stage_cannot_skip_checks(self):
        self.complete_workspace()
        self.write_package(cenitStage="anything")
        with self.assertRaisesRegex(ValueError, "Unknown"):
            READINESS.check(self.root, "develop")


if __name__ == "__main__":
    unittest.main()
