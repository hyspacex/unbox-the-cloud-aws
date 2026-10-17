"""Webhook handler (the Lambda behind a Function URL that Box calls).

Verifies Box's signature, then queues a run for the folder and returns 200 within Box's 30-second
window. Deduplicates on the event body `id` (BOX-DELIVERY-ID changes on every retry)."""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
from datetime import datetime, timezone

from . import config
from .queue import FifoQueue
from .store import Store

log = logging.getLogger("keel.webhook")

RUN_TRIGGERS = {"FILE.UPLOADED", "FILE.TRASHED", "FILE.DELETED", "FILE.MOVED", "FILE.RENAMED", "FILE.RESTORED"}
MAX_AGE_SECONDS = 600


def _parse_ts(value: str) -> datetime | None:
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return None


def verify_signature(body: bytes, headers: dict, primary_key: str, secondary_key: str, now: datetime | None = None) -> bool:
    h = {k.lower(): v for k, v in headers.items()}
    ts_raw = h.get("box-delivery-timestamp", "")
    ts = _parse_ts(ts_raw)
    now = now or datetime.now(timezone.utc)
    if ts is None or (now - ts).total_seconds() > MAX_AGE_SECONDS:
        return False
    if h.get("box-signature-algorithm", "HmacSHA256") != "HmacSHA256":
        return False

    def sign(key: str) -> str:
        return base64.b64encode(hmac.new(key.encode(), body + ts_raw.encode(), hashlib.sha256).digest()).decode()

    primary, secondary = h.get("box-signature-primary", ""), h.get("box-signature-secondary", "")
    return bool((primary_key and primary and hmac.compare_digest(sign(primary_key), primary)) or
                (secondary_key and secondary and hmac.compare_digest(sign(secondary_key), secondary)))


_queue: FifoQueue | None = None
_store: Store | None = None


def handler(event: dict, context=None) -> dict:
    global _queue, _store
    _queue, _store = _queue or FifoQueue(), _store or Store()
    body = event.get("body") or ""
    raw = base64.b64decode(body) if event.get("isBase64Encoded") else body.encode()
    if not verify_signature(raw, event.get("headers") or {}, config.get("KEEL_WEBHOOK_PRIMARY_KEY"), config.get("KEEL_WEBHOOK_SECONDARY_KEY")):
        log.warning("rejected webhook with invalid or stale signature")
        return {"statusCode": 403, "body": json.dumps({"error": "invalid signature"})}
    payload = json.loads(raw)
    trigger = payload.get("trigger")
    hook = _store.get("WEBHOOK#" + str((payload.get("webhook") or {}).get("id")), "META")
    if trigger not in RUN_TRIGGERS or not hook:
        return {"statusCode": 200, "body": json.dumps({"ignored": True})}
    source = payload.get("source") or {}
    message = {
        "type": "run", "folder_id": hook["folder_id"], "reason": "webhook", "event_id": payload.get("id"), "event": trigger,
        "actor": {"id": (payload.get("created_by") or {}).get("id"), "name": (payload.get("created_by") or {}).get("name")},
        "file": {"id": source.get("id"), "name": source.get("name"), "version_id": (source.get("file_version") or {}).get("id")},
        "received_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    result = _queue.send(json.dumps(message), group_id=hook["folder_id"], dedup_id=str(payload.get("id")))
    return {"statusCode": 200, "body": json.dumps({"queued": not result["Duplicate"]})}
