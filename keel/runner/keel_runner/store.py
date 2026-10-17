"""Local stand-in for a DynamoDB single table (the store port).

Items are addressed by (pk, sk) and read by key or by sort-key prefix only, never joined. Items over
400 KB are rejected, as DynamoDB would, so document text never lands here.
"""
from __future__ import annotations

import json
from typing import Any

from .db import connect

MAX_ITEM_BYTES = 400 * 1024

SCHEMA = """
CREATE TABLE IF NOT EXISTS items (
  pk TEXT NOT NULL, sk TEXT NOT NULL, data TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (pk, sk));
"""


class ConditionalCheckFailed(Exception):
    pass


class Store:
    def __init__(self):
        connect().executescript(SCHEMA)

    @staticmethod
    def _encode(pk: str, sk: str, item: dict) -> str:
        if len(pk.encode()) > 2048 or len(sk.encode()) > 1024:
            raise ValueError("Key too long for DynamoDB")
        data = json.dumps(item, separators=(",", ":"), sort_keys=True)
        if len(data.encode()) + len(pk) + len(sk) > MAX_ITEM_BYTES:
            raise ValueError(f"Item {pk}/{sk} exceeds DynamoDB's 400 KB limit")
        return data

    def put(self, pk: str, sk: str, item: dict, expected_version: int | None = None, must_not_exist: bool = False) -> int:
        data = self._encode(pk, sk, item)
        conn = connect()
        conn.execute("BEGIN IMMEDIATE")
        try:
            row = conn.execute("SELECT version FROM items WHERE pk = ? AND sk = ?", (pk, sk)).fetchone()
            if must_not_exist and row:
                raise ConditionalCheckFailed(f"{pk}/{sk} exists")
            if expected_version is not None and (row is None or row["version"] != expected_version):
                raise ConditionalCheckFailed(f"{pk}/{sk} version mismatch")
            version = (row["version"] + 1) if row else 1
            conn.execute("INSERT INTO items(pk, sk, data, version) VALUES(?,?,?,?) ON CONFLICT(pk, sk) DO UPDATE SET data = excluded.data, version = excluded.version",
                         (pk, sk, data, version))
            conn.execute("COMMIT")
            return version
        except Exception:
            conn.execute("ROLLBACK")
            raise

    def get(self, pk: str, sk: str) -> dict | None:
        row = connect().execute("SELECT data, version FROM items WHERE pk = ? AND sk = ?", (pk, sk)).fetchone()
        if not row:
            return None
        item = json.loads(row["data"])
        item["_version"] = row["version"]
        return item

    def query(self, pk: str, sk_prefix: str = "", descending: bool = False, limit: int | None = None) -> list[dict]:
        sql = f"SELECT data, version FROM items WHERE pk = ? AND sk >= ? AND sk < ? ORDER BY sk {'DESC' if descending else 'ASC'}"
        args: list[Any] = [pk, sk_prefix, sk_prefix + "\uffff"]
        if limit:
            sql += " LIMIT ?"
            args.append(limit)
        out = []
        for row in connect().execute(sql, args).fetchall():
            item = json.loads(row["data"])
            item["_version"] = row["version"]
            out.append(item)
        return out

    def transact_put(self, items: list[tuple[str, str, dict]]) -> None:
        if len(items) > 100:
            raise ValueError("DynamoDB transactions are limited to 100 items")
        keys = [(pk, sk) for pk, sk, _ in items]
        if len(set(keys)) != len(keys):
            raise ValueError("A transaction cannot touch the same item twice")
        encoded = [(pk, sk, self._encode(pk, sk, item)) for pk, sk, item in items]
        conn = connect()
        conn.execute("BEGIN IMMEDIATE")
        try:
            for pk, sk, data in encoded:
                conn.execute("INSERT INTO items(pk, sk, data, version) VALUES(?,?,?,1) ON CONFLICT(pk, sk) DO UPDATE SET data = excluded.data, version = items.version + 1",
                             (pk, sk, data))
            conn.execute("COMMIT")
        except Exception:
            conn.execute("ROLLBACK")
            raise


# Key helpers (single-table design)
def folder_pk(folder_id: str) -> str:
    return f"FOLDER#{folder_id}"


def run_sk(number: int) -> str:
    return f"RUN#{number:06d}"


def run_pk(run_id: str) -> str:
    return f"RUN#{run_id}"
