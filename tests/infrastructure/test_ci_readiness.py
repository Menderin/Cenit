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

    def test_scaffold_checks_only_infrastructure_on_main(self):
        self.assertFalse(READINESS.check(self.root, "main"))

    def test_scaffold_cannot_pass_production_checks(self):
        with self.assertRaisesRegex(ValueError, "initialized application"):
            READINESS.check(self.root, "produccion")

    def test_partial_application_cannot_be_silently_skipped(self):
        self.write_package()
        with self.assertRaisesRegex(ValueError, "Missing npm workspace file"):
            READINESS.check(self.root, "main")

    def test_all_test_scripts_are_required(self):
        self.complete_workspace()
        for missing in READINESS.REQUIRED_SCRIPTS:
            with self.subTest(script=missing):
                scripts = {name: "test-command" for name in READINESS.REQUIRED_SCRIPTS}
                del scripts[missing]
                self.write_package(scripts=scripts)
                with self.assertRaisesRegex(ValueError, missing):
                    READINESS.check(self.root, "produccion")

    def test_npm_must_be_pinned(self):
        self.complete_workspace()
        self.write_package(packageManager="npm@latest")
        with self.assertRaisesRegex(ValueError, "must pin npm"):
            READINESS.check(self.root, "produccion")

    def test_complete_contract_enables_application_checks(self):
        self.complete_workspace()
        self.assertTrue(READINESS.check(self.root, "produccion"))


if __name__ == "__main__":
    unittest.main()
