"""Rules: parse a folder's keel-rules.md and resolve `uses: pack@version` lines from the pack catalog."""
from __future__ import annotations

import hashlib
import json
import re
from dataclasses import asdict, dataclass, field
from pathlib import Path

from . import config

HEADING = re.compile(r"^##\s+(?P<id>[A-Za-z0-9][\w.-]*)\s*(?:[·:\-—]\s*)?(?P<title>.*)$")
OFFLINE = re.compile(r"<!--\s*keel:offline\s+(?P<json>\{.*\})\s*-->")
USES = re.compile(r"^\s*uses:\s*(?P<id>[a-z0-9][a-z0-9-]*)@(?P<version>[\w.]+)\s*$", re.I)


@dataclass
class Rule:
    id: str
    title: str
    text: str
    source: str  # "folder" or "pack"
    pack: dict | None = None
    offline: dict | None = None
    error: str | None = None


@dataclass
class RuleSet:
    rules: list[Rule] = field(default_factory=list)
    packs: list[dict] = field(default_factory=list)
    uses: list[str] = field(default_factory=list)

    @property
    def hash(self) -> str:
        payload = json.dumps([asdict(r) for r in self.rules], sort_keys=True)
        return hashlib.sha256(payload.encode()).hexdigest()[:16]


def _front_matter(text: str) -> tuple[dict, str]:
    if not text.startswith("---"):
        return {}, text
    end = text.find("\n---", 3)
    if end < 0:
        return {}, text
    meta = {}
    for line in text[3:end].strip().splitlines():
        if ":" in line:
            k, v = line.split(":", 1)
            v = v.strip()
            meta[k.strip()] = {"true": True, "false": False}.get(v, v)
    return meta, text[end + 4:]


def parse_rule_blocks(text: str, source: str, pack: dict | None = None, prefix: str = "") -> list[Rule]:
    rules: list[Rule] = []
    current: dict | None = None

    def flush():
        if not current:
            return
        body = "\n".join(current["lines"])
        offline = None
        m = OFFLINE.search(body)
        if m:
            try:
                offline = json.loads(m.group("json"))
            except ValueError:
                offline = {"kind": "invalid"}
            body = OFFLINE.sub("", body)
        body = "\n".join(l for l in body.strip().splitlines() if not USES.match(l)).strip()
        rules.append(Rule(id=prefix + current["id"], title=current["title"].strip() or current["id"], text=body,
                          source=source, pack=pack, offline=offline))

    for line in text.splitlines():
        h = HEADING.match(line)
        if h:
            flush()
            current = {"id": h.group("id"), "title": h.group("title"), "lines": []}
        elif current is not None:
            current["lines"].append(line)
    flush()
    return rules


def parse_uses(text: str) -> list[tuple[str, str]]:
    return [(m.group("id"), m.group("version")) for m in (USES.match(l) for l in text.splitlines()) if m]


def load_pack(pack_id: str, version: str, packs_dir: Path | None = None) -> tuple[dict, list[Rule]] | None:
    base = packs_dir or config.packs_dir()
    path = base / pack_id / f"{version}.md"
    if not path.exists():
        return None
    meta, body = _front_matter(path.read_text())
    info = {"id": pack_id, "version": version, "name": meta.get("name", pack_id), "publisher": meta.get("publisher", "")}
    return info, parse_rule_blocks(body, "pack", info, prefix=f"{pack_id}/")


def parse_rules_file(text: str, packs_dir: Path | None = None) -> RuleSet:
    rs = RuleSet()
    rs.rules.extend(parse_rule_blocks(text, "folder"))
    for pack_id, version in parse_uses(text):
        rs.uses.append(f"{pack_id}@{version}")
        loaded = load_pack(pack_id, version, packs_dir)
        if not loaded:
            rs.rules.append(Rule(id=f"{pack_id}@{version}", title=f"Rule pack {pack_id}@{version} not found", text="",
                                 source="pack", pack={"id": pack_id, "version": version, "name": pack_id, "publisher": ""},
                                 error="pack_not_found"))
            continue
        info, rules = loaded
        rs.packs.append(info)
        rs.rules.extend(rules)
    return rs


def set_uses(text: str, pack_id: str, version: str | None) -> str:
    """Return keel-rules.md with `uses: pack_id@version` added, replaced, or (version=None) removed."""
    lines = [l for l in text.splitlines() if not (USES.match(l) and USES.match(l).group("id") == pack_id)]
    if version:
        # Keep all `uses:` lines together right after the intro, before the first rule heading.
        insert_at = next((i for i, l in enumerate(lines) if USES.match(l)), None)
        if insert_at is None:
            insert_at = next((i for i, l in enumerate(lines) if l.startswith("## ")), len(lines))
            lines[insert_at:insert_at] = [f"uses: {pack_id}@{version}", ""]
        else:
            last = max(i for i, l in enumerate(lines) if USES.match(l))
            lines.insert(last + 1, f"uses: {pack_id}@{version}")
    out = "\n".join(lines)
    out = re.sub(r"\n{3,}", "\n\n", out)
    return out.rstrip("\n") + "\n"


def catalog(packs_dir: Path | None = None) -> list[dict]:
    base = packs_dir or config.packs_dir()
    out = []
    for d in sorted(p for p in base.iterdir() if p.is_dir()):
        versions = sorted((p for p in d.glob("*.md") if p.name != "README.md"), key=lambda p: p.stem, reverse=True)
        source = versions[0] if versions else d / "README.md"
        if not source.exists():
            continue
        meta, body = _front_matter(source.read_text())
        rules = parse_rule_blocks(body, "pack") if versions else []
        out.append({
            "id": d.name, "version": meta.get("version", source.stem), "versions": [p.stem for p in versions],
            "name": meta.get("name", d.name), "publisher": meta.get("publisher", ""), "summary": meta.get("summary", ""),
            "license": meta.get("license", ""), "verified": bool(meta.get("verified")), "private": bool(meta.get("private")),
            "license_required": bool(meta.get("license_required")), "tags": [t.strip() for t in str(meta.get("tags", "")).split(",") if t.strip()],
            "rules": [{"id": r.id, "title": r.title, "text": r.text} for r in rules],
        })
    out.sort(key=lambda p: (p["license_required"], not p["private"], p["name"]))
    return out
