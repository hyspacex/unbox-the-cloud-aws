import sqlite3
import threading

from . import config

_local = threading.local()


def connect() -> sqlite3.Connection:
    """One SQLite connection per thread to keel.db (WAL, shared with the web app as a reader)."""
    conn = getattr(_local, "conn", None)
    if conn is None:
        conn = sqlite3.connect(config.data_dir() / "keel.db", timeout=10, isolation_level=None)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA busy_timeout=10000")
        _local.conn = conn
    return conn
