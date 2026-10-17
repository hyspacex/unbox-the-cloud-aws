import { Suspense } from "react";
import { FindingPage } from "@/components/finding/FindingPage";
import { LoadingBlock } from "@/components/ui/States";

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-[1240px] px-6 lg:px-10 pt-8">
          <LoadingBlock lines={6} />
        </div>
      }
    >
      <FindingPage params={params} />
    </Suspense>
  );
}
