"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/overlays";
import { retryAutomationRunAction } from "../actions";

/** «Повторить» срабатывание с ошибкой: с упавшего действия, сделанное не повторяется. */
export function RetryRun({ runId }: { runId: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm h-8 border border-line"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await retryAutomationRunAction(runId);
          toast(r.message, r.ok ? "success" : "error");
          router.refresh();
        })
      }
    >
      Повторить
    </button>
  );
}
