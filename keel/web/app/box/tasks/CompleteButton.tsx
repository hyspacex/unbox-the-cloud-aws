"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { completeAssignment } from "@/app/actions";

export function CompleteButton({ assignmentId }: { assignmentId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button className="btn small" disabled={pending} onClick={() => start(async () => { await completeAssignment(assignmentId); router.refresh(); })}>
      Mark complete
    </button>
  );
}
