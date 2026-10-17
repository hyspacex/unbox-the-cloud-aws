import unittest

import tests  # noqa: F401
from keel_runner import config
from keel_runner.judges.offline import OfflineJudge
from keel_runner.runner import Runner
from keel_runner.store import Store
from tests.fakes import MemoryBox

C = config.KEEL_ROOT / "content" / "lantern"
FOLDER = "f-test"


class RunnerTest(unittest.TestCase):
    def setUp(self):
        global FOLDER
        FOLDER = f"f-{id(self)}"
        self.box = MemoryBox()
        self.store = Store()
        self.runner = Runner(box=self.box, store=self.store, judge=OfflineJudge(delay=0))
        self.store.put(f"FOLDER#{FOLDER}", "META", {"folder_id": FOLDER, "name": "Lantern", "owner": {"id": "u-maya", "name": "Maya Chen"}, "run_count": 0})
        for name, user in (("proposal.md", "u-maya"), ("kickoff-transcript.txt", "u-maya"), ("architecture.md", "u-park"),
                           ("security-checklist.md", "u-dana"), ("keel-rules.md", "u-maya")):
            self.box.put_file(name, (C / "1-initial" / name).read_text(), user)

    def upload(self, path, user):
        fid = self.box.put_file(path.name, path.read_text(), user)
        return self.runner.handle({"folder_id": FOLDER, "reason": "webhook", "actor": {"id": user, "name": self.box.users[user]},
                                   "file": {"id": fid, "name": path.name}})

    def results(self, run):
        return {r["rule_id"]: r for r in self.store.query(f"RUN#{run['run_id']}", "RESULT#")}

    def test_full_story(self):
        r1 = self.runner.handle({"folder_id": FOLDER, "reason": "connected", "actor": {"id": "u-maya", "name": "Maya Chen"}})
        self.assertEqual(r1["counts"], {"passing": 6, "failing": 2, "unknown": 0, "total": 8})
        owner_task = r1["tasks"][0]
        self.assertEqual((owner_task["kind"], owner_task["assignee_id"], owner_task["rules"]), ("owner", "u-maya", ["R1", "R6"]))
        self.assertEqual(self.box.metadata[FOLDER]["status"], "failing")

        r2 = self.upload(C / "2-fix" / "data-retention.md", "u-park")
        self.assertEqual(r2["changes"]["fixed"], ["R6"])
        self.assertIn("R6 passes again", self.box.tasks[owner_task["task_id"]]["message"])

        r3 = self.upload(C / "2-fix" / "security-checklist.md", "u-dana")
        self.assertEqual(r3["counts"]["failing"], 0)
        self.assertEqual(self.box.metadata[FOLDER]["status"], "passing")
        self.assertIn("All checks from this task pass now", self.box.tasks[owner_task["task_id"]]["message"])

        r4 = self.upload(C / "3-regression" / "architecture.md", "u-park")
        self.assertEqual(sorted(r4["changes"]["broke"]), ["R2", "R3"])
        res = self.results(r4)
        self.assertEqual(res["R3"]["blame"]["user"]["id"], "u-park")
        self.assertEqual(res["R3"]["blame"]["file"]["version_number"], 2)
        reg = [t for t in r4["tasks"] if t["kind"] == "regression"]
        self.assertEqual(len(reg), 1)
        self.assertEqual(self.box.tasks[reg[0]["task_id"]]["assignee"], "u-park")
        self.assertEqual(self.box.tasks[reg[0]["task_id"]]["file_id"], res["R3"]["blame"]["file"]["id"])

        # Unchanged folder: a webhook retry or reconcile does not create a run.
        self.assertIsNone(self.runner.handle({"folder_id": FOLDER, "reason": "reconcile"}))

        r5 = self.upload(C / "4-repair" / "architecture.md", "u-park")
        self.assertEqual(sorted(r5["changes"]["fixed"]), ["R2", "R3"])
        self.assertEqual(self.results(r5)["R3"]["fixed_by"]["user"]["id"], "u-park")

    def test_still_failing_rule_keeps_blame_and_does_not_renotify(self):
        self.runner.handle({"folder_id": FOLDER, "reason": "connected"})
        self.upload(C / "2-fix" / "data-retention.md", "u-park")
        self.upload(C / "2-fix" / "security-checklist.md", "u-dana")
        r4 = self.upload(C / "3-regression" / "architecture.md", "u-park")
        r5 = self.upload(C / "1-initial" / "proposal.md", "u-maya")  # touch another file; R2/R3 still failing
        self.assertEqual(r5["changes"]["broke"], [])
        self.assertEqual(r5["tasks"], [])
        self.assertEqual(self.results(r5)["R3"]["blame"], self.results(r4)["R3"]["blame"])
        self.assertEqual(self.results(r5)["R3"]["failing_since"], r4["run_id"])

    def test_pack_install_adds_rules_and_notifies_owner(self):
        self.runner.handle({"folder_id": FOLDER, "reason": "connected"})
        rules = (C / "1-initial" / "keel-rules.md").read_text().replace("## R1", "uses: gdpr-design-review@1.0.0\n\n## R1", 1)
        self.box.put_file("keel-rules.md", rules, "u-maya")
        r2 = self.runner.handle({"folder_id": FOLDER, "reason": "webhook", "actor": {"id": "u-maya", "name": "Maya Chen"}})
        self.assertTrue(r2["rules"]["changed"])
        self.assertEqual(len(r2["changes"]["added"]), 5)
        added_fail = [r for r in self.results(r2).values() if r["change"] == "added" and r["status"] == "fail"]
        self.assertTrue(added_fail)
        self.assertEqual([t["kind"] for t in r2["tasks"]], ["owner"])

    def test_projection_failure_is_recorded_not_fatal(self):
        self.box.fail_metadata = True
        r = self.runner.handle({"folder_id": FOLDER, "reason": "connected"})
        self.assertEqual(r["status"], "completed")
        self.assertEqual(r["projection"]["status"], "failed")

    def test_error_runs_do_not_repeat_or_lose_the_last_good_run(self):
        self.runner.handle({"folder_id": FOLDER, "reason": "connected"})
        rules = self.box.versions[next(f for f, x in self.box.files.items() if x["name"] == "keel-rules.md")][-1]["text"]
        self.box.trash("keel-rules.md")
        self.assertEqual(self.runner.handle({"folder_id": FOLDER, "reason": "webhook"})["status"], "error")
        for _ in range(6):
            self.assertIsNone(self.runner.handle({"folder_id": FOLDER, "reason": "reconcile"}))
        for _ in range(5):
            self.assertEqual(self.runner.handle({"folder_id": FOLDER, "reason": "manual"})["status"], "error")
        self.box.put_file("keel-rules.md", rules, "u-maya")
        r = self.runner.handle({"folder_id": FOLDER, "reason": "webhook"})
        self.assertEqual(r["previous_run"], 1)
        self.assertFalse(r["changes"]["first_run"])
        self.assertEqual(r["tasks"], [])

    def test_rename_is_a_change(self):
        self.runner.handle({"folder_id": FOLDER, "reason": "connected"})
        fid = next(f for f, x in self.box.files.items() if x["name"] == "proposal.md")
        self.box.files[fid]["name"] = "proposal-v1.md"
        self.assertIsNotNone(self.runner.handle({"folder_id": FOLDER, "reason": "webhook"}))

    def test_missing_rules_file_is_an_error_run(self):
        self.box.trash("keel-rules.md")
        r = self.runner.handle({"folder_id": FOLDER, "reason": "manual"})
        self.assertEqual(r["status"], "error")
        self.assertIn("keel-rules.md", r["error"])


if __name__ == "__main__":
    unittest.main()
