import { Suspense } from "react";
import { FilePreview, PreviewSkeleton } from "@/components/box/preview/FilePreview";

/**
 * Box file preview: /files/<fileId>?v=<versionId>&q=<sentence>&c=<controlId>. The document at that version, with the
 * quoted sentence scrolled into view and highlighted. Search params are read on the client, inside Suspense.
 */
export default function FilePreviewPage() {
  return (
    <Suspense fallback={<PreviewSkeleton />}>
      <FilePreview />
    </Suspense>
  );
}
