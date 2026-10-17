"""Deterministic offline judge for UX iteration and tests.

It reads the `<!-- keel:offline {...} -->` hint under each rule and checks documents with regular
expressions. It exists so the product can be exercised without a model; the Bedrock judge reads the
natural-language rule text instead and ignores the hints.
"""
from __future__ import annotations

import json
import re
import time
from pathlib import Path

from .. import config
from ..rules import Rule
from . import Citation, Doc, Verdict

BULLET = re.compile(r"^\s*(?:[-*+]\s+|#+\s+|>\s+)")


def _quote_for(text: str, start: int, end: int) -> str:
    """The line containing text[start:end]; long lines are trimmed to the containing sentence."""
    line_start = text.rfind("\n", 0, start) + 1
    line_end = text.find("\n", end)
    line_end = len(text) if line_end < 0 else line_end
    line = text[line_start:line_end]
    if len(line) > 240:
        rel_s, rel_e = start - line_start, end - line_start
        # Sentence ends are ". " not preceded by a lone capital (initials such as "J. Park").
        bounds = [m.end() for m in re.finditer(r"(?<![A-Z])[.;] ", line)]
        s = max([b for b in bounds if b <= rel_s], default=0)
        e = min([b for b in bounds if b > rel_e], default=len(line))
        line = line[s:e]
    return BULLET.sub("", line).strip()


def _is_heading(text: str, pos: int) -> bool:
    return text[text.rfind("\n", 0, pos) + 1:].lstrip().startswith("#")


def _search(docs: list[Doc], patterns: list[str], files: list[str] | None):
    for d in docs:
        if files and d.name not in files:
            continue
        for p in patterns:
            # A heading names a topic; it is not evidence that the topic is addressed.
            m = next((m for m in re.finditer(p, d.text, re.I) if not _is_heading(d.text, m.start())), None)
            if m:
                return d, m
    return None


def load_hints(path: Path | None = None) -> dict:
    path = path or (config.KEEL_ROOT / "content" / "offline-hints.json")
    try:
        return {k.lower(): v for k, v in json.loads(path.read_text())["rules"].items()}
    except (OSError, ValueError, KeyError):
        return {}


def _join(labels: list[str], word: str = "and") -> str:
    if len(labels) <= 1:
        return "".join(labels)
    return ", ".join(labels[:-1]) + f" {word} " + labels[-1]


class OfflineJudge:
    name = "offline"
    model_id = "offline-regex-judge/1"

    def __init__(self, delay: float | None = None, hints: dict | None = None):
        self.delay = float(config.get("KEEL_OFFLINE_JUDGE_DELAY", "0")) if delay is None else delay
        self.hints = load_hints() if hints is None else hints

    def evaluate(self, rules: list[Rule], docs: list[Doc]) -> list[Verdict]:
        if self.delay:
            time.sleep(self.delay)
        out = []
        for r in rules:
            if r.error:
                continue
            # Inline <!-- keel:offline --> hints (used by packs) win over the sidecar file keyed by title.
            hint = r.offline or self.hints.get(r.title.lower()) or {}
            kind = hint.get("kind")
            if kind == "require_all":
                out.append(self._require_all(r, hint, docs))
            elif kind == "consistency":
                out.append(self._consistency(r, hint, docs))
            elif kind == "checklist_complete":
                out.append(self._checklist(r, hint, docs))
            # Rules without a usable hint get no verdict; the runner reports them as "couldn't evaluate".
        return out

    def _require_all(self, r: Rule, hint: dict, docs: list[Doc]) -> Verdict:
        found, missing, cites = [], [], []
        for clause in hint.get("clauses", []):
            hit = _search(docs, clause.get("any", []), hint.get("files"))
            if hit:
                d, m = hit
                found.append((clause["label"], d.name))
                q = _quote_for(d.text, m.start(), m.end())
                if not any(c.quote == q and c.file_id == d.file_id for c in cites):
                    cites.append(Citation(d.file_id, q))
            else:
                missing.append(clause["label"])
        scope = f" in {_join(hint['files'])}" if hint.get("files") else " in any document"
        if not missing:
            where = sorted({n for _, n in found})
            return Verdict(r.id, "pass", f"States {_join([l for l, _ in found])} ({_join(where)}).", cites)
        if found:
            reason = f"States {_join([l for l, _ in found])}, but no {_join(missing, 'or')}{scope}."
        else:
            reason = f"No {_join(missing, 'or')}{scope}."
        return Verdict(r.id, "fail", reason[0].upper() + reason[1:], cites, missing)

    def _consistency(self, r: Rule, hint: dict, docs: list[Doc]) -> Verdict:
        unit = hint.get("unit", "")
        values: dict[str, list[tuple[Doc, str]]] = {}
        seen = set()
        for d in docs:
            for p in hint.get("patterns", []):
                for m in re.finditer(p, d.text, re.I):
                    if _is_heading(d.text, m.start()):
                        continue
                    key = (d.file_id, m.start(1))
                    if key in seen:
                        continue
                    seen.add(key)
                    q = _quote_for(d.text, m.start(), m.end())
                    values.setdefault(m.group(1), []).append((d, q))
        label = hint.get("label", "value")
        if not values:
            return Verdict(r.id, "fail", f"No {label} is stated in any document.", [], [label])
        if len(values) == 1:
            (v, hits), = values.items()
            names = sorted({d.name for d, _ in hits})
            cites = [Citation(d.file_id, q) for d, q in hits][:4]
            return Verdict(r.id, "pass", f"{len(hits)} statements agree on {v} {unit} ({_join(names)}).".strip(), cites)
        ranked = sorted(values.items(), key=lambda kv: len(kv[1]))  # the outlier first
        parts = []
        cites = []
        for v, hits in ranked:
            names = sorted({d.name for d, _ in hits})
            parts.append(f"{_join(names)} {'says' if len(names) == 1 else 'say'} {v} {unit}".strip())
            seen_files = set()
            for d, q in hits:
                if d.file_id in seen_files:
                    continue
                seen_files.add(d.file_id)
                cites.append(Citation(d.file_id, q))
        return Verdict(r.id, "fail", f"The {label} conflicts: " + "; ".join(parts) + ".", cites, [f"one agreed {label}"])

    def _checklist(self, r: Rule, hint: dict, docs: list[Doc]) -> Verdict:
        doc = next((d for d in docs if d.name == hint.get("file")), None)
        if not doc:
            return Verdict(r.id, "fail", f"No {hint.get('file')} in the folder.", [], [hint.get("file", "checklist")])
        items = [(m, m.group(1).lower() == "x") for m in re.finditer(r"^\s*[-*]\s+\[( |x|X)\]\s+(.+)$", doc.text, re.M)]
        if not items:
            return Verdict(r.id, "fail", f"{doc.name} has no checklist items.", [], ["checklist items"])
        open_items = [m for m, checked in items if not checked or re.search(r"\bTBD\b|\bTODO\b|\?\?", m.group(2))]
        if open_items:
            cites = [Citation(doc.file_id, m.group(2).strip()) for m in open_items]
            n = len(open_items)
            return Verdict(r.id, "fail", f"{n} of {len(items)} checklist items {'is' if n == 1 else 'are'} still open in {doc.name}.",
                           cites, [m.group(2).split("—")[0].strip() for m in open_items])
        cites = [Citation(doc.file_id, m.group(2).strip()) for m, _ in items[-2:]]
        return Verdict(r.id, "pass", f"All {len(items)} checklist items are checked and answered in {doc.name}.", cites)
