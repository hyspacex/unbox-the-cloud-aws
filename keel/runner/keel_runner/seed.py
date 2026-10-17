"""Reset the local stack and seed the Project Lantern demo folder.

    python -m keel_runner.seed            # Fake Box folder with the initial documents, not yet connected
    python -m keel_runner.seed --connect  # also connect it to Keel and wait for run #1
"""
from __future__ import annotations

import argparse
import json
import time
import urllib.request

from . import config
from .api import KeelApi
from .boxclient import BoxClient
from .db import connect
from .queue import SCHEMA as QUEUE_SCHEMA
from .store import SCHEMA as STORE_SCHEMA, Store

CONTENT = config.KEEL_ROOT / "content" / "lantern"
UPLOADERS = {
    "proposal.md": "Maya Chen", "architecture.md": "J. Park", "security-checklist.md": "Dana Okafor",
    "kickoff-transcript.txt": "Maya Chen", "keel-rules.md": "Maya Chen",
}
ORDER = ["proposal.md", "kickoff-transcript.txt", "architecture.md", "security-checklist.md", "keel-rules.md"]


def web_base() -> str:
    return config.get("KEEL_BOX_API_BASE").split("/fakebox/")[0]


def wait_for_web(timeout: float = 120) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            urllib.request.urlopen(f"{web_base()}/", timeout=5)
            return
        except Exception:
            time.sleep(1)
    raise SystemExit("web app is not reachable; start it first (./dev.sh)")


def reset_keel_store() -> None:
    conn = connect()
    conn.executescript(STORE_SCHEMA + QUEUE_SCHEMA)
    conn.execute("DELETE FROM items")
    conn.execute("DELETE FROM queue_messages")
    conn.execute("DELETE FROM queue_dedup")


def bootstrap() -> dict[str, dict]:
    req = urllib.request.Request(f"{web_base()}/fakebox/dev/bootstrap", method="POST",
                                 headers={"authorization": f"Bearer {config.get('KEEL_BOX_TOKEN')}"})
    with urllib.request.urlopen(req, timeout=30) as res:
        users = json.loads(res.read())["entries"]
    return {u["name"]: u for u in users}


def seed(connect_folder: bool) -> str:
    wait_for_web()
    reset_keel_store()
    users = bootstrap()
    box = BoxClient()
    maya = box.acting_as(users["Maya Chen"]["id"])
    folder = maya.create_folder("Project Lantern")
    for name, role in (("J. Park", "editor"), ("Dana Okafor", "editor"), ("Priya Natarajan", "viewer"), ("Keel", "editor")):
        maya.collaborate(folder["id"], users[name]["id"], role)
    for name in ORDER:
        box.acting_as(users[UPLOADERS[name]]["id"]).upload(folder["id"], name, (CONTENT / "1-initial" / name).read_bytes())
        time.sleep(0.05)
    print(f"Seeded Fake Box folder {folder['id']} (Project Lantern)")
    if connect_folder:
        address = f"http://127.0.0.1:{config.get('KEEL_RUNNER_PORT', '8787')}/webhook"
        KeelApi(box=box).connect_folder(folder["id"], users["Maya Chen"]["id"], address)
        store = Store()
        for _ in range(120):
            meta = store.get(f"FOLDER#{folder['id']}", "META")
            if meta and (meta.get("latest_run") or {}).get("status") in ("completed", "error"):
                print(f"Run #1: {meta['latest_run']['counts']}")
                break
            time.sleep(0.5)
    return folder["id"]


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--connect", action="store_true")
    seed(p.parse_args().connect)
