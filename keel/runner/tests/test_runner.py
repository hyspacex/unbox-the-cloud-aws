import unittest

import tests  # noqa: F401
from keel_runner import config
from keel_runner.api import ApiError, KeelApi
from keel_runner.judges.extract_offline import OfflineExtractor
from keel_runner.judges.offline import OfflineJudge
from keel_runner.runner import Runner
from keel_runner.store import Store
from tests.fakes import MemoryBox

C = config.KEEL_ROOT / "content" / "lantern"
SEED_FILES = (("proposal.md", "u-maya"), ("kickoff-transcript.txt", "u-maya"), ("architecture.md", "u-park"),
              ("security-checklist.md", "u-dana"), ("data-retention.md", "u-park"), ("keel-rules.md", "u-maya"))


class _NullQueue:
    def send(self, body, group_id, dedup_id):
        return {"MessageId": dedup_id, "Duplicate": False}


class RunnerTest(unittest.TestCase):
    def setUp(self):
        self.folder = f"f-{id(self)}"
        self.box = MemoryBox()
        self.store = Store()
        self.runner = Runner(box=self.box, store=self.store, judge=OfflineJudge(delay=0), extractor=OfflineExtractor())
        self.store.put(f"FOLDER#{self.folder}", "META", {"folder_id": self.folder, "name": "Lantern", "owner": {"id": "u-maya", "name": "Maya Chen"}, "run_count": 0})
        for name, user in SEED_FILES:
            self.box.put_file(name, (C / "seed" / name).read_text(), user)

    def connect(self):
        return self.runner.handle({"folder_id": self.folder, "reason": "connected", "actor": {"id": "u-maya", "name": "Maya Chen"}})

    def upload(self, name, text, user):
        fid = self.box.put_file(name, text, user)
        return self.runner.handle({"folder_id": self.folder, "reason": "webhook", "actor": {"id": user, "name": self.box.users[user]},
                                   "file": {"id": fid, "name": name}})

    def upload_path(self, path, user):
        return self.upload(path.name, path.read_text(), user)

    def items(self, run, prefix):
        key = "rule_id" if prefix == "RESULT#" else "topic"
        return {r[key]: r for r in self.store.query(f"RUN#{run['run_id']}", prefix)}

    def current_text(self, name):
        fid = next(f for f, x in self.box.files.items() if x["name"] == name)
        return self.box.versions[fid][-1]["text"]

    # ---------------------------------------------------------------- the demo story
    def test_all_clear_then_drift_then_fix(self):
        r1 = self.connect()
        self.assertEqual(r1["counts"]["failing"], 0)
        self.assertEqual((r1["decisions"]["holding"], r1["decisions"]["drifted"]), (8, 0))
        self.assertEqual(r1["tasks"], [])
        self.assertEqual(r1["summary"]["kind"], "clear")
        self.assertEqual(self.box.metadata[self.folder]["status"], "passing")
        latency = self.items(r1, "DECISION#")["p99_latency"]
        self.assertEqual(latency["agreed_value"], "50 ms")
        self.assertEqual(sorted(latency["values"][0]["files"]), ["architecture.md", "kickoff-transcript.txt", "proposal.md"])

        r2 = self.upload_path(C / "drift" / "architecture.md", "u-park")
        self.assertEqual(r2["decisions"]["drifted_now"], ["p99_latency"])
        self.assertEqual(r2["counts"]["failing"], 0)
        self.assertEqual(r2["summary"]["kind"], "drift")
        self.assertEqual(r2["summary"]["text"], "p99 latency target: 50 ms → 200 ms")
        self.assertEqual(r2["summary"]["by"], "J. Park")
        d = self.items(r2, "DECISION#")["p99_latency"]
        self.assertEqual((d["status"], d["agreed_value"], d["drift"]["value"]), ("drifted", "50 ms", "200 ms"))
        self.assertEqual(d["drift"]["by"]["user"]["id"], "u-park")
        self.assertEqual(d["drift"]["by"]["file"]["version_number"], 2)
        self.assertEqual(r2["summary"]["title"], "Proposed change")
        self.assertEqual(d["decision_state"], "needs_decision")
        [task] = r2["tasks"]
        self.assertEqual((task["kind"], task["assignee_id"], task["rules"]), ("decision", "u-maya", ["decision:p99_latency"]))
        msg = self.box.tasks[task["task_id"]]["message"]
        self.assertIn("Proposed change in architecture.md (v2) by J. Park", msg)
        self.assertIn("p99 latency target: 50 ms → 200 ms", msg)
        self.assertIn("Adopt or keep it", msg)
        self.assertEqual(self.box.metadata[self.folder]["status"], "review")
        self.assertEqual(self.box.metadata[self.folder]["decisionsDrifted"], 1)

        r3 = self.upload_path(C / "fix" / "architecture.md", "u-park")
        self.assertEqual(r3["decisions"]["resolved"], ["p99_latency"])
        self.assertEqual(r3["summary"]["kind"], "resolved")
        self.assertIn("agrees again (50 ms)", self.box.tasks[task["task_id"]]["message"])
        self.assertEqual(self.box.metadata[self.folder]["status"], "passing")

    def test_unchanged_folder_does_not_rerun(self):
        self.connect()
        self.assertIsNone(self.runner.handle({"folder_id": self.folder, "reason": "reconcile"}))

    def test_still_drifted_keeps_attribution_and_does_not_renotify(self):
        self.connect()
        r2 = self.upload_path(C / "drift" / "architecture.md", "u-park")
        r3 = self.upload("proposal.md", self.current_text("proposal.md") + "\n", "u-maya")
        self.assertEqual(r3["tasks"], [])
        self.assertEqual(r3["decisions"]["drifted_now"], [])
        self.assertEqual(self.items(r3, "DECISION#")["p99_latency"]["drift"]["by"], self.items(r2, "DECISION#")["p99_latency"]["drift"]["by"])

    def test_consistent_change_is_recorded_as_an_update(self):
        self.connect()
        self.upload_path(C / "drift" / "architecture.md", "u-park")
        self.upload("proposal.md", self.current_text("proposal.md").replace("p99 latency of 50 ms", "p99 latency of 200 ms"), "u-maya")
        r = self.upload("kickoff-transcript.txt", self.current_text("kickoff-transcript.txt").replace("50 ms p99", "200 ms p99"), "u-maya")
        d = self.items(r, "DECISION#")["p99_latency"]
        self.assertEqual((d["status"], d["agreed_value"], d["change"]), ("holding", "200 ms", "updated"))
        self.assertEqual(d["history"][-1]["from"], "50 ms")
        self.assertEqual(d["history"][-1]["to"], "200 ms")

    def test_broken_check_is_blamed_and_grouped_with_drift(self):
        self.connect()
        text = (C / "drift" / "architecture.md").read_text().replace(
            "Keys are customer-managed keys in AWS KMS, owned by the Lantern security team, and rotated every 12 months.\n", "")
        r = self.upload("architecture.md", text, "u-park")
        self.assertEqual(r["changes"]["broke"], ["R2"])
        self.assertEqual(self.items(r, "RESULT#")["R2"]["blame"]["user"]["id"], "u-park")
        kinds = {t["kind"]: t for t in r["tasks"]}
        self.assertEqual((kinds["regression"]["assignee_id"], kinds["regression"]["rules"]), ("u-park", ["R2"]))
        self.assertIn("broke 1 check", self.box.tasks[kinds["regression"]["task_id"]]["message"])
        self.assertEqual(kinds["decision"]["assignee_id"], "u-maya")

    # ---------------------------------------------------------------- adopt / keep
    def api(self):
        api = KeelApi(box=self.box, store=self.store, queue=_NullQueue())
        api._actor = lambda uid: {"id": uid, "name": self.box.users[uid]}
        return api

    def decide(self, action, actor="u-maya"):
        res = self.api().resolve_decision(self.folder, "p99_latency", action, actor)
        return self.runner.handle({"folder_id": self.folder, "reason": "decision", "topic": "p99_latency", "action": action,
                                   "actor": res["by"]})

    def test_only_the_decision_owner_can_decide(self):
        self.connect()
        self.upload_path(C / "drift" / "architecture.md", "u-park")
        with self.assertRaises(ApiError) as e:
            self.api().resolve_decision(self.folder, "p99_latency", "adopt", "u-park")
        self.assertEqual(e.exception.status, 403)

    def test_adopt_supersedes_old_statements_and_asks_editable_docs_to_update(self):
        self.connect()
        r2 = self.upload_path(C / "drift" / "architecture.md", "u-park")
        owner_task = r2["tasks"][0]["task_id"]
        r3 = self.decide("adopt")
        d = self.items(r3, "DECISION#")["p99_latency"]
        self.assertEqual((d["status"], d["agreed_value"], d["change"]), ("holding", "200 ms", "adopted"))
        self.assertEqual(sorted(s["file_name"] for s in d["superseded"]), ["kickoff-transcript.txt", "proposal.md"])
        self.assertTrue(d["history"][-1]["adopted"])
        self.assertEqual(d["history"][-1]["by"]["user"]["id"], "u-maya")
        self.assertEqual(r3["summary"]["kind"], "adopted")
        self.assertIn("adopted p99 latency target = 200 ms", self.box.tasks[owner_task]["message"])
        [update] = r3["tasks"]  # the transcript is a record of the meeting, so only proposal.md is asked to change
        self.assertEqual((update["kind"], update["assignee_id"]), ("update", "u-maya"))
        self.assertIn("proposal.md still says 50 ms", self.box.tasks[update["task_id"]]["message"])
        self.assertEqual(r3["decisions"]["drifted"], 0)
        r4 = self.upload("proposal.md", self.current_text("proposal.md").replace("p99 latency of 50 ms", "p99 latency of 200 ms"), "u-maya")
        self.assertEqual(r4["decisions"]["drifted"], 0)
        self.assertIn("proposal.md now says 200 ms", self.box.tasks[update["task_id"]]["message"])
        r5 = self.upload("proposal.md", self.current_text("proposal.md").replace("p99 latency of 200 ms", "p99 latency of 50 ms"), "u-maya")
        self.assertEqual(r5["decisions"]["drifted_now"], ["p99_latency"])  # a new version going back is a new proposal

    def test_keep_asks_the_author_to_revert(self):
        self.connect()
        self.upload_path(C / "drift" / "architecture.md", "u-park")
        r3 = self.decide("keep")
        d = self.items(r3, "DECISION#")["p99_latency"]
        self.assertEqual((d["status"], d["agreed_value"], d["change"], d["decision_state"]), ("drifted", "50 ms", "kept", "revert_requested"))
        self.assertEqual(r3["summary"]["kind"], "kept")
        [revert] = r3["tasks"]
        self.assertEqual((revert["kind"], revert["assignee_id"]), ("revert", "u-park"))
        r4 = self.upload_path(C / "fix" / "architecture.md", "u-park")
        self.assertEqual(r4["decisions"]["resolved"], ["p99_latency"])
        self.assertIn("agrees again (50 ms)", self.box.tasks[revert["task_id"]]["message"])

    # ---------------------------------------------------------------- certifications
    def test_pack_install_then_dpia_upload_certifies(self):
        self.connect()
        rules = self.current_text("keel-rules.md").replace("## R1", "uses: gdpr-design-review@1.0.0\n\n## R1", 1)
        r2 = self.upload("keel-rules.md", rules, "u-maya")
        self.assertTrue(r2["rules"]["changed"])
        self.assertEqual(len(r2["changes"]["added"]), 5)
        [gdpr] = r2["packs_summary"]
        self.assertEqual((gdpr["passing"], gdpr["total"]), (4, 5))
        self.assertEqual([t["kind"] for t in r2["tasks"]], ["owner"])
        r3 = self.upload_path(C / "certify" / "dpia.md", "u-maya")
        self.assertEqual(r3["packs_summary"][0]["passing"], 5)
        self.assertEqual(r3["summary"]["kind"], "resolved")

    # ---------------------------------------------------------------- robustness
    def test_error_runs_do_not_repeat_or_lose_the_last_good_run(self):
        self.connect()
        rules = self.current_text("keel-rules.md")
        self.box.trash("keel-rules.md")
        self.assertEqual(self.runner.handle({"folder_id": self.folder, "reason": "webhook"})["status"], "error")
        for _ in range(6):
            self.assertIsNone(self.runner.handle({"folder_id": self.folder, "reason": "reconcile"}))
        for _ in range(5):
            self.assertEqual(self.runner.handle({"folder_id": self.folder, "reason": "manual"})["status"], "error")
        self.box.put_file("keel-rules.md", rules, "u-maya")
        r = self.runner.handle({"folder_id": self.folder, "reason": "webhook"})
        self.assertEqual(r["previous_run"], 1)
        self.assertFalse(r["changes"]["first_run"])
        self.assertEqual(r["tasks"], [])

    def test_rename_is_a_change(self):
        self.connect()
        fid = next(f for f, x in self.box.files.items() if x["name"] == "proposal.md")
        self.box.files[fid]["name"] = "proposal-v1.md"
        self.assertIsNotNone(self.runner.handle({"folder_id": self.folder, "reason": "webhook"}))

    def test_projection_failure_is_recorded_not_fatal(self):
        self.box.fail_metadata = True
        r = self.connect()
        self.assertEqual(r["status"], "completed")
        self.assertEqual(r["projection"]["status"], "failed")

    def test_missing_rules_file_is_an_error_run(self):
        self.box.trash("keel-rules.md")
        r = self.runner.handle({"folder_id": self.folder, "reason": "manual"})
        self.assertEqual(r["status"], "error")
        self.assertIn("keel-rules.md", r["error"])

    def test_fabricated_decision_quotes_are_dropped(self):
        class Liar(OfflineExtractor):
            def extract(self, docs, known=None):
                out = super().extract(docs, known)
                out[0].quote = "This sentence is not in any document at all."
                return out
        self.runner.extractor = Liar()
        r = self.connect()
        self.assertEqual(r["decisions"]["rejected_statements"], 1)


if __name__ == "__main__":
    unittest.main()
