"""Keel application API (API Gateway + Lambda in production): connect folders, start runs, install packs."""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone

from . import config, rules
from .boxclient import BoxApiError, BoxClient
from .queue import FifoQueue
from .runner import TEMPLATE_FIELDS
from .store import Store, folder_pk

TRIGGERS = ["FILE.UPLOADED", "FILE.TRASHED", "FILE.MOVED", "FILE.RENAMED", "FILE.RESTORED"]


class ApiError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


class KeelApi:
    def __init__(self, box: BoxClient | None = None, store: Store | None = None, queue: FifoQueue | None = None):
        self.box = box or BoxClient()
        self.store = store or Store()
        self.queue = queue or FifoQueue()

    def _actor(self, actor_id: str | None) -> dict | None:
        if not actor_id:
            return None
        u = next((u for u in self.box.users() if u["id"] == actor_id), None)
        return {"id": u["id"], "name": u["name"]} if u else None

    def shared_folders(self) -> list[dict]:
        """Folders the service account has been invited to (candidates to connect)."""
        return [{"id": i["id"], "name": i["name"]} for i in self.box.get("/folders/0/items")["entries"] if i["type"] == "folder"]

    def connect_folder(self, folder_id: str, actor_id: str | None, webhook_address: str) -> dict:
        try:
            folder = self.box.folder(folder_id)
        except BoxApiError as e:
            if e.status == 404:
                raise ApiError(404, "Keel cannot see this folder. Invite Keel's service account as an editor first.")
            raise
        existing = self.store.get(folder_pk(folder_id), "META")
        if existing:
            return existing
        self.box.ensure_template(config.METADATA_SCOPE, config.METADATA_TEMPLATE, "Keel checks", TEMPLATE_FIELDS)
        try:
            hook = self.box.create_webhook(folder_id, webhook_address, TRIGGERS)
        except BoxApiError as e:
            if e.status != 409:
                raise
            hook = next(h for h in self.box.webhooks() if h["target"]["id"] == folder_id)
        meta = {"folder_id": folder_id, "name": folder["name"], "owner": {"id": folder["owned_by"]["id"], "name": folder["owned_by"]["name"]},
                "webhook_id": hook["id"], "connected_at": _now(), "connected_by": self._actor(actor_id), "run_count": 0}
        self.store.put(folder_pk(folder_id), "META", meta)
        self.store.put("FOLDERS", f"FOLDER#{folder_id}", {"folder_id": folder_id, "name": folder["name"]})
        self.store.put(f"WEBHOOK#{hook['id']}", "META", {"folder_id": folder_id})
        self.enqueue_run(folder_id, actor_id, reason="connected")
        return self.store.get(folder_pk(folder_id), "META")

    def enqueue_run(self, folder_id: str, actor_id: str | None, reason: str = "manual") -> dict:
        if not self.store.get(folder_pk(folder_id), "META"):
            raise ApiError(404, "Folder is not connected to Keel")
        event_id = str(uuid.uuid4())
        msg = {"type": "run", "folder_id": folder_id, "reason": reason, "event_id": event_id, "actor": self._actor(actor_id),
               "file": None, "received_at": _now()}
        return self.queue.send(json.dumps(msg), group_id=folder_id, dedup_id=event_id)

    def packs(self) -> list[dict]:
        return rules.catalog()

    def set_pack(self, folder_id: str, pack_id: str, version: str | None, actor_id: str) -> dict:
        if version and not rules.load_pack(pack_id, version):
            raise ApiError(400, f"Unknown pack {pack_id}@{version}")
        items = self.box.folder_items(folder_id)
        rf = next((i for i in items if i["name"] == config.RULES_FILE_NAME), None)
        current = self.box.download(rf["id"]).decode() if rf else "# Keel rules\n"
        updated = rules.set_uses(current, pack_id, version)
        if updated == current:
            return {"changed": False}
        # The change is written as the person who asked for it, so Box history and Keel's run
        # history show who changed the rules.
        as_actor = self.box.acting_as(actor_id)
        if rf:
            out = as_actor.upload_version(rf["id"], config.RULES_FILE_NAME, updated.encode())
        else:
            out = as_actor.upload(folder_id, config.RULES_FILE_NAME, updated.encode())
        return {"changed": True, "file_id": out["id"], "version_id": out["file_version"]["id"]}
