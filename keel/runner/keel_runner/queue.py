"""Local stand-in for an SQS FIFO queue (the queue port).

Keeps the FIFO guarantees the runner relies on and nothing more:
- MessageGroupId is required; order is kept per group, and no message from a group is handed out
  while another message from that group is in flight (one run per folder at a time).
- MessageDeduplicationId is remembered for 5 minutes, even after the message is deleted.
- Bodies are limited to 1 MiB; receives return at most 10 messages, possibly from several groups.
- Delivery is at least once: a message whose visibility timeout lapses is handed out again.
"""
from __future__ import annotations

import time
import uuid
from dataclasses import dataclass

from .db import connect

MAX_BODY_BYTES = 1_048_576
DEDUP_WINDOW_SECONDS = 300

SCHEMA = """
CREATE TABLE IF NOT EXISTS queue_messages (
  seq INTEGER PRIMARY KEY AUTOINCREMENT, message_id TEXT NOT NULL UNIQUE, group_id TEXT NOT NULL,
  dedup_id TEXT NOT NULL, body TEXT NOT NULL, sent_at REAL NOT NULL, visible_at REAL NOT NULL,
  receipt_handle TEXT, receive_count INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS queue_dedup (dedup_id TEXT PRIMARY KEY, message_id TEXT NOT NULL, sent_at REAL NOT NULL);
"""


@dataclass
class Message:
    message_id: str
    receipt_handle: str
    body: str
    group_id: str
    dedup_id: str
    receive_count: int


class FifoQueue:
    def __init__(self, visibility_timeout: float = 900.0):
        self.visibility_timeout = visibility_timeout
        connect().executescript(SCHEMA)

    def send(self, body: str, group_id: str, dedup_id: str) -> dict:
        if not group_id or len(group_id) > 128:
            raise ValueError("MessageGroupId is required (max 128 characters)")
        if len(body.encode()) > MAX_BODY_BYTES:
            raise ValueError("Message body exceeds 1 MiB")
        conn = connect()
        now = time.time()
        conn.execute("BEGIN IMMEDIATE")
        try:
            conn.execute("DELETE FROM queue_dedup WHERE sent_at < ?", (now - DEDUP_WINDOW_SECONDS,))
            dup = conn.execute("SELECT message_id FROM queue_dedup WHERE dedup_id = ?", (dedup_id,)).fetchone()
            if dup:
                conn.execute("COMMIT")
                return {"MessageId": dup["message_id"], "Duplicate": True}
            message_id = str(uuid.uuid4())
            conn.execute("INSERT INTO queue_messages(message_id, group_id, dedup_id, body, sent_at, visible_at) VALUES(?,?,?,?,?,?)",
                         (message_id, group_id, dedup_id, body, now, now))
            conn.execute("INSERT INTO queue_dedup(dedup_id, message_id, sent_at) VALUES(?,?,?)", (dedup_id, message_id, now))
            conn.execute("COMMIT")
            return {"MessageId": message_id, "Duplicate": False}
        except Exception:
            conn.execute("ROLLBACK")
            raise

    def receive(self, max_messages: int = 10) -> list[Message]:
        max_messages = min(max_messages, 10)
        conn = connect()
        now = time.time()
        conn.execute("BEGIN IMMEDIATE")
        try:
            rows = conn.execute("SELECT * FROM queue_messages ORDER BY seq").fetchall()
            blocked: set[str] = set()
            out: list[Message] = []
            for r in rows:
                if r["group_id"] in blocked:
                    continue
                if r["visible_at"] > now:  # in flight: block the rest of its group
                    blocked.add(r["group_id"])
                    continue
                handle = str(uuid.uuid4())
                conn.execute("UPDATE queue_messages SET visible_at = ?, receipt_handle = ?, receive_count = receive_count + 1 WHERE seq = ?",
                             (now + self.visibility_timeout, handle, r["seq"]))
                out.append(Message(r["message_id"], handle, r["body"], r["group_id"], r["dedup_id"], r["receive_count"] + 1))
                blocked.add(r["group_id"])  # one message per group per batch keeps per-group order simple
                if len(out) >= max_messages:
                    break
            conn.execute("COMMIT")
            return out
        except Exception:
            conn.execute("ROLLBACK")
            raise

    def delete(self, receipt_handle: str) -> None:
        connect().execute("DELETE FROM queue_messages WHERE receipt_handle = ?", (receipt_handle,))

    def release(self, receipt_handle: str, delay: float = 0) -> None:
        connect().execute("UPDATE queue_messages SET visible_at = ? WHERE receipt_handle = ?", (time.time() + delay, receipt_handle))

    def depth(self, group_id: str | None = None) -> int:
        if group_id:
            return connect().execute("SELECT COUNT(*) c FROM queue_messages WHERE group_id = ?", (group_id,)).fetchone()["c"]
        return connect().execute("SELECT COUNT(*) c FROM queue_messages").fetchone()["c"]
