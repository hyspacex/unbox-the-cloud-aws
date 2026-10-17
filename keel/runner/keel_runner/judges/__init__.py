"""Judge port: given rules and the folder's documents, return a pass/fail verdict per rule with citations.

Judges never write to Box or to the store; the runner validates every citation before use.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from .. import config


@dataclass
class Doc:
    file_id: str
    name: str
    version_id: str
    text: str


@dataclass
class Citation:
    file_id: str
    quote: str


@dataclass
class Verdict:
    rule_id: str
    status: str  # "pass" | "fail"
    reason: str
    citations: list[Citation] = field(default_factory=list)
    missing: list[str] = field(default_factory=list)


def get_judge():
    kind = config.get("KEEL_JUDGE", "offline").lower()
    if kind == "bedrock":
        from .bedrock import BedrockJudge
        return BedrockJudge()
    from .offline import OfflineJudge
    return OfflineJudge()
