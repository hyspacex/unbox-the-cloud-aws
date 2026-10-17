"""Minimal Box API client (the Box port).

Talks to https://api.box.com/2.0 in production and to Fake Box locally; only the base URLs and
token differ. Handles the documented behaviours callers must cope with: 202 + Retry-After on fresh
downloads, 302 to short-lived download URLs, and 429 rate limiting.
"""
from __future__ import annotations

import json
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from typing import Any

from . import config


class BoxApiError(Exception):
    def __init__(self, status: int, body: Any):
        self.status = status
        self.body = body
        code = body.get("code") if isinstance(body, dict) else ""
        message = body.get("message") if isinstance(body, dict) else body
        super().__init__(f"Box API {status} {code}: {message}")

    @property
    def code(self) -> str:
        return self.body.get("code", "") if isinstance(self.body, dict) else ""


class BoxClient:
    def __init__(self, api_base: str | None = None, upload_base: str | None = None, token: str | None = None,
                 as_user: str | None = None):
        self.api_base = (api_base or config.get("KEEL_BOX_API_BASE")).rstrip("/")
        self.upload_base = (upload_base or config.get("KEEL_BOX_UPLOAD_BASE")).rstrip("/")
        self.token = token or config.get("KEEL_BOX_TOKEN")
        self.as_user = as_user

    def acting_as(self, user_id: str | None) -> "BoxClient":
        return BoxClient(self.api_base, self.upload_base, self.token, user_id)

    # ---- transport ----
    def _request(self, method: str, url: str, data: bytes | None = None, headers: dict | None = None,
                 raw: bool = False, attempts: int = 6) -> Any:
        hdrs = {"authorization": f"Bearer {self.token}", "accept": "application/json"}
        if self.as_user:
            hdrs["as-user"] = self.as_user
        hdrs.update(headers or {})
        for attempt in range(attempts):
            req = urllib.request.Request(url, data=data, method=method, headers=hdrs)
            try:
                with urllib.request.urlopen(req, timeout=60) as res:
                    if res.status == 202:  # content not ready yet
                        time.sleep(float(res.headers.get("retry-after", "1")))
                        continue
                    body = res.read()
                    if raw:
                        return body
                    return json.loads(body) if body else None
            except urllib.error.HTTPError as e:
                payload = e.read()
                try:
                    parsed = json.loads(payload) if payload else {}
                except ValueError:
                    parsed = {"message": payload.decode(errors="replace")}
                if e.code == 429 and attempt < attempts - 1:
                    time.sleep(float(e.headers.get("retry-after", "1")))
                    continue
                raise BoxApiError(e.code, parsed) from None
        raise BoxApiError(503, {"code": "retry_exhausted", "message": f"{method} {url} not ready"})

    def get(self, path: str, params: dict | None = None) -> Any:
        qs = f"?{urllib.parse.urlencode(params)}" if params else ""
        return self._request("GET", f"{self.api_base}{path}{qs}")

    def post(self, path: str, body: dict) -> Any:
        return self._request("POST", f"{self.api_base}{path}", json.dumps(body).encode(), {"content-type": "application/json"})

    def put(self, path: str, body: Any, content_type: str = "application/json") -> Any:
        return self._request("PUT", f"{self.api_base}{path}", json.dumps(body).encode(), {"content-type": content_type})

    def delete(self, path: str) -> Any:
        return self._request("DELETE", f"{self.api_base}{path}")

    # ---- users / folders ----
    def me(self) -> dict:
        return self.get("/users/me")

    def users(self) -> list[dict]:
        return self.get("/users")["entries"]

    def folder(self, folder_id: str) -> dict:
        return self.get(f"/folders/{folder_id}")

    def folder_items(self, folder_id: str) -> list[dict]:
        fields = "type,id,name,sha1,size,file_version,modified_at,modified_by"
        out, offset = [], 0
        while True:
            page = self.get(f"/folders/{folder_id}/items", {"fields": fields, "limit": 1000, "offset": offset})
            out.extend(page["entries"])
            offset += len(page["entries"])
            if offset >= page["total_count"] or not page["entries"]:
                return out

    def create_folder(self, name: str, parent_id: str = "0") -> dict:
        return self.post("/folders", {"name": name, "parent": {"id": parent_id}})

    def collaborate(self, folder_id: str, user_id: str, role: str = "editor") -> dict:
        return self.post("/collaborations", {"item": {"type": "folder", "id": folder_id},
                                             "accessible_by": {"type": "user", "id": user_id}, "role": role})

    # ---- files ----
    def file(self, file_id: str) -> dict:
        return self.get(f"/files/{file_id}")

    def file_versions(self, file_id: str) -> list[dict]:
        return self.get(f"/files/{file_id}/versions")["entries"]

    def download(self, file_id: str, version_id: str | None = None) -> bytes:
        qs = f"?version={version_id}" if version_id else ""
        return self._request("GET", f"{self.api_base}/files/{file_id}/content{qs}", raw=True)

    def _multipart(self, url: str, attributes: dict, name: str, content: bytes) -> dict:
        boundary = uuid.uuid4().hex
        parts = [
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"attributes\"\r\n\r\n{json.dumps(attributes)}\r\n".encode(),
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{name}\"\r\nContent-Type: application/octet-stream\r\n\r\n".encode(),
            content, f"\r\n--{boundary}--\r\n".encode(),
        ]
        res = self._request("POST", url, b"".join(parts), {"content-type": f"multipart/form-data; boundary={boundary}"})
        return res["entries"][0]

    def upload(self, folder_id: str, name: str, content: bytes) -> dict:
        return self._multipart(f"{self.upload_base}/files/content", {"name": name, "parent": {"id": folder_id}}, name, content)

    def upload_version(self, file_id: str, name: str, content: bytes) -> dict:
        return self._multipart(f"{self.upload_base}/files/{file_id}/content", {"name": name}, name, content)

    # ---- metadata ----
    def ensure_template(self, scope: str, key: str, display_name: str, fields: list[dict]) -> None:
        try:
            self.get(f"/metadata_templates/{scope}/{key}/schema")
        except BoxApiError as e:
            if e.status != 404:
                raise
            self.post("/metadata_templates/schema", {"scope": scope, "templateKey": key, "displayName": display_name, "fields": fields})

    def set_folder_metadata(self, folder_id: str, scope: str, key: str, values: dict) -> dict:
        path = f"/folders/{folder_id}/metadata/{scope}/{key}"
        try:
            return self.post(path, values)
        except BoxApiError as e:
            if e.status != 409:
                raise
        ops = [{"op": "add", "path": f"/{k}", "value": v} for k, v in values.items()]
        return self.put(path, ops, "application/json-patch+json")

    # ---- tasks ----
    def create_task(self, file_id: str, message: str, due_at: str | None, action: str = "complete") -> dict:
        return self.post("/tasks", {"item": {"type": "file", "id": file_id}, "action": action, "message": message,
                                    "due_at": due_at, "completion_rule": "any_assignee"})

    def assign_task(self, task_id: str, user_id: str) -> dict:
        return self.post("/task_assignments", {"task": {"type": "task", "id": task_id}, "assign_to": {"id": user_id}})

    def update_task(self, task_id: str, message: str) -> dict:
        return self.put(f"/tasks/{task_id}", {"message": message})

    # ---- webhooks ----
    def create_webhook(self, folder_id: str, address: str, triggers: list[str]) -> dict:
        return self.post("/webhooks", {"target": {"type": "folder", "id": folder_id}, "address": address, "triggers": triggers})

    def webhooks(self) -> list[dict]:
        return self.get("/webhooks")["entries"]
