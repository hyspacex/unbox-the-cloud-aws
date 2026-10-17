import type { Run } from "./data";

export function triggerText(run: Run): string {
  const t = run.trigger;
  const who = t.actor?.name ?? "Someone";
  switch (t.reason) {
    case "connected": return `Folder connected by ${who}`;
    case "manual": return `Run started by ${who}`;
    case "reconcile": {
      const f = run.snapshot.files.find((x) => x.changed);
      return f ? `${f.modified_by?.name ?? "Someone"} uploaded ${f.name}${f.version_number > 1 ? ` v${f.version_number}` : ""} (found by scheduled check)` : "Scheduled check found changes";
    }
    case "webhook": {
      const f = run.snapshot.files.find((x) => x.id === t.file?.id);
      const name = t.file?.name ?? "a file";
      if (t.event === "FILE.TRASHED" || t.event === "FILE.DELETED") return `${who} deleted ${name}`;
      if (t.event === "FILE.MOVED") return `${who} moved ${name}`;
      if (t.event === "FILE.RENAMED") return `${who} renamed ${name}`;
      if (f && f.version_number > 1) return `${who} uploaded ${name} v${f.version_number}`;
      return `${who} uploaded ${name}`;
    }
    default: return who;
  }
}

export function ruleHref(folderId: string, run: number, ruleId: string) {
  return `/folders/${folderId}/runs/${run}/rules/${ruleId.split("/").map(encodeURIComponent).join("/")}`;
}

export function fileHref(fileId: string, versionId?: string, line?: number | null) {
  return `/box/files/${fileId}${versionId ? `?version=${versionId}` : ""}${line ? `#L${line}` : ""}`;
}
