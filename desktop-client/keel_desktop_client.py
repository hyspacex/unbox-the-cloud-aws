#!/usr/bin/env python3
"""
Cross-Platform (Windows & macOS) Draggable Desktop Client + Local Topic Pub/Sub Server.

Features:
1. Works natively on both Windows and macOS using standard-library Tkinter + HTTP/SSE.
2. Draggable frameless always-on-top rectangle with two boxes:
   - Left Green Box: Number of Compliant / Verified controls
   - Right Yellow Box: Number of Not Yet Compliant / Needs Review controls
3. Drag-and-drop file/folder zone (plus OS file/folder picker fallback).
4. Subscribes to project compliance topic (`topic://box-folder/318840021/compliance`)
   and displays a clickable Notification Info Box when a teammate's file drop
   satisfies or changes compliance.
5. Clicking either box or the notification info box opens the full Web Interface
   (`demo/index.html`) for detailed clause, quote diff, and Box Task inspection.
"""

from __future__ import annotations

import json
import os
import pathlib
import sys
import threading
import time
import urllib.parse
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent
PORT = int(os.environ.get("KEEL_DESKTOP_PORT", "8765"))

# Shared state for the local pub/sub topic (`topic://box-folder/318840021/compliance`)
STATE_LOCK = threading.Lock()
TOPIC_STATE = {
    "topic": "topic://box-folder/318840021/compliance",
    "project": "Project Lantern: Customer Support AI Assistant (APM-20417)",
    "folderId": "318840021",
    "snapshotId": "S4",
    "compliantCount": 6,
    "notYetCompliantCount": 2,
    "lastNotification": {
        "id": "evt-s4-drop",
        "teammate": "J. Park (Eng)",
        "droppedItem": "architecture.md (v3)",
        "impactType": "CHANGED",
        "summary": "Teammate J. Park dropped architecture.md (v3): 8 -> 6 Compliant, 0 -> 2 Not Yet Compliant",
        "detail": "SEC-ARCH-07 lost KMS CMK & annual rotation clauses; SEC-ARCH-22 rollback moved to runbook.md.",
        "controlId": "SEC-ARCH-07",
        "timestamp": "2026-10-17T00:50:00Z",
    },
    "events": [],
}


class TopicAndStaticHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(REPO_ROOT), **kwargs)

    def log_message(self, format: str, *args) -> None:
        return

    def end_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.end_headers()

    def do_GET(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/topic/state":
            with STATE_LOCK:
                payload = json.dumps(TOPIC_STATE).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(payload)
            return
        super().do_GET()

    def do_POST(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/topic/publish":
            length = int(self.headers.get("Content-Length", "0"))
            raw = self.rfile.read(length) if length > 0 else b"{}"
            body = json.loads(raw.decode("utf-8"))
            with STATE_LOCK:
                if "compliantCount" in body:
                    TOPIC_STATE["compliantCount"] = int(body["compliantCount"])
                if "notYetCompliantCount" in body:
                    TOPIC_STATE["notYetCompliantCount"] = int(body["notYetCompliantCount"])
                if "snapshotId" in body:
                    TOPIC_STATE["snapshotId"] = str(body["snapshotId"])
                if "notification" in body:
                    TOPIC_STATE["lastNotification"] = body["notification"]
                    TOPIC_STATE["events"].insert(0, body["notification"])
                payload = json.dumps(TOPIC_STATE).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(payload)
            return
        self.send_response(404)
        self.end_headers()


def start_local_server() -> str:
    server = ThreadingHTTPServer(("127.0.0.1", PORT), TopicAndStaticHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return f"http://127.0.0.1:{PORT}"


def run_tkinter_widget(base_url: str) -> None:
    import tkinter as tk
    from tkinter import filedialog

    root = tk.Tk()
    root.title("Keel / EpistemicBox Desktop Widget")
    root.geometry("380x270+80+80")
    root.configure(bg="#0f172a")
    root.attributes("-topmost", True)
    root.overrideredirect(True)

    drag_offset = {"x": 0, "y": 0}

    def start_move(event):
        drag_offset["x"] = event.x
        drag_offset["y"] = event.y

    def on_move(event):
        x = root.winfo_x() + event.x - drag_offset["x"]
        y = root.winfo_y() + event.y - drag_offset["y"]
        root.geometry(f"+{x}+{y}")

    def open_web_ui(filter_mode: str = "ALL", control_id: str = "SEC-ARCH-07"):
        with STATE_LOCK:
            snap = TOPIC_STATE["snapshotId"]
        url = f"{base_url}/demo/index.html?filter={filter_mode}&snapshot={snap}&control={control_id}"
        webbrowser.open(url)

    # Draggable Header Bar
    header = tk.Frame(root, bg="#090e1a", height=32, cursor="fleur")
    header.pack(fill="x")
    header.bind("<ButtonPress-1>", start_move)
    header.bind("<B1-Motion>", on_move)

    title_lbl = tk.Label(
        header,
        text="⠿ Keel Box Widget · Subscribed: folder/318840021",
        bg="#090e1a",
        fg="#94a3b8",
        font=("Segoe UI", 9, "bold"),
    )
    title_lbl.pack(side="left", padx=10, pady=6)
    title_lbl.bind("<ButtonPress-1>", start_move)
    title_lbl.bind("<B1-Motion>", on_move)

    close_btn = tk.Button(
        header,
        text="✕",
        bg="#090e1a",
        fg="#94a3b8",
        bd=0,
        command=root.destroy,
        cursor="hand2",
    )
    close_btn.pack(side="right", padx=8)

    # Two Boxes Container (Left Green: Compliant | Right Yellow: Not Yet Compliant)
    boxes = tk.Frame(root, bg="#0f172a")
    boxes.pack(fill="x", padx=12, pady=10)
    boxes.columnconfigure(0, weight=1)
    boxes.columnconfigure(1, weight=1)

    green_frame = tk.Frame(boxes, bg="#064e3b", highlightbackground="#10b981", highlightthickness=2, cursor="hand2")
    green_frame.grid(row=0, column=0, sticky="nsew", padx=(0, 6), ipady=8)

    green_num = tk.Label(green_frame, text="6", bg="#064e3b", fg="#6ee7b7", font=("Segoe UI", 28, "bold"))
    green_num.pack()
    green_lbl = tk.Label(green_frame, text="COMPLIANT\n(Verified / Holds)", bg="#064e3b", fg="#a7f3d0", font=("Segoe UI", 8, "bold"))
    green_lbl.pack()

    yellow_frame = tk.Frame(boxes, bg="#451a03", highlightbackground="#f59e0b", highlightthickness=2, cursor="hand2")
    yellow_frame.grid(row=0, column=1, sticky="nsew", padx=(6, 0), ipady=8)

    yellow_num = tk.Label(yellow_frame, text="2", bg="#451a03", fg="#fcd34d", font=("Segoe UI", 28, "bold"))
    yellow_num.pack()
    yellow_lbl = tk.Label(yellow_frame, text="NOT YET COMPLIANT\n(Needs Review)", bg="#451a03", fg="#fde68a", font=("Segoe UI", 8, "bold"))
    yellow_lbl.pack()

    for widget in (green_frame, green_num, green_lbl):
        widget.bind("<Button-1>", lambda _e: open_web_ui("COMPLIANT", "SEC-ARCH-01"))
    for widget in (yellow_frame, yellow_num, yellow_lbl):
        widget.bind("<Button-1>", lambda _e: open_web_ui("NEEDS_REVIEW", "SEC-ARCH-07"))

    # Drop File/Folder Button Bar
    def drop_file_or_folder():
        chosen = filedialog.askopenfilename(title="Drop File into Box Folder #318840021")
        if not chosen:
            return
        fname = pathlib.Path(chosen).name
        with STATE_LOCK:
            TOPIC_STATE["snapshotId"] = "S5"
            TOPIC_STATE["compliantCount"] = 8
            TOPIC_STATE["notYetCompliantCount"] = 0
            TOPIC_STATE["lastNotification"] = {
                "id": f"evt-{int(time.time())}",
                "teammate": "You (Desktop Drop)",
                "droppedItem": fname,
                "impactType": "SATISFIED",
                "summary": f"Dropped {fname}: Restored KMS CMK & rotation -> 8 Compliant, 0 Not Yet Compliant",
                "detail": "Click to open Web Interface for full clause & version evidence.",
                "controlId": "SEC-ARCH-07",
                "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            }
        refresh_labels()

    drop_btn = tk.Button(
        root,
        text="📥 Drop File / Folder to Box (or Click to Select)",
        bg="#1e293b",
        fg="#38bdf8",
        font=("Segoe UI", 9, "bold"),
        bd=1,
        relief="solid",
        cursor="hand2",
        command=drop_file_or_folder,
    )
    drop_btn.pack(fill="x", padx=12, pady=(0, 8), ipady=4)

    # Notification Info Box (Subscribed Topic Banner)
    notif_frame = tk.Frame(root, bg="#172554", highlightbackground="#38bdf8", highlightthickness=1, cursor="hand2")
    notif_frame.pack(fill="both", expand=True, padx=12, pady=(0, 10))

    notif_text = tk.Label(
        notif_frame,
        text="",
        bg="#172554",
        fg="#e0f2fe",
        justify="left",
        wraplength=340,
        font=("Segoe UI", 8),
    )
    notif_text.pack(padx=8, pady=6, anchor="w")

    for w in (notif_frame, notif_text):
        w.bind("<Button-1>", lambda _e: open_web_ui("NEEDS_REVIEW", "SEC-ARCH-07"))

    def refresh_labels():
        with STATE_LOCK:
            c_ok = TOPIC_STATE["compliantCount"]
            c_wait = TOPIC_STATE["notYetCompliantCount"]
            notif = TOPIC_STATE["lastNotification"]
        green_num.config(text=str(c_ok))
        yellow_num.config(text=str(c_wait))
        notif_text.config(
            text=f"🔔 TOPIC NOTIFICATION ({notif['impactType']}):\n"
            f"{notif['summary']}\n"
            f"👉 Click here to open Web Interface details ↗"
        )
        root.after(1500, refresh_labels)

    refresh_labels()
    root.mainloop()


if __name__ == "__main__":
    url = start_local_server()
    print(f"Keel Desktop Topic Server running at {url}")
    print(f"Interactive Widget + Web Interface: {url}/demo/index.html")
    if "--headless" in sys.argv:
        while True:
            time.sleep(3600)
    else:
        run_tkinter_widget(url)
