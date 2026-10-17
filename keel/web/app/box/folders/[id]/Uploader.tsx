"use client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

export function Uploader({ folderId }: { folderId: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  async function send(files: FileList | File[]) {
    const list = Array.from(files);
    if (!list.length) return;
    setBusy(true);
    const form = new FormData();
    form.set("folder_id", folderId);
    list.forEach((f) => form.append("file", f));
    const res = await fetch("/box/api/upload", { method: "POST", body: form });
    setBusy(false);
    const json = await res.json();
    setToast(res.ok ? `Uploaded ${list.map((f) => f.name).join(", ")}` : json.message);
    setTimeout(() => setToast(null), 2600);
    if (input.current) input.current.value = "";
    router.refresh();
  }

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="muted" style={{ fontSize: 13 }}>Uploading a file with an existing name adds a new version.</span>
        <button className="btn" onClick={() => input.current?.click()} disabled={busy} data-testid="box-upload">{busy ? "Uploading…" : "Upload"}</button>
        <input ref={input} type="file" multiple hidden data-testid="box-upload-input" onChange={(e) => e.target.files && send(e.target.files)} />
      </div>
      <div
        className={`dropzone${over ? " over" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); send(e.dataTransfer.files); }}
      >Drop files here to upload</div>
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
