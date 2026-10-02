"use client";

import { useTransition } from "react";
import { LoaderCircle } from "lucide-react";
import { toastError } from "@/components/ui/overlays";
import type { ModerationAction, ReviewStatus } from "@/modules/feedback";
import { moderateReviewAction } from "./actions";

export function ReviewActions({ id, status, featured, publishable }: { id: string; status: ReviewStatus; featured: boolean; publishable: boolean }) {
  const [pending, start] = useTransition();
  const run = (action: ModerationAction) =>
    start(async () => {
      try {
        await moderateReviewAction(id, action);
      } catch (err) {
        toastError(err);
      }
    });
  const btn = "rounded-lg border border-line px-3 py-1.5 text-xs hover:bg-cream disabled:opacity-50";
  return (
    <div className="flex flex-wrap items-center gap-2">
      {status !== "published" && publishable ? (
        <button className="rounded-lg bg-ink px-3 py-1.5 text-xs text-white hover:bg-ink/85 disabled:opacity-50" disabled={pending} onClick={() => run("publish")}>
          Опубликовать
        </button>
      ) : null}
      {status === "published" ? (
        <button className={btn} disabled={pending} onClick={() => run(featured ? "unfeature" : "feature")}>
          {featured ? "Открепить" : "Закрепить первым"}
        </button>
      ) : null}
      {status !== "hidden" ? (
        <button className={btn} disabled={pending} onClick={() => run("hide")}>
          {status === "new" ? "Проверен, не показывать" : "Снять с сайта"}
        </button>
      ) : null}
      {pending ? <LoaderCircle className="size-4 animate-spin text-muted" /> : null}
    </div>
  );
}
