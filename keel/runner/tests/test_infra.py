import base64
import hashlib
import hmac
import json
import time
import unittest
from datetime import datetime, timedelta, timezone

import tests  # noqa: F401
from keel_runner.queue import FifoQueue
from keel_runner.store import ConditionalCheckFailed, Store
from keel_runner.webhook import verify_signature


def sign(body: bytes, ts: str, key: str) -> str:
    return base64.b64encode(hmac.new(key.encode(), body + ts.encode(), hashlib.sha256).digest()).decode()


class SignatureTest(unittest.TestCase):
    body = json.dumps({"type": "webhook_event", "id": "e1"}).encode()

    def headers(self, ts: str, primary="k1", secondary="k2"):
        return {"BOX-DELIVERY-TIMESTAMP": ts, "BOX-SIGNATURE-PRIMARY": sign(self.body, ts, primary),
                "BOX-SIGNATURE-SECONDARY": sign(self.body, ts, secondary), "BOX-SIGNATURE-ALGORITHM": "HmacSHA256"}

    def test_valid_primary_or_secondary(self):
        ts = datetime.now(timezone.utc).isoformat()
        self.assertTrue(verify_signature(self.body, self.headers(ts), "k1", "k2"))
        self.assertTrue(verify_signature(self.body, self.headers(ts, primary="old"), "rotated", "k2"))

    def test_tampered_body_rejected(self):
        ts = datetime.now(timezone.utc).isoformat()
        self.assertFalse(verify_signature(self.body + b" ", self.headers(ts), "k1", "k2"))

    def test_stale_timestamp_rejected(self):
        ts = (datetime.now(timezone.utc) - timedelta(minutes=11)).isoformat()
        self.assertFalse(verify_signature(self.body, self.headers(ts), "k1", "k2"))


class QueueTest(unittest.TestCase):
    def test_fifo_group_blocking_and_dedup(self):
        q = FifoQueue(visibility_timeout=60)
        q.send("a1", "A", "a1")
        q.send("a2", "A", "a2")
        q.send("b1", "B", "b1")
        self.assertTrue(q.send("a1-again", "A", "a1")["Duplicate"])
        first = q.receive(10)
        self.assertEqual(sorted(m.body for m in first), ["a1", "b1"])
        self.assertEqual(q.receive(10), [])  # A blocked while a1 is in flight; B empty
        for m in first:
            q.delete(m.receipt_handle)
        self.assertEqual([m.body for m in q.receive(10)], ["a2"])
        self.assertTrue(q.send("a1-later", "A", "a1")["Duplicate"])  # dedup survives delete

    def test_visibility_timeout_redelivers(self):
        q = FifoQueue(visibility_timeout=0.05)
        q.send("c1", "C", "c1")
        self.assertEqual(q.receive(1)[0].receive_count, 1)
        time.sleep(0.08)
        self.assertEqual(q.receive(1)[0].receive_count, 2)

    def test_limits(self):
        q = FifoQueue()
        with self.assertRaises(ValueError):
            q.send("x" * (1_048_576 + 1), "D", "big")
        with self.assertRaises(ValueError):
            q.send("x", "", "nogroup")


class StoreTest(unittest.TestCase):
    def test_item_size_and_conditions(self):
        s = Store()
        with self.assertRaises(ValueError):
            s.put("P", "big", {"x": "y" * 410_000})
        v = s.put("P", "S", {"a": 1})
        s.put("P", "S", {"a": 2}, expected_version=v)
        with self.assertRaises(ConditionalCheckFailed):
            s.put("P", "S", {"a": 3}, expected_version=v)
        with self.assertRaises(ConditionalCheckFailed):
            s.put("P", "S", {"a": 3}, must_not_exist=True)
        self.assertEqual(s.get("P", "S")["a"], 2)

    def test_transaction_limits(self):
        s = Store()
        with self.assertRaises(ValueError):
            s.transact_put([("T", str(i), {}) for i in range(101)])
        with self.assertRaises(ValueError):
            s.transact_put([("T", "same", {}), ("T", "same", {})])


if __name__ == "__main__":
    unittest.main()
