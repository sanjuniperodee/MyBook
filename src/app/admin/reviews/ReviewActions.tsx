"use client";

import { useTransition } from "react";
import { EyeOff, Globe, LoaderCircle, Pin, PinOff } from "lucide-react";
import { toastError } from "@/components/ui/overlays";
import type { ModerationAction } from "@/modules/feedback";
import type { ReviewStatus } from "@/shared/domain/reviews";
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
  return (
    <div className="flex flex-wrap items-center gap-2 lg:w-48 lg:flex-col lg:items-stretch lg:[&>.btn]:w-full">
      {status !== "published" && publishable ? (
        <button className="btn btn-dark btn-sm" disabled={pending} onClick={() => run("publish")}>
          <Globe className="size-4" aria-hidden /> Опубликовать
        </button>
      ) : null}
      {status === "published" ? (
        <button className="btn btn-outline btn-sm" disabled={pending} onClick={() => run(featured ? "unfeature" : "feature")}>
          {featured ? <PinOff className="size-4" aria-hidden /> : <Pin className="size-4" aria-hidden />}
          {featured ? "Открепить" : "Закрепить первым"}
        </button>
      ) : null}
      {status !== "hidden" ? (
        <button className={status === "new" ? "btn btn-outline btn-sm" : "btn btn-ghost btn-sm"} disabled={pending} onClick={() => run("hide")}>
          <EyeOff className="size-4" aria-hidden />
          {status === "new" ? "Проверен, не показывать" : "Снять с сайта"}
        </button>
      ) : null}
      {pending ? <LoaderCircle className="size-4 animate-spin self-center text-muted" aria-label="Сохраняем" /> : null}
    </div>
  );
}
