"""Offline decision extractor: finds decided values (targets, regions, owners, policies) in documents
using the topic hints in content/offline-decisions.json. A stand-in for the Bedrock extractor."""
from __future__ import annotations

import json
import re
from pathlib import Path

from .. import config
from . import Doc, Statement
from .offline import _is_heading, _quote_for


def load_topics(path: Path | None = None) -> list[dict]:
    path = path or (config.KEEL_ROOT / "content" / "offline-decisions.json")
    try:
        return json.loads(path.read_text())["topics"]
    except (OSError, ValueError, KeyError):
        return []


class OfflineExtractor:
    name = "offline"
    model_id = "offline-regex-extractor/1"

    def __init__(self, topics: list[dict] | None = None):
        self.topics = load_topics() if topics is None else topics

    def extract(self, docs: list[Doc], known: list[dict] | None = None) -> list[Statement]:
        out: list[Statement] = []
        for t in self.topics:
            for d in docs:
                seen: set[str] = set()
                for p in t["patterns"]:
                    for m in re.finditer(p, d.text, re.I):
                        if _is_heading(d.text, m.start()):
                            continue
                        value = self._value(t, m.groups())
                        if value in seen:
                            continue
                        seen.add(value)
                        out.append(Statement(t["topic"], t["label"], value, d.file_id, _quote_for(d.text, m.start(), m.end())))
        return out

    @staticmethod
    def _value(t: dict, groups: tuple) -> str:
        groups = tuple(g.strip() for g in groups)
        mapping = t.get("map")
        if mapping:
            key = groups[0].lower()
            if key in mapping:
                return mapping[key]
            if "*" in mapping:
                return mapping["*"]
        fmt = t.get("format", "{0}")
        return fmt.format(*groups)
