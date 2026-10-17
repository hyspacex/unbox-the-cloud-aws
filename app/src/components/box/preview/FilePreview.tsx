"use client";

/**
 * Box file preview replica (v4.1 decision 5): the pinned text of one file version rendered as a document, with the
 * sentence Keel quoted scrolled into view and highlighted, and a margin pill naming the control. URL:
 * /files/<fileId>?v=<versionId>&q=<sentence>&c=<controlId>. The version menu switches versions in place.
 */
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import { ApiError, api } from "@/lib/client";
import { useKeelState } from "@/components/KeelStateProvider";
import { BoxDropdown } from "../UploadMenu";
import { boxDate, boxSize } from "../format";
import { FileTypeIcon, IconBack, IconCheck, IconClose, IconInfo, IconMore } from "../icons";
import { MarkdownDoc, findHighlight, parseMarkdown } from "./markdown";

const FOLDER = "Security Review Package";

type FileVersion = { version_id: string; version_label?: string; created_at?: string; uploader?: string; snapshot_ids?: string[] };
type FileText = {
  file_id: string;
  file_name: string;
  version_id: string;
  version_label?: string;
  text: string;
  created_at?: string;
  uploader?: string;
  /** Optional on the route (asked of lane E); the menu also merges the package's and the finding card's versions. */
  versions?: FileVersion[];
  snapshot_ids?: string[];
  /** Fallback only: a section excerpt from the finding card while GET /api/file-text is unavailable. */
  excerpt?: boolean;
};

/**
 * GET /api/file-text?file_id&version_id. While the route is not deployed (a bare 404), the finding card named by `c`
 * supplies the section text of its versions, labelled as an excerpt.
 */
/**
 * GET /api/file-text through the client. The highlight itself is found client-side with the same engine `norm` the
 * route uses for `match`, because it must land on rendered blocks rather than raw markdown offsets. If the route is
 * absent (a bare 404 without an error code), the finding card named by `c` supplies its section text as an excerpt.
 */
async function loadFileText(fileId: string, versionId: string, controlId: string | null, signal: AbortSignal): Promise<FileText> {
  try {
    return (await api.fileText(fileId, versionId, null, signal)) as FileText;
  } catch (e) {
    const code = e instanceof ApiError && e.body && typeof e.body === "object" ? (e.body as { error?: { code?: string } }).error?.code : undefined;
    if (!(e instanceof ApiError) || code || e.status !== 404 || !controlId) throw e;
  }
  const card = await api.finding(controlId, signal);
  const sides = [card.prior_version, card.old_location, card.new_version]
    .filter((x): x is NonNullable<typeof x> => Boolean(x))
    .map((x) => ({ file: x.file, section: x.section, text: x.text }))
    .filter((x) => x.file.fileId === fileId && x.text);
  const chosen = sides.find((x) => x.file.versionId === versionId) ?? sides[sides.length - 1];
  if (!chosen) throw new Error("The document preview is not available yet.");
  return {
    file_id: fileId,
    file_name: chosen.file.fileName,
    version_id: chosen.file.versionId,
    version_label: chosen.file.versionLabel,
    text: `## ${chosen.section ?? ""}\n\n${chosen.text ?? ""}`,
    excerpt: true,
  };
}

const upper = (l?: string) => (l ? l.toUpperCase() : "");

export function PreviewSkeleton() {
  return (
    <div className="box-root flex h-screen flex-col bg-[#F4F4F4]" aria-busy="true">
      <div className="h-14 border-b border-[#E8E8E8] bg-white" />
      <div className="mx-auto my-8 w-[720px] max-w-[calc(100%-48px)] space-y-3 bg-white px-14 py-12 shadow-sm">
        {[70, 92, 88, 60, 95, 80].map((w, i) => (
          <div key={i} className="box-skeleton h-3.5" style={{ width: `${w}%` }} />
        ))}
      </div>
    </div>
  );
}

export function FilePreview() {
  const { fileId } = useParams<{ fileId: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const v = search.get("v");
  const q = search.get("q");
  const c = search.get("c");
  const { pkg } = useKeelState();
  const reduce = useReducedMotion();
  const current = pkg?.files?.find((f) => f.file_id === decodeURIComponent(fileId));
  // Without ?v the preview opens the folder's current version (Box opens the latest).
  const versionId = v ?? current?.version_id ?? null;
  /** Versions the finding card knows for this file (v2 verified, v3 submitted), merged into the version menu. */
  const [cardVersions, setCardVersions] = useState<FileVersion[]>([]);

  const [doc, setDoc] = useState<FileText | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [details, setDetails] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const articleRef = useRef<HTMLDivElement>(null);
  const markRef = useRef<HTMLElement>(null);
  const [pill, setPill] = useState<{ top: number; side: "margin" | "above" } | null>(null);
  /** The column is centred; when the margin is too narrow for the pill (panel open), it moves left to make room. */
  const [align, setAlign] = useState<"center" | "left">("center");

  useEffect(() => {
    if (!c) return;
    const ctrl = new AbortController();
    api
      .finding(c, ctrl.signal)
      .then((card) => {
        const out: FileVersion[] = [];
        [card.prior_version, card.old_location, card.new_version].forEach((x) => {
          if (x && x.file.fileId === decodeURIComponent(fileId) && !out.some((o) => o.version_id === x.file.versionId))
            out.push({ version_id: x.file.versionId, version_label: x.file.versionLabel });
        });
        setCardVersions(out);
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, [c, fileId]);

  useEffect(() => {
    if (!versionId) return;
    const ctrl = new AbortController();
    loadFileText(decodeURIComponent(fileId), versionId, c, ctrl.signal)
      .then((d) => {
        setDoc(d);
        setErr(null);
      })
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        setErr(e instanceof Error ? e.message : String(e));
      });
    return () => ctrl.abort();
  }, [fileId, versionId, c]);

  const blocks = useMemo(() => (doc ? parseMarkdown(doc.text) : []), [doc]);
  const hl = useMemo(() => (doc ? findHighlight(blocks, q) : null), [blocks, doc, q]);
  const missing = Boolean(doc && q && !hl);

  // Scroll the sentence into the middle of the view, then place the pill beside it (or above it when the margin is narrow).
  useLayoutEffect(() => {
    const mark = markRef.current;
    const article = articleRef.current;
    const scroller = scrollRef.current;
    if (!mark || !article || !scroller || !hl) {
      setPill(null);
      // The sentence is not in this version: show the top of the document, where the pill says so.
      if (scroller && doc && q) scroller.scrollTo({ top: 0, behavior: "auto" });
      return;
    }
    mark.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
    const PILL_ROOM = 256; // 16 px gap + the pill's 236 px max width + a little air
    const place = () => {
      const w = scroller.clientWidth;
      const col = article.offsetWidth;
      const centredRoom = (w - col) / 2;
      const leftRoom = w - col - 24;
      const nextAlign = centredRoom >= PILL_ROOM || leftRoom < PILL_ROOM ? "center" : "left";
      setAlign(nextAlign);
      const room = nextAlign === "left" ? leftRoom : centredRoom;
      const top = mark.getBoundingClientRect().top - article.getBoundingClientRect().top;
      setPill({ top, side: room >= PILL_ROOM ? "margin" : "above" });
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(scroller);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- doc and q matter only through hl and the version id
  }, [hl, doc?.version_id, reduce, align]);

  const setVersion = (versionId: string) => {
    const p = new URLSearchParams(search.toString());
    p.set("v", versionId);
    router.replace(`/files/${encodeURIComponent(fileId)}?${p.toString()}`, { scroll: false });
  };
  const versions = useMemo(() => {
    const all: FileVersion[] = [...(doc?.versions ?? [])];
    const add = (ver: FileVersion | null) => {
      if (ver && !all.some((x) => x.version_id === ver.version_id)) all.push(ver);
    };
    if (doc) add({ version_id: doc.version_id, version_label: doc.version_label, created_at: doc.created_at, uploader: doc.uploader });
    if (current) add({ version_id: current.version_id, version_label: current.version_label, created_at: current.updated_at, uploader: current.uploader });
    cardVersions.forEach(add);
    // Dates known only for the current version; fill them where the ids match.
    const withDates = all.map((x) => (current && x.version_id === current.version_id ? { ...x, created_at: x.created_at ?? current.updated_at, uploader: x.uploader ?? current.uploader } : x));
    const n = (l?: string) => Number(/\d+/.exec(l ?? "")?.[0] ?? 0);
    return withDates.sort((a, b) => n(a.version_label) - n(b.version_label));
  }, [doc, current, cardVersions]);
  const shown = versions.find((x) => x.version_id === doc?.version_id);
  const versionItems = versions.map((ver) => ({
    label: [upper(ver.version_label) || "Version", ver.created_at ? boxDate(ver.created_at) : "", current?.version_id === ver.version_id ? "Current" : ""].filter(Boolean).join(" · "),
    icon: ver.version_id === doc?.version_id ? <IconCheck size={16} className="text-[#0061D5]" /> : <span className="inline-block w-4" />,
    onSelect: () => setVersion(ver.version_id),
    testId: `preview-version-${ver.version_label ?? ver.version_id}`,
  }));
  const pillText = c ? (
    <>
      Keel · changed the status of <span className="whitespace-nowrap">{c}</span>
    </>
  ) : (
    "Keel · the sentence Keel quoted"
  );

  return (
    <div className="box-root flex h-screen min-h-0 flex-col bg-[#F4F4F4] text-[14px] text-[#222222]">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-[#E8E8E8] bg-white px-3">
        <Link href="/" aria-label={`Back to ${FOLDER}`} className="box-icon-btn" data-testid="preview-back">
          <IconBack size={20} />
        </Link>
        <FileTypeIcon size={28} />
        <div className="min-w-0">
          <div className="truncate text-[15px] font-bold" data-testid="preview-file-name">
            {doc?.file_name ?? current?.file_name ?? ""}
          </div>
          <Link href="/" className="text-[12px] text-[#767676] hover:text-[#0061D5] hover:underline">
            {FOLDER}
          </Link>
        </div>
        {doc ? (
          <div className="ml-2" data-testid="preview-version-menu">
            <BoxDropdown label={upper(doc.version_label) || "Version"} variant="secondary" items={versionItems} testId="preview-version-button" />
          </div>
        ) : null}
        <div className="ml-auto flex items-center gap-1">
          <button type="button" className="box-btn box-btn-primary mr-1">
            Share
          </button>
          <button type="button" aria-label="More options" className="box-icon-btn">
            <IconMore size={20} />
          </button>
          <button
            type="button"
            aria-label="Details"
            aria-pressed={details}
            onClick={() => setDetails((d) => !d)}
            className={`box-icon-btn ${details ? "bg-[#E8F0FE] text-[#0061D5]" : ""}`}
          >
            <IconInfo size={22} />
          </button>
        </div>
      </header>

      {missing && doc ? (
        // A thin banner under the header bar, never over the document text.
        <div
          role="status"
          data-testid="preview-missing-pill"
          className="flex h-9 shrink-0 items-center justify-center gap-2 border-b border-[#F3D08A] bg-[#FFF7E6] px-4 text-[13px] font-bold text-[#8A4B00]"
        >
          <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#F59E0B]" />
          Keel · this sentence is not in {doc.version_label ?? "this version"}
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <div ref={scrollRef} className="min-w-0 flex-1 overflow-y-auto" data-testid="preview-scroll">
          {err ? (
            <p className="mx-auto my-16 max-w-[520px] text-center text-[14px] text-[#767676]" role="alert">
              {err}
            </p>
          ) : !doc ? (
            <div className="mx-auto my-8 w-[720px] max-w-[calc(100%-48px)] space-y-3 bg-white px-14 py-12 shadow-sm">
              {[70, 92, 88, 60].map((w, i) => (
                <div key={i} className="box-skeleton h-3.5" style={{ width: `${w}%` }} />
              ))}
            </div>
          ) : (
            <div ref={articleRef} className={`relative my-8 w-[720px] max-w-[calc(100%-48px)] bg-white px-14 py-12 shadow-[0_1px_3px_rgba(0,0,0,0.08)] ${align === "left" ? "ml-6 mr-auto" : "mx-auto"}`} data-align={align} style={{ transition: "margin 200ms" }} data-testid="preview-document">
              {doc.excerpt ? <p className="mb-4 text-[12px] text-[#767676]">Excerpt: the section Keel quoted. The full document preview loads from the file text service.</p> : null}
              <MarkdownDoc ref={markRef} blocks={blocks} hl={hl} />
              {hl && pill ? (
                <div
                  className="absolute z-10"
                  style={pill.side === "margin" ? { top: pill.top - 4, left: "calc(100% + 16px)" } : { top: Math.max(8, pill.top - 36), right: 24 }}
                >
                  <KeelPill text={pillText} testId="preview-pill" />
                </div>
              ) : null}
            </div>
          )}
        </div>
        {details && doc ? (
          <aside className="w-[320px] shrink-0 overflow-y-auto border-l border-[#E8E8E8] bg-white" aria-label="Details">
            <div className="flex h-14 items-center justify-between border-b border-[#E8E8E8] px-5">
              <h2 className="text-[16px] font-bold">Details</h2>
              <button type="button" aria-label="Close details" onClick={() => setDetails(false)} className="box-icon-btn h-8 w-8">
                <IconClose />
              </button>
            </div>
            <dl className="space-y-3 px-5 py-4">
              {(
                [
                  ["Version", upper(doc.version_label)],
                  ["Updated", shown?.created_at ? boxDate(shown.created_at) : ""],
                  ["Uploaded by", shown?.uploader ?? ""],
                  ["Current version", current ? `${upper(current.version_label)} · ${boxSize(current.size_bytes)}` : ""],
                ] as const
              )
                .filter(([, val]) => val)
                .map(([k, val]) => (
                  <div key={k}>
                    <dt className="text-[12px] text-[#767676]">{k}</dt>
                    <dd className="mt-0.5 text-[14px]">{val}</dd>
                  </div>
                ))}
            </dl>
          </aside>
        ) : null}
      </div>
    </div>
  );
}

function KeelPill({ text, testId }: { text: React.ReactNode; testId: string }) {
  return (
    <span
      data-testid={testId}
      className="inline-flex w-max max-w-[236px] items-center gap-1.5 rounded-full border border-[#F3D08A] bg-[#FFF7E6] px-2.5 py-1 text-[12px] font-bold leading-tight text-[#8A4B00] shadow-[0_2px_6px_rgba(0,0,0,0.06)]"
    >
      <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#F59E0B]" />
      {text}
    </span>
  );
}
