"""Decisions: the folder's single source of decision truth, extracted from its documents.

Every run extracts decided values (statements) from every document, validates their quotes, and
compares them with the ledger carried forward from the previous completed run:

- holding  every document that states the decision agrees
- drifted  documents disagree; the statements that moved away from the agreed value are the drift
- changed  every document now agrees on a new value; the change is recorded in the decision's history
- unstated a decision the ledger knew is no longer stated anywhere
"""
from __future__ import annotations

from collections import OrderedDict

from .judges import Doc, Statement
from .validate import locate


def validate_statements(statements: list[Statement], docs_by_id: dict[str, Doc]) -> tuple[list[dict], int]:
    out, rejected = [], 0
    for s in statements:
        doc = docs_by_id.get(s.file_id)
        loc = locate(s.quote, doc.text) if doc else None
        if not doc or not loc:
            rejected += 1
            continue
        out.append({"topic": s.topic, "label": s.label, "value": s.value, "file_id": doc.file_id, "file_name": doc.name,
                    "version_id": doc.version_id, "quote": s.quote.strip(), **loc})
    return out, rejected


def _files(snapshot: dict) -> dict:
    return {f["id"]: f for f in snapshot["files"]}


def build_ledger(run: dict, statements: list[dict], prev: dict[str, dict], snapshot: dict) -> list[dict]:
    files = _files(snapshot)
    topics: "OrderedDict[str, list[dict]]" = OrderedDict()
    for s in statements:
        topics.setdefault(s["topic"], []).append(s)
    for t in prev:
        topics.setdefault(t, [])

    out = []
    for topic, stmts in topics.items():
        p = prev.get(topic)
        label = stmts[0]["label"] if stmts else p["label"]
        by_value: "OrderedDict[str, list[dict]]" = OrderedDict()
        for s in stmts:
            by_value.setdefault(s["value"], []).append(s)
        d = {
            "run_id": run["run_id"], "topic": topic, "label": label, "statements": stmts,
            "values": [{"value": v, "files": sorted({s["file_name"] for s in ss})} for v, ss in by_value.items()],
            "history": list(p["history"]) if p else [],
            "first_seen_run": p["first_seen_run"] if p else run["number"],
            "first_seen_at": p["first_seen_at"] if p else run["started_at"],
            "previous_status": p["status"] if p else None,
            "agreed_value": p.get("agreed_value") if p else None,
            "drift": None, "task_id": p.get("task_id") if p and p["status"] == "drifted" else None,
        }
        agreed = d["agreed_value"]

        if not stmts:
            d["status"] = "unstated"
        elif len(by_value) == 1:
            value = next(iter(by_value))
            if agreed is not None and value != agreed:
                by = _who_changed(stmts, files)
                d["history"].append({"from": agreed, "to": value, "run": run["number"], "at": run["started_at"], "by": by})
                d["status"] = "holding"
                d["updated_in_run"] = True
            else:
                d["status"] = "holding"
            d["agreed_value"] = value
        else:
            if agreed is None or agreed not in by_value:
                # No prior agreement (or nobody states it any more): the value stated by the most
                # documents that did not change in this run is taken as the agreed one.
                def weight(item):
                    v, ss = item
                    return (sum(1 for s in ss if not files.get(s["file_id"], {}).get("changed")), len(ss))
                agreed = max(by_value.items(), key=weight)[0]
            d["agreed_value"] = agreed
            drifting = [s for s in stmts if s["value"] != agreed]
            d["status"] = "drifted"
            d["drift"] = {"value": drifting[0]["value"], "statements": drifting, "by": _who_changed(drifting, files)}

        prev_status = d["previous_status"]
        if p is None:
            d["change"] = "first" if run.get("first_run") else "new"
        elif d["status"] == "drifted" and prev_status != "drifted":
            d["change"] = "drifted"
        elif d.get("updated_in_run"):
            d["change"] = "updated"  # every document now states the new value
        elif prev_status == "drifted" and d["status"] == "holding":
            d["change"] = "resolved"
        else:
            d["change"] = "same"
        if d["status"] == "drifted" and prev_status == "drifted" and p.get("drift"):
            d["drift"]["by"] = p["drift"]["by"]  # keep the original attribution while it stays drifted
        out.append(d)
    return out


def _who_changed(stmts: list[dict], files: dict) -> dict | None:
    changed = [files[s["file_id"]] for s in stmts if files.get(s["file_id"], {}).get("changed")]
    f = changed[0] if changed else (files.get(stmts[0]["file_id"]) if stmts else None)
    if not f:
        return None
    return {"user": f.get("modified_by"), "file": {"id": f["id"], "name": f["name"], "version_id": f["version_id"],
                                                   "version_number": f["version_number"]}}
