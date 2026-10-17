import { connection } from "next/server";
import { Suspense } from "react";
import { devSamples } from "@/lib/ui/devSamples";
import { DevGallery } from "@/components/DevGallery";

async function Gallery() {
  await connection();
  const s = devSamples();
  return <DevGallery {...s} />;
}

export default function Page() {
  return (
    <Suspense fallback={<div className="p-10 text-muted">Loading fixture samples</div>}>
      <Gallery />
    </Suspense>
  );
}
