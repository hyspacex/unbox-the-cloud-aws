"""In-memory Box stand-in for unit tests of the runner (no HTTP)."""
from __future__ import annotations

import hashlib
import itertools

from keel_runner.boxclient import BoxApiError

_ids = itertools.count(1000)


class MemoryBox:
    def __init__(self):
        self.users = {"u-maya": "Maya Chen", "u-park": "J. Park", "u-dana": "Dana Okafor"}
        self.files: dict[str, dict] = {}
        self.versions: dict[str, list[dict]] = {}
        self.tasks: dict[str, dict] = {}
        self.metadata: dict[str, dict] = {}
        self.fail_metadata = False

    def put_file(self, name: str, text: str, user: str = "u-maya") -> str:
        fid = next((f for f, x in self.files.items() if x["name"] == name), None)
        vid = str(next(_ids))
        v = {"id": vid, "sha1": hashlib.sha1(text.encode()).hexdigest(), "text": text, "user": user}
        if fid is None:
            fid = str(next(_ids))
            self.files[fid] = {"id": fid, "name": name}
            self.versions[fid] = []
        self.versions[fid].append(v)
        return fid

    def trash(self, name: str) -> None:
        fid = next(f for f, x in self.files.items() if x["name"] == name)
        del self.files[fid]

    # --- BoxClient surface used by Runner ---
    def folder_items(self, folder_id):
        out = []
        for fid, f in self.files.items():
            v = self.versions[fid][-1]
            out.append({"type": "file", "id": fid, "name": f["name"], "sha1": v["sha1"], "size": len(v["text"]),
                        "file_version": {"type": "file_version", "id": v["id"], "sha1": v["sha1"]},
                        "modified_at": "2026-10-17T00:00:00Z", "modified_by": {"id": v["user"], "name": self.users[v["user"]]}})
        return out

    def file_versions(self, file_id):
        return self.versions[file_id][:-1]

    def download(self, file_id, version_id=None):
        for v in self.versions.get(file_id, []):
            if version_id is None or v["id"] == version_id:
                found = v
        return found["text"].encode()

    def create_task(self, file_id, message, due_at, action="complete"):
        tid = str(next(_ids))
        self.tasks[tid] = {"id": tid, "file_id": file_id, "message": message, "assignee": None}
        return {"id": tid}

    def assign_task(self, task_id, user_id):
        self.tasks[task_id]["assignee"] = user_id
        return {"id": str(next(_ids)), "assigned_to": {"id": user_id, "name": self.users[user_id]}}

    def update_task(self, task_id, message):
        self.tasks[task_id]["message"] = message
        return self.tasks[task_id]

    def set_folder_metadata(self, folder_id, scope, key, values):
        if self.fail_metadata:
            raise BoxApiError(500, {"code": "internal_server_error", "message": "boom"})
        self.metadata.setdefault(folder_id, {}).update(values)
        return self.metadata[folder_id]
