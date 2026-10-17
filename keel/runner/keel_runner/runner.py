"""Run handler: one check run per queued message (the Lambda behind the SQS FIFO queue).

Flow: snapshot the folder -> load rules and packs -> read text -> judge -> validate citations ->
compare with the previous run -> blame regressions -> store results -> notify via Box tasks ->
project status onto the folder's metadata.
"""
from __future__ import annotations

import hashlib
import json
import logging
import time
import traceback
from datetime import datetime, timedelta, timezone

from . import config
from .boxclient import BoxApiError, BoxClient
from .decisions import build_ledger, validate_statements
from .judges import Doc, get_extractor, get_judge
from .rules import Rule, RuleSet, parse_rules_file
from .store import Store, folder_pk, run_pk, run_sk
from .validate import validate

log = logging.getLogger("keel.runner")

TEMPLATE_FIELDS = [
    {"type": "enum", "key": "status", "displayName": "Status",
     "options": [{"key": "passing"}, {"key": "review"}, {"key": "failing"}, {"key": "running"}, {"key": "error"}]},
    {"type": "float", "key": "passing", "displayName": "Checks passing"},
    {"type": "float", "key": "failing", "displayName": "Checks failing"},
    {"type": "float", "key": "unknown", "displayName": "Checks not evaluated"},
    {"type": "float", "key": "runNumber", "displayName": "Run number"},
    {"type": "string", "key": "runUrl", "displayName": "Run details"},
    {"type": "date", "key": "checkedAt", "displayName": "Checked at"},
    {"type": "float", "key": "decisionsHolding", "displayName": "Decisions holding"},
    {"type": "float", "key": "decisionsDrifted", "displayName": "Decisions drifted"},
]


def utcnow() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def user_ref(u: dict | None) -> dict | None:
    return {"id": u.get("id"), "name": u.get("name")} if u else None


class Runner:
    def __init__(self, box: BoxClient | None = None, store: Store | None = None, judge=None, extractor=None):
        self.box = box or BoxClient()
        self.store = store or Store()
        self.judge = judge or get_judge()
        self.extractor = extractor or get_extractor()
        self.app_url = config.get("KEEL_APP_URL", "http://localhost:3000").rstrip("/")

    # ------------------------------------------------------------------ entry
    def handle(self, message: dict) -> dict | None:
        folder_id = message["folder_id"]
        meta = self.store.get(folder_pk(folder_id), "META")
        if not meta:
            log.info("ignoring message for unconnected folder %s", folder_id)
            return None
        snapshot = self.snapshot(folder_id, meta)
        reason = message.get("reason", "manual")
        if reason in ("webhook", "reconcile") and snapshot["hash"] == meta.get("last_snapshot_hash"):
            log.info("folder %s unchanged (%s); no run", folder_id, reason)
            return None
        return self.run(folder_id, meta, snapshot, message)

    # ------------------------------------------------------------------ snapshot
    def snapshot(self, folder_id: str, meta: dict) -> dict:
        prev_run = self.latest_run(folder_id)
        prev_files = {f["id"]: f for f in (prev_run or {}).get("snapshot", {}).get("files", [])}
        files = []
        for item in self.box.folder_items(folder_id):
            if item.get("type") != "file":
                continue
            version = item["file_version"]
            prev = prev_files.get(item["id"])
            if prev and prev["version_id"] == version["id"]:
                number = prev["version_number"]
            else:
                number = len(self.box.file_versions(item["id"])) + 1
            files.append({
                "id": item["id"], "name": item["name"], "version_id": version["id"], "sha1": version.get("sha1") or item.get("sha1"),
                "version_number": number, "size": item.get("size"), "modified_at": item.get("modified_at"),
                "modified_by": user_ref(item.get("modified_by")),
                "changed": prev_run is not None and (prev is None or prev["version_id"] != version["id"]),
                "added": prev_run is not None and prev is None,
            })
        removed = [f for fid, f in prev_files.items() if fid not in {x["id"] for x in files}]
        # Names are part of the snapshot: a rename creates no new version but can change which file is the rules file.
        digest = hashlib.sha256(json.dumps(sorted((f["id"], f["version_id"], f["name"]) for f in files)).encode()).hexdigest()[:16]
        return {"hash": digest, "files": files, "removed": [{"id": f["id"], "name": f["name"]} for f in removed]}

    def latest_run(self, folder_id: str) -> dict | None:
        """The most recent completed run (error runs in between are skipped, however many there are)."""
        meta = self.store.get(folder_pk(folder_id), "META") or {}
        number = meta.get("last_completed_run")
        return self.store.get(folder_pk(folder_id), run_sk(number)) if number else None

    # ------------------------------------------------------------------ run
    def run(self, folder_id: str, meta: dict, snapshot: dict, message: dict) -> dict:
        started = time.time()
        number = self._allocate_run_number(folder_id)
        run_id = f"{folder_id}-{number}"
        prev = self.latest_run(folder_id)
        run = {
            "run_id": run_id, "number": number, "folder_id": folder_id, "status": "running",
            "trigger": {"reason": message.get("reason", "manual"), "event_id": message.get("event_id"),
                        "event": message.get("event"), "actor": message.get("actor"), "file": message.get("file"),
                        "topic": message.get("topic"), "action": message.get("action")},
            "started_at": utcnow(), "snapshot": snapshot,
            "judge": {"name": self.judge.name, "model_id": getattr(self.judge, "model_id", "")},
            "previous_run": prev["number"] if prev else None, "first_run": prev is None,
        }
        self.store.put(folder_pk(folder_id), run_sk(number), run)
        self._project(folder_id, meta, {"status": "running", "runNumber": number})

        try:
            rules_file = next((f for f in snapshot["files"] if f["name"] == config.RULES_FILE_NAME), None)
            if not rules_file:
                raise RunError(f"No {config.RULES_FILE_NAME} in this folder. Add one to define the checks.")
            rules_text = self.box.download(rules_file["id"], rules_file["version_id"]).decode("utf-8", "replace")
            ruleset = parse_rules_file(rules_text)
            if not ruleset.rules:
                raise RunError(f"{config.RULES_FILE_NAME} defines no rules.")
            docs, coverage = self.read_documents(snapshot, rules_file["id"])
            verdicts = {v.rule_id: v for v in self.judge.evaluate(ruleset.rules, docs)}
            results = self.build_results(run_id, ruleset, verdicts, docs, coverage)
            prev_results = {r["rule_id"]: r for r in self.store.query(run_pk(prev["run_id"]), "RESULT#")} if prev else {}
            changes = self.compare(results, prev_results, prev, ruleset)
            self.blame(results, snapshot, run["trigger"], rules_file)
            counts = {s: sum(1 for r in results if r["status"] == s) for s in ("pass", "fail", "unknown")}

            prev_ledger = {d["topic"]: d for d in self.store.query(run_pk(prev["run_id"]), "DECISION#")} if prev else {}
            known = [{"topic": t, "label": d["label"]} for t, d in prev_ledger.items()]
            statements, rejected = validate_statements(self.extractor.extract(docs, known), {d.file_id: d for d in docs})
            resolutions = {r["topic"]: r for r in self.store.query(folder_pk(folder_id), "RESOLUTION#")}
            ledger = build_ledger(run, statements, prev_ledger, snapshot, resolutions)
            dcounts = {k: sum(1 for d in ledger if d["status"] == k) for k in ("holding", "drifted", "unstated")}
            run.update({
                "rules": {"hash": ruleset.hash, "file": {"id": rules_file["id"], "version_id": rules_file["version_id"],
                                                          "version_number": rules_file["version_number"]},
                          "uses": ruleset.uses, "packs": ruleset.packs,
                          "changed": bool(prev) and prev.get("rules", {}).get("hash") != ruleset.hash},
                "coverage": coverage,
                "counts": {"passing": counts["pass"], "failing": counts["fail"], "unknown": counts["unknown"], "total": len(results)},
                "changes": changes,
                "decisions": {**dcounts, "total": len(ledger), "rejected_statements": rejected,
                              "drifted_now": [d["topic"] for d in ledger if d["change"] == "drifted"],
                              "resolved": [d["topic"] for d in ledger if d["change"] == "resolved"],
                              "updated": [d["topic"] for d in ledger if d["change"] == "updated"],
                              "adopted": [d["topic"] for d in ledger if d["change"] == "adopted"],
                              "kept": [d["topic"] for d in ledger if d["change"] == "kept"],
                              "needs_decision": sum(1 for d in ledger if d.get("decision_state") == "needs_decision")},
                "packs_summary": self.pack_summary(ruleset, results),
                "extractor": {"name": self.extractor.name, "model_id": getattr(self.extractor, "model_id", "")},
            })
            run["summary"] = self.summarize(run, results, ledger)
            run["tasks"] = self.notify(folder_id, meta, run, results, rules_file, ledger)
            items = [(run_pk(run_id), f"RESULT#{r['rule_id']}", r) for r in results]
            items += [(run_pk(run_id), f"DECISION#{d['topic']}", d) for d in ledger]
            for i in range(0, len(items), 100):
                self.store.transact_put(items[i:i + 100])
            run["status"] = "completed"
        except RunError as e:
            run.update({"status": "error", "error": str(e)})
        except Exception as e:  # surfaced in the UI; never shown as passing
            log.exception("run %s failed", run_id)
            run.update({"status": "error", "error": f"{type(e).__name__}: {e}", "traceback": traceback.format_exc()[-2000:]})

        run["finished_at"] = utcnow()
        run["duration_ms"] = int((time.time() - started) * 1000)
        if run["status"] == "completed":
            c, dc = run["counts"], run["decisions"]
            status = "failing" if c["failing"] else "review" if dc["drifted"] + dc["unstated"] else ("error" if c["unknown"] and not c["passing"] else "passing")
            projected = {"status": status,
                         "passing": c["passing"], "failing": c["failing"], "unknown": c["unknown"],
                         "decisionsHolding": dc["holding"], "decisionsDrifted": dc["drifted"]}
        else:
            projected = {"status": "error"}
        projected.update({"runNumber": number, "runUrl": f"{self.app_url}/folders/{folder_id}/runs/{number}", "checkedAt": run["finished_at"]})
        run["projection"] = self._project(folder_id, meta, projected)
        self.store.put(folder_pk(folder_id), run_sk(number), run)
        self._update_meta(folder_id, run, snapshot)
        return run

    def _allocate_run_number(self, folder_id: str) -> int:
        for _ in range(5):
            meta = self.store.get(folder_pk(folder_id), "META")
            version = meta.pop("_version")
            meta["run_count"] = meta.get("run_count", 0) + 1
            try:
                self.store.put(folder_pk(folder_id), "META", meta, expected_version=version)
                return meta["run_count"]
            except Exception:
                time.sleep(0.05)
        raise RuntimeError("could not allocate run number")

    def _update_meta(self, folder_id: str, run: dict, snapshot: dict) -> None:
        for _ in range(5):
            meta = self.store.get(folder_pk(folder_id), "META")
            version = meta.pop("_version")
            # Error runs record the hash too, so an unchanged broken folder is not re-run on every
            # reconcile tick or webhook retry; a manual run or a new upload retries it.
            meta["last_snapshot_hash"] = snapshot["hash"]
            if run["status"] == "completed":
                meta["last_completed_run"] = run["number"]
            meta["latest_run"] = {k: run.get(k) for k in ("run_id", "number", "status", "counts", "finished_at", "error")}
            try:
                self.store.put(folder_pk(folder_id), "META", meta, expected_version=version)
                return
            except Exception:
                time.sleep(0.05)

    # ------------------------------------------------------------------ steps
    def read_documents(self, snapshot: dict, rules_file_id: str) -> tuple[list[Doc], list[dict]]:
        docs, coverage = [], []
        for f in snapshot["files"]:
            if f["id"] == rules_file_id:
                continue
            entry = {"file_id": f["id"], "name": f["name"], "version_id": f["version_id"]}
            if not f["name"].lower().endswith(config.TEXT_EXTENSIONS):
                coverage.append({**entry, "status": "unsupported", "detail": "Only text files are read in this version"})
                continue
            try:
                text = self.box.download(f["id"], f["version_id"]).decode("utf-8", "replace")
                docs.append(Doc(f["id"], f["name"], f["version_id"], text))
                coverage.append({**entry, "status": "read", "chars": len(text)})
            except BoxApiError as e:
                coverage.append({**entry, "status": "error", "detail": str(e)})
        return docs, coverage

    def build_results(self, run_id: str, ruleset: RuleSet, verdicts: dict, docs: list[Doc], coverage: list[dict]) -> list[dict]:
        docs_by_id = {d.file_id: d for d in docs}
        unread = [c["name"] for c in coverage if c["status"] == "error"]
        results = []
        for rule in ruleset.rules:
            base = {"run_id": run_id, "rule_id": rule.id, "title": rule.title, "text": rule.text, "source": rule.source,
                    "pack": rule.pack, "citations": [], "missing": [], "problems": []}
            if rule.error:
                results.append({**base, "status": "unknown", "reason": f"Rule pack {rule.id} is not in the catalog, so its rules could not run."})
                continue
            v = verdicts.get(rule.id)
            if not v:
                reason = ("The offline judge only understands rules it has hints for. Set KEEL_JUDGE=bedrock to judge any plain-language rule."
                          if self.judge.name == "offline" else "The judge returned no result for this rule.")
                results.append({**base, "status": "unknown", "reason": reason})
                continue
            status, reason, cites, problems = validate(v, docs_by_id)
            if unread and status == "pass":
                pass  # a pass with validated evidence stands even if another file was unreadable
            elif unread and status == "fail":
                status, reason = "unknown", f"Could not read {', '.join(unread)}, so a failure cannot be confirmed."
            results.append({**base, "status": status, "reason": reason, "citations": cites, "missing": v.missing, "problems": problems})
        return results

    def compare(self, results: list[dict], prev_results: dict, prev_run: dict | None, ruleset: RuleSet) -> dict:
        changes = {"broke": [], "fixed": [], "added": [], "removed": [], "first_run": prev_run is None}
        for r in results:
            p = prev_results.get(r["rule_id"])
            r["previous_status"] = p["status"] if p else None
            if not prev_run:
                r["change"] = "first"
            elif not p:
                r["change"] = "added"
                changes["added"].append(r["rule_id"])
            elif p["status"] != "fail" and r["status"] == "fail":
                r["change"] = "broke"
                changes["broke"].append(r["rule_id"])
            elif p["status"] == "fail" and r["status"] == "pass":
                r["change"] = "fixed"
                changes["fixed"].append(r["rule_id"])
            else:
                r["change"] = "same"
            # carry forward who broke a still-failing rule, and any open task
            if p and r["status"] == "fail" and p.get("status") == "fail":
                r["blame"] = p.get("blame")
                r["task_id"] = p.get("task_id")
                r["failing_since"] = p.get("failing_since") or p.get("run_id")
            elif r["status"] == "fail":
                r["failing_since"] = r["run_id"]
        current = {r["rule_id"] for r in results}
        changes["removed"] = [rid for rid in prev_results if rid not in current]
        return changes

    def blame(self, results: list[dict], snapshot: dict, trigger: dict, rules_file: dict) -> None:
        changed = [f for f in snapshot["files"] if f["changed"] and f["id"] != rules_file["id"]]
        trigger_file = (trigger or {}).get("file") or {}
        for r in results:
            if r.get("change") not in ("broke", "fixed"):
                continue
            cited = {c["file_id"] for c in r["citations"]}
            candidates = [f for f in changed if f["id"] in cited] or changed
            if len(candidates) > 1:
                candidates = [f for f in candidates if f["id"] == trigger_file.get("id")] or candidates[:1]
            if candidates:
                f = candidates[0]
                ref = {"user": f["modified_by"], "file": {"id": f["id"], "name": f["name"], "version_id": f["version_id"],
                                                          "version_number": f["version_number"]}}
            elif snapshot.get("removed"):
                gone = snapshot["removed"][0]
                ref = {"user": (trigger or {}).get("actor"), "file": {"id": gone["id"], "name": gone["name"], "removed": True}}
            else:
                ref = {"user": (trigger or {}).get("actor"), "file": None}
            if r["change"] == "broke":
                r["blame"] = ref
            else:
                r["fixed_by"] = ref

    @staticmethod
    def pack_summary(ruleset: RuleSet, results: list[dict]) -> list[dict]:
        out = []
        for p in ruleset.packs:
            rs = [r for r in results if r.get("pack") and r["pack"]["id"] == p["id"]]
            out.append({**p, "passing": sum(1 for r in rs if r["status"] == "pass"), "total": len(rs)})
        return out

    @staticmethod
    def summarize(run: dict, results: list[dict], ledger: list[dict]) -> dict:
        """One-line headline for notifications and the activity feed."""
        trig = run["trigger"]
        drifted = [d for d in ledger if d["change"] == "drifted"]
        broke = [r for r in results if r.get("change") == "broke"]
        fresh = [r for r in results if r["status"] == "fail" and r.get("change") in ("added", "first")]
        resolved = [d for d in ledger if d["change"] == "resolved"] + [r for r in results if r.get("change") == "fixed"]
        updated = [d for d in ledger if d["change"] == "updated"]
        attention = sum(1 for r in results if r["status"] == "fail") + sum(1 for d in ledger if d["status"] in ("drifted", "unstated"))
        adopted = [d for d in ledger if d["change"] == "adopted"]
        kept = [d for d in ledger if d["change"] == "kept"]
        if adopted:
            d = adopted[0]
            return {"kind": "adopted", "title": "Decision updated", "text": f"{d['label']} is now {d['agreed_value']}",
                    "by": d["resolution"]["by"]["name"], "more": len(adopted) - 1}
        if kept:
            d = kept[0]
            return {"kind": "kept", "title": "Change declined", "text": f"{d['label']} stays {d['agreed_value']} · revert requested",
                    "by": d["resolution"]["by"]["name"], "more": len(kept) - 1}
        if drifted:
            d = drifted[0]
            by = (d["drift"].get("by") or {})
            return {"kind": "drift", "title": "Proposed change",
                    "text": f"{d['label']}: {d['agreed_value']} → {d['drift']['value']}",
                    "by": (by.get("user") or {}).get("name"), "file": (by.get("file") or {}).get("name"), "more": len(drifted) + len(broke) - 1}
        if broke:
            r = broke[0]
            return {"kind": "fail", "title": "Check failing", "text": r["title"],
                    "by": ((r.get("blame") or {}).get("user") or {}).get("name"), "more": len(broke) - 1}
        if fresh:
            return {"kind": "fail", "title": f"{len(fresh)} check{'s need' if len(fresh) > 1 else ' needs'} attention",
                    "text": fresh[0]["title"], "more": len(fresh) - 1}
        if resolved and not attention:
            x = resolved[0]
            text = f"{x['label']}: {x['agreed_value']}" if "topic" in x else x["title"]
            return {"kind": "resolved", "title": "Back in agreement" if "topic" in x else "Check passing again", "text": text, "more": len(resolved) - 1}
        if updated:
            d = updated[0]
            h = d["history"][-1]
            return {"kind": "updated", "title": "Decision updated", "text": f"{d['label']}: {h['from']} → {h['to']}", "more": len(updated) - 1}
        if attention:
            return {"kind": "attention", "title": f"{attention} still need{'s' if attention == 1 else ''} attention", "text": "", "more": 0}
        return {"kind": "clear", "title": "All clear", "text": "Every decision holds and every check passes.", "more": 0,
                "by": (trig.get("actor") or {}).get("name")}

    # ------------------------------------------------------------------ Box writes
    def notify(self, folder_id: str, meta: dict, run: dict, results: list[dict], rules_file: dict, ledger: list[dict] | None = None) -> list[dict]:
        tasks = []
        due = (datetime.now(timezone.utc) + timedelta(days=2)).strftime("%Y-%m-%dT%H:%M:%SZ")
        url = f"{self.app_url}/folders/{folder_id}/runs/{run['number']}"

        # Broken checks: one task per (uploader, file) that broke something.
        groups: dict[tuple, list[dict]] = {}
        for r in results:
            if r.get("change") == "broke" and r.get("blame") and r["blame"].get("user") and r["blame"].get("file") and not r["blame"]["file"].get("removed"):
                key = (r["blame"]["user"]["id"], r["blame"]["file"]["id"])
                groups.setdefault(key, []).append(r)
            elif r.get("change") == "broke" and r.get("blame") and r["blame"].get("user"):
                groups.setdefault((r["blame"]["user"]["id"], rules_file["id"]), []).append(r)
        for (user_id, file_id), rs in groups.items():
            f = next((x for x in run["snapshot"]["files"] if x["id"] == file_id), rules_file)
            nc = len(rs)
            head = f"Keel · Your upload of {f['name']} (v{f['version_number']}) broke {nc} check{'s' if nc > 1 else ''}."
            tasks.append(self._task(folder_id, file_id, user_id, head, rs, url, due, run, "regression"))

        # Failures nobody "broke" (first run, newly added rules): one task for the folder owner.
        fresh = [r for r in results if r["status"] == "fail" and r.get("change") in ("first", "added")]
        if fresh and meta.get("owner"):
            n = len(fresh)
            why = "on the first run" if run["changes"]["first_run"] else "after the rules changed"
            head = f"Keel · run #{run['number']} · {n} check{'s' if n > 1 else ''} failing {why}."
            tasks.append(self._task(folder_id, rules_file["id"], meta["owner"]["id"], head, fresh, url, due, run, "owner"))

        # Fixed rules and resolved decisions: annotate the open task that reported them.
        for r in results:
            if r.get("change") != "fixed":
                continue
            prev_task = self._task_for_rule(folder_id, r["rule_id"])
            if prev_task:
                self._resolve_rule_on_task(folder_id, prev_task, r, run)
        tasks += self.notify_decisions(folder_id, meta, run, ledger or [], due)
        return [t for t in tasks if t]

    # Decisions: a drift is a proposed change. The decision owner adopts or keeps it in Keel;
    # Keel then asks the right people to update their documents.
    def notify_decisions(self, folder_id: str, meta: dict, run: dict, ledger: list[dict], due: str) -> list[dict]:
        tasks = []
        owner = meta.get("owner") or {}
        files = {f["id"]: f for f in run["snapshot"]["files"]}
        for d in ledger:
            link = f"{self.app_url}/folders/{folder_id}/decisions/{d['topic']}"
            key = f"decision:{d['topic']}"
            agreed_files = ", ".join(sorted({s["file_name"] for s in d["statements"] + d.get("superseded", []) if s["value"] == (d["resolution"] or {}).get("from_value", d["agreed_value"])}))
            if d["change"] == "drifted" and d["drift"] and owner.get("id"):
                by, st = d["drift"]["by"] or {}, d["drift"]["statements"][0]
                msg = (f"Keel · Proposed change in {st['file_name']} (v{(by.get('file') or {}).get('version_number', '?')}) by {(by.get('user') or {}).get('name', 'someone')}:\n\n"
                       f"● {d['label']}: {d['agreed_value']} → {d['drift']['value']}\n"
                       f"    Current decision from {agreed_files}\n    “{st['quote'][:160]}” — {st['file_name']}\n\nAdopt or keep it: {link}")
                tasks.append(self._simple_task(folder_id, st["file_id"], owner["id"], msg, [key], "decision", run))
            elif d["change"] == "kept" and d["drift"]:
                by, st = d["drift"]["by"] or {}, d["drift"]["statements"][0]
                self._annotate(folder_id, key, f"✓ {d['resolution']['by']['name']} kept {d['label']} = {d['agreed_value']}. Revert requested.")
                if (by.get("user") or {}).get("id"):
                    msg = (f"Keel · {d['resolution']['by']['name']} kept the decision {d['label']} = {d['agreed_value']}.\n"
                           f"Your upload of {st['file_name']} says {d['drift']['value']}. Please change it back.\n\n"
                           f"    “{st['quote'][:160]}” — {st['file_name']}\n\nDetails: {link}")
                    tasks.append(self._simple_task(folder_id, st["file_id"], by["user"]["id"], msg, [key], "revert", run))
            elif d["change"] == "adopted":
                res = d["resolution"]
                self._annotate(folder_id, key, f"✓ {res['by']['name']} adopted {d['label']} = {res['value']}.")
                for st in d.get("superseded", []):
                    f = files.get(st["file_id"])
                    if not f or is_record(st["file_name"]) or not (f.get("modified_by") or {}).get("id"):
                        continue  # meeting records keep what was said at the time; they are superseded, not edited
                    msg = (f"Keel · {res['by']['name']} adopted {d['label']} = {res['value']} (was {res['from_value']}).\n"
                           f"{st['file_name']} still says {res['from_value']}. Please update it.\n\n"
                           f"    “{st['quote'][:160]}” — {st['file_name']}\n\nDetails: {link}")
                    tasks.append(self._simple_task(folder_id, st["file_id"], f["modified_by"]["id"], msg,
                                                   [f"update:{d['topic']}:{st['file_id']}"], "update", run))
            elif d["change"] in ("resolved", "updated") and d["previous_status"] == "drifted":
                self._annotate(folder_id, key, f"✓ {d['label']} agrees again ({d['agreed_value']}) as of run #{run['number']}.")
            # Update requests are done once that document states the adopted value.
            for st in d["statements"]:
                if st["value"] == d["agreed_value"] and d["status"] == "holding":
                    self._annotate(folder_id, f"update:{d['topic']}:{st['file_id']}", f"✓ {st['file_name']} now says {d['agreed_value']}.")
        return tasks

    def _simple_task(self, folder_id, file_id, user_id, message, keys, kind, run) -> dict | None:
        due = (datetime.now(timezone.utc) + timedelta(days=2)).strftime("%Y-%m-%dT%H:%M:%SZ")
        entry = {"kind": kind, "file_id": file_id, "assignee_id": user_id, "rules": keys, "message": message}
        try:
            task = self.box.create_task(file_id, message, due)
            assignment = self.box.assign_task(task["id"], user_id)
            entry.update({"task_id": task["id"], "assignee": user_ref(assignment.get("assigned_to"))})
            self.store.put(folder_pk(folder_id), f"TASK#{task['id']}", {
                "task_id": task["id"], "file_id": file_id, "assignee_id": user_id, "rules": keys, "open_rules": keys,
                "run_number": run["number"], "message": message, "kind": kind})
        except BoxApiError as e:
            entry["error"] = str(e)
        return entry

    def _annotate(self, folder_id: str, key: str, note: str) -> None:
        """Close `key` on every open task that tracks it, appending a note to the Box task message."""
        for t in self.store.query(folder_pk(folder_id), "TASK#"):
            if key not in t.get("open_rules", []):
                continue
            t.pop("_version", None)
            t["open_rules"] = [x for x in t["open_rules"] if x != key]
            t["message"] += "\n" + note
            try:
                self.box.update_task(t["task_id"], t["message"])
            except BoxApiError as e:
                log.warning("could not update task %s: %s", t["task_id"], e)
            self.store.put(folder_pk(folder_id), f"TASK#{t['task_id']}", t)

    def _task(self, folder_id, file_id, user_id, head, rs, url, due, run, kind) -> dict | None:
        lines = [head, ""]
        for r in rs:
            if "topic" in r:
                agreed_in = sorted({s["file_name"] for s in r["statements"] if s["value"] == r["agreed_value"]})
                lines.append(f"● {r['label']}: agreed {r['agreed_value']} → your version says {r['drift']['value']}")
                lines.append(f"    Agreed in {', '.join(agreed_in)}")
                for st in r["drift"]["statements"][:1]:
                    lines.append(f"    “{st['quote'][:160]}” — {st['file_name']}")
                continue
            lines.append(f"✗ {r['rule_id']} · {r['title']} — {r['reason']}")
            for c in r["citations"][:2]:
                lines.append(f"    “{c['quote'][:160]}” — {c['file_name']}")
        first = rs[0]
        link = f"{self.app_url}/folders/{folder_id}/decisions/{first['topic']}" if "topic" in first else url
        lines += ["", f"Details: {link}"]
        message = "\n".join(lines)
        keys = [f"decision:{r['topic']}" if "topic" in r else r["rule_id"] for r in rs]
        entry = {"kind": kind, "file_id": file_id, "assignee_id": user_id, "rules": keys, "message": message}
        try:
            task = self.box.create_task(file_id, message, due)
            try:
                assignment = self.box.assign_task(task["id"], user_id)
                entry["assignment_id"] = assignment["id"]
                entry["assignee"] = user_ref(assignment.get("assigned_to"))
            except BoxApiError as e:
                entry["assign_error"] = str(e)
            entry["task_id"] = task["id"]
            for r in rs:
                r["task_id"] = task["id"]
            self.store.put(folder_pk(folder_id), f"TASK#{task['id']}", {
                "task_id": task["id"], "file_id": file_id, "assignee_id": user_id, "rules": keys,
                "open_rules": keys, "run_number": run["number"], "message": message, "kind": kind})
        except BoxApiError as e:
            entry["error"] = str(e)
        return entry

    def _task_for_rule(self, folder_id: str, rule_id: str) -> dict | None:
        for t in self.store.query(folder_pk(folder_id), "TASK#", descending=True):
            if rule_id in t.get("open_rules", []):
                return t
        return None

    def _resolve_rule_on_task(self, folder_id: str, task: dict, result: dict, run: dict) -> None:
        task.pop("_version", None)
        key = f"decision:{result['topic']}" if "topic" in result else result["rule_id"]
        task["open_rules"] = [x for x in task["open_rules"] if x != key]
        if "topic" in result:
            verb = "now agrees on" if result.get("change") == "updated" else "agrees again"
            note = f"✓ {result['label']} {verb} ({result['agreed_value']}) as of run #{run['number']}."
        else:
            note = f"✓ {result['rule_id']} passes again as of run #{run['number']}."
        if not task["open_rules"]:
            note += " All checks from this task pass now — you can mark it complete."
        task["message"] = task["message"] + "\n" + note
        try:
            self.box.update_task(task["task_id"], task["message"])
        except BoxApiError as e:
            log.warning("could not update task %s: %s", task["task_id"], e)
        self.store.put(folder_pk(folder_id), f"TASK#{task['task_id']}", task)

    def _project(self, folder_id: str, meta: dict, values: dict) -> dict:
        try:
            self.box.set_folder_metadata(folder_id, config.METADATA_SCOPE, config.METADATA_TEMPLATE, values)
            return {"status": "ok", "values": values}
        except BoxApiError as e:
            log.warning("metadata projection failed: %s", e)
            return {"status": "failed", "error": str(e), "values": values}


def is_record(name: str) -> bool:
    """Meeting transcripts and minutes record what was said at the time; they are never asked to change."""
    n = name.lower()
    return any(k in n for k in ("transcript", "minutes", "recording")) or n.endswith(".vtt")


class RunError(Exception):
    pass


# ---------------------------------------------------------------------- Lambda entry point
_runner: Runner | None = None


def handler(event: dict, context=None) -> dict:
    """SQS FIFO event source handler with partial batch responses."""
    global _runner
    _runner = _runner or Runner()
    failures = []
    for record in event.get("Records", []):
        try:
            _runner.handle(json.loads(record["body"]))
        except Exception:
            log.exception("message %s failed", record.get("messageId"))
            failures.append({"itemIdentifier": record["messageId"]})
    return {"batchItemFailures": failures}
