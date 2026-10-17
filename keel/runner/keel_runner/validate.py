"""Citation validation: every quote a judge returns must exist verbatim (after light normalisation)
in the exact file version that was checked. Unverifiable citations make the rule "couldn't evaluate"."""
from __future__ import annotations

import re
import unicodedata

from .judges import Doc, Verdict

_TRANSLATE = str.maketrans({"\u2018": "'", "\u2019": "'", "\u201c": '"', "\u201d": '"', "\u2013": "-", "\u2014": "-",
                            "\u2212": "-", "\u00a0": " "})
TIMESTAMP = re.compile(r"^\[(\d{1,2}:\d{2}:\d{2})\]")

NORMALIZATION_NOTE = "Quotes are matched after Unicode NFKC, straight quotes and hyphens, collapsed whitespace and case folding."


def normalize(s: str) -> str:
    s = unicodedata.normalize("NFKC", s).translate(_TRANSLATE)
    s = re.sub(r"[*_`]", "", s)
    return re.sub(r"\s+", " ", s).strip().casefold()


def locate(quote: str, text: str) -> dict | None:
    q = normalize(quote).rstrip(".")
    if len(q) < 8:
        return None
    lines = text.splitlines()
    section = None
    for i, line in enumerate(lines, start=1):
        if line.lstrip().startswith("#"):
            section = line.lstrip("# ").strip()
        if q in normalize(line):
            ts = TIMESTAMP.match(line.strip())
            return {"line": i, "section": section, "timestamp": ts.group(1) if ts else None}
    if q in normalize(text):
        return {"line": None, "section": None, "timestamp": None}
    return None


def validate(verdict: Verdict, docs_by_id: dict[str, Doc]) -> tuple[str, str, list[dict], list[str]]:
    """Return (status, reason, citations, problems). Status is pass/fail/unknown."""
    cites, problems = [], []
    for c in verdict.citations:
        doc = docs_by_id.get(c.file_id)
        if not doc:
            problems.append(f"cited a file that is not in this snapshot: \u201c{c.quote[:60]}\u201d")
            continue
        loc = locate(c.quote, doc.text)
        if not loc:
            problems.append(f"quote not found in {doc.name}: \u201c{c.quote[:80]}\u201d")
            continue
        cites.append({"file_id": doc.file_id, "file_name": doc.name, "version_id": doc.version_id, "quote": c.quote.strip(), **loc})
    if problems:
        return "unknown", "The judge cited text that is not in the checked files, so this result was not used.", cites, problems
    if verdict.status == "pass" and not cites:
        return "unknown", "The judge said this passes but gave no evidence, so this result was not used.", cites, ["pass without citations"]
    if verdict.status not in ("pass", "fail"):
        return "unknown", "The judge returned an invalid status.", cites, [f"status={verdict.status}"]
    return verdict.status, verdict.reason, cites, problems
