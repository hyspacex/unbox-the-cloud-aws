import unittest
from pathlib import Path

import tests  # noqa: F401
from keel_runner import config
from keel_runner.judges import Citation, Doc, Verdict
from keel_runner.judges.offline import OfflineJudge
from keel_runner.rules import catalog, parse_rules_file, set_uses
from keel_runner.validate import locate, validate

CONTENT = config.KEEL_ROOT / "content" / "lantern"


def docs_from(*paths: Path) -> list[Doc]:
    return [Doc(str(i), p.name, f"v{i}", p.read_text()) for i, p in enumerate(paths)]


def initial_docs(**overrides: Path) -> list[Doc]:
    names = ["proposal.md", "architecture.md", "security-checklist.md", "kickoff-transcript.txt"]
    return docs_from(*[overrides.get(n.replace("-", "_").replace(".", "_"), CONTENT / "1-initial" / n) for n in names])


class RulesTest(unittest.TestCase):
    def test_parses_folder_rules(self):
        rs = parse_rules_file((CONTENT / "1-initial" / "keel-rules.md").read_text())
        self.assertEqual([r.id for r in rs.rules], [f"R{i}" for i in range(1, 9)])
        self.assertEqual(rs.rules[2].title, "Latency targets consistent")
        self.assertIn("p99 latency targets agree", rs.rules[2].text)

    def test_inline_offline_hints_are_parsed_and_stripped(self):
        rs = parse_rules_file('## X1 · T\nBody\n<!-- keel:offline {"kind":"require_all","clauses":[]} -->\n')
        self.assertEqual(rs.rules[0].offline["kind"], "require_all")
        self.assertEqual(rs.rules[0].text, "Body")

    def test_uses_resolves_packs_and_reports_missing(self):
        text = "# r\nuses: gdpr-design-review@1.0.0\nuses: nope@9\n\n## R1 · One\nText\n"
        rs = parse_rules_file(text)
        ids = [r.id for r in rs.rules]
        self.assertIn("gdpr-design-review/G1", ids)
        self.assertIn("nope@9", ids)
        self.assertEqual(next(r for r in rs.rules if r.id == "nope@9").error, "pack_not_found")

    def test_set_uses_add_replace_remove(self):
        base = (CONTENT / "1-initial" / "keel-rules.md").read_text()
        added = set_uses(base, "gdpr-design-review", "1.0.0")
        self.assertIn("uses: gdpr-design-review@1.0.0", added)
        self.assertLess(added.index("uses:"), added.index("## R1"))
        two = set_uses(added, "nist-csf-2-design", "1.0.0")
        self.assertEqual(two.count("uses:"), 2)
        self.assertNotIn("gdpr", set_uses(two, "gdpr-design-review", None))
        self.assertEqual(parse_rules_file(two).uses, ["gdpr-design-review@1.0.0", "nist-csf-2-design@1.0.0"])

    def test_catalog_lists_packs_with_rules(self):
        packs = {p["id"]: p for p in catalog()}
        self.assertEqual(len(packs["gdpr-design-review"]["rules"]), 5)
        self.assertTrue(packs["iso-27001-mapping"]["license_required"])
        self.assertEqual(packs["iso-27001-mapping"]["rules"], [])


class OfflineJudgeTest(unittest.TestCase):
    def setUp(self):
        self.rules = parse_rules_file((CONTENT / "1-initial" / "keel-rules.md").read_text()).rules
        self.judge = OfflineJudge(delay=0)

    def statuses(self, docs):
        return {v.rule_id: v.status for v in self.judge.evaluate(self.rules, docs)}

    def test_initial_folder_fails_checklist_and_retention(self):
        s = self.statuses(initial_docs())
        self.assertEqual({k for k, v in s.items() if v == "fail"}, {"R1", "R6"})

    def test_fix_uploads_make_everything_pass(self):
        docs = initial_docs(security_checklist_md=CONTENT / "2-fix" / "security-checklist.md") + docs_from(CONTENT / "2-fix" / "data-retention.md")
        docs[-1].file_id = "99"
        self.assertTrue(all(v == "pass" for v in self.statuses(docs).values()))

    def test_regression_breaks_encryption_and_latency(self):
        docs = initial_docs(architecture_md=CONTENT / "3-regression" / "architecture.md",
                            security_checklist_md=CONTENT / "2-fix" / "security-checklist.md") + docs_from(CONTENT / "2-fix" / "data-retention.md")
        docs[-1].file_id = "99"
        verdicts = {v.rule_id: v for v in self.judge.evaluate(self.rules, docs)}
        self.assertEqual({k for k, v in verdicts.items() if v.status == "fail"}, {"R2", "R3"})
        self.assertIn("200 ms", verdicts["R3"].reason)
        self.assertIn("50 ms", verdicts["R3"].reason)
        self.assertEqual(verdicts["R2"].missing, ["customer-managed keys", "key rotation period"])

    def test_headings_are_not_evidence(self):
        pack = parse_rules_file("uses: gdpr-design-review@1.0.0\n").rules
        docs = docs_from(CONTENT / "2-fix" / "data-retention.md")
        g3 = next(v for v in self.judge.evaluate(pack, docs) if v.rule_id.endswith("G3"))
        self.assertTrue(g3.citations[0].quote.startswith("Customer deletion requests"))

    def test_every_offline_citation_validates(self):
        docs = initial_docs()
        by_id = {d.file_id: d for d in docs}
        for v in self.judge.evaluate(self.rules, docs):
            status, _, _, problems = validate(v, by_id)
            self.assertEqual(problems, [], v.rule_id)
            self.assertEqual(status, v.status)


class ValidateTest(unittest.TestCase):
    doc = Doc("f1", "a.md", "v1", "# Title\n## 4.3 Keys\nKeys are rotated every 12 months.\n[00:01:02] Ann: We agreed 50 ms.\n")

    def test_locates_quote_with_section_and_timestamp(self):
        self.assertEqual(locate("keys are  ROTATED every 12 months", self.doc.text)["section"], "4.3 Keys")
        self.assertEqual(locate("Ann: We agreed 50 ms", self.doc.text)["timestamp"], "00:01:02")

    def test_fabricated_quote_is_not_used(self):
        v = Verdict("R1", "pass", "ok", [Citation("f1", "Keys are customer-managed.")])
        status, reason, _, problems = validate(v, {"f1": self.doc})
        self.assertEqual(status, "unknown")
        self.assertTrue(problems)

    def test_pass_without_evidence_is_not_used(self):
        status, *_ = validate(Verdict("R1", "pass", "ok", []), {"f1": self.doc})
        self.assertEqual(status, "unknown")

    def test_fail_without_citations_stands(self):
        status, *_ = validate(Verdict("R1", "fail", "missing", []), {"f1": self.doc})
        self.assertEqual(status, "fail")


if __name__ == "__main__":
    unittest.main()
