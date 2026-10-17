"""Local stand-in for the AWS side: one process that plays

- the webhook Lambda's Function URL           POST /webhook
- the application API (API Gateway + Lambda)   /api/...
- the SQS FIFO -> runner Lambda event source   worker thread
- EventBridge Scheduler reconciliation         reconciler thread

Run with: python -m keel_runner.local
"""
from __future__ import annotations

import json
import logging
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from . import config, runner, webhook
from .api import ApiError, KeelApi
from .boxclient import BoxApiError
from .queue import FifoQueue
from .store import Store

log = logging.getLogger("keel.local")


def worker_loop(stop: threading.Event) -> None:
    queue = FifoQueue(visibility_timeout=900)
    while not stop.is_set():
        try:
            messages = queue.receive(10)
        except Exception:
            log.exception("receive failed")
            time.sleep(1)
            continue
        if not messages:
            time.sleep(0.3)
            continue
        event = {"Records": [{
            "messageId": m.message_id, "receiptHandle": m.receipt_handle, "body": m.body, "eventSource": "aws:sqs",
            "attributes": {"MessageGroupId": m.group_id, "MessageDeduplicationId": m.dedup_id,
                           "ApproximateReceiveCount": str(m.receive_count)},
        } for m in messages]}
        result = runner.handler(event, None)
        failed = {f["itemIdentifier"] for f in result.get("batchItemFailures", [])}
        for m in messages:
            if m.message_id in failed and m.receive_count < 3:
                queue.release(m.receipt_handle, delay=2 ** m.receive_count)
            else:
                queue.delete(m.receipt_handle)  # success, or give up after 3 attempts (DLQ in production)


def reconciler_loop(stop: threading.Event, every: float) -> None:
    queue, store = FifoQueue(), Store()
    while not stop.wait(every):
        bucket = int(time.time() // every)
        for f in store.query("FOLDERS", "FOLDER#"):
            msg = {"type": "run", "folder_id": f["folder_id"], "reason": "reconcile", "event_id": f"reconcile-{bucket}", "actor": None, "file": None}
            queue.send(json.dumps(msg), group_id=f["folder_id"], dedup_id=f"reconcile-{f['folder_id']}-{bucket}")


class Handler(BaseHTTPRequestHandler):
    api: KeelApi
    server_version = "KeelLocal/1"

    def log_message(self, fmt, *args):
        log.debug(fmt, *args)

    def _send(self, status: int, payload) -> None:
        body = payload if isinstance(payload, (bytes, str)) else json.dumps(payload)
        body = body.encode() if isinstance(body, str) else body
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _body(self) -> bytes:
        return self.rfile.read(int(self.headers.get("content-length") or 0))

    def do_GET(self):
        if self.path == "/api/health":
            return self._send(200, {"ok": True, "judge": runner.get_judge().name})
        if self.path == "/api/packs":
            return self._send(200, {"packs": self.api.packs()})
        if self.path == "/api/box/folders":
            try:
                return self._send(200, {"folders": self.api.shared_folders()})
            except BoxApiError as e:
                return self._send(502, {"error": str(e)})
        self._send(404, {"error": "not found"})

    def do_POST(self):
        raw = self._body()
        if self.path == "/webhook":
            event = {"version": "2.0", "rawPath": "/webhook", "headers": {k.lower(): v for k, v in self.headers.items()},
                     "body": raw.decode(), "isBase64Encoded": False, "requestContext": {"http": {"method": "POST"}}}
            res = webhook.handler(event, None)
            return self._send(res["statusCode"], res["body"])
        try:
            body = json.loads(raw or b"{}")
            parts = self.path.strip("/").split("/")
            if parts == ["api", "folders"]:
                address = f"http://127.0.0.1:{config.get('KEEL_RUNNER_PORT', '8787')}/webhook"
                return self._send(201, self.api.connect_folder(body["folder_id"], body.get("actor_id"), address))
            if len(parts) == 4 and parts[:2] == ["api", "folders"] and parts[3] == "runs":
                return self._send(202, self.api.enqueue_run(parts[2], body.get("actor_id")))
            if len(parts) == 4 and parts[:2] == ["api", "folders"] and parts[3] == "packs":
                return self._send(200, self.api.set_pack(parts[2], body["pack_id"], body.get("version"), body["actor_id"]))
            self._send(404, {"error": "not found"})
        except ApiError as e:
            self._send(e.status, {"error": str(e)})
        except BoxApiError as e:
            self._send(502, {"error": str(e)})
        except Exception as e:
            log.exception("api error")
            self._send(500, {"error": f"{type(e).__name__}: {e}"})


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
    port = int(config.get("KEEL_RUNNER_PORT", "8787"))
    Handler.api = KeelApi()
    stop = threading.Event()
    threading.Thread(target=worker_loop, args=(stop,), daemon=True, name="worker").start()
    every = float(config.get("KEEL_RECONCILE_SECONDS", "30"))
    if every > 0:
        threading.Thread(target=reconciler_loop, args=(stop, every), daemon=True, name="reconciler").start()
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    log.info("Keel runner on http://127.0.0.1:%s (judge=%s)", port, config.get("KEEL_JUDGE", "offline"))
    try:
        server.serve_forever()
    finally:
        stop.set()


if __name__ == "__main__":
    main()
