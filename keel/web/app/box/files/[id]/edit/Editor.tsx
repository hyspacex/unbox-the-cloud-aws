"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveText } from "@/app/actions";

export function Editor({ fileId, folderId, initial }: { fileId: string; folderId: string; initial: string }) {
  const router = useRouter();
  const [text, setText] = useState(initial);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <textarea className="text" value={text} onChange={(e) => setText(e.target.value)} data-testid="box-editor" spellCheck={false} />
      <div className="row" style={{ marginTop: 14, justifyContent: "flex-end" }}>
        <button className="btn ghost" onClick={() => router.back()}>Cancel</button>
        <button className="btn" disabled={pending || text === initial} data-testid="box-save" onClick={() => start(async () => {
          const r = await saveText(fileId, text);
          if (!r.ok) setError(r.error); else router.push(`/box/folders/${folderId}`);
        })}>{pending ? "Saving…" : "Save new version"}</button>
      </div>
      {error && <div className="error">{error}</div>}
    </>
  );
}
