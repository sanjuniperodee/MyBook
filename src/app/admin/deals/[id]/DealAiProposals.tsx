"use client";

import { useState, useTransition } from "react";
import { Check, LoaderCircle, Sparkles, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast, toastError } from "@/components/ui/overlays";
import { aiProposalApplyAction, aiProposalDismissAction } from "@/app/admin/ai-actions";
import { AI_MARK, aiProposalTitle, type AiProposalView } from "@/shared/domain/aiProposals";

/**
 * Предложения ИИ по сделке («ИИ ведёт этапы»): что ИИ увидел в переписке и предлагает сделать — сменить этап, отметить
 * заказ выданным. Применяет менеджер одной кнопкой; цитата — дословно из переписки, на ней основан вывод.
 */
export function DealAiProposals({ proposals, canEdit }: { proposals: AiProposalView[]; canEdit: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [, start] = useTransition();
  if (!proposals.length) return null;
  const act = (id: string, apply: boolean) => {
    setBusy(id);
    start(async () => {
      try {
        const r = apply ? await aiProposalApplyAction(id) : await aiProposalDismissAction(id);
        if (!r.ok) toast(r.message, "error");
        else if (apply) toast("Готово", "success");
        router.refresh();
      } catch (err) {
        toastError(err);
      } finally {
        setBusy(null);
      }
    });
  };
  return (
    <section className="panel border-wine/30" data-testid="deal-ai-proposals">
      <header className="panel-head">
        <h2 className="panel-title flex items-center gap-2">
          <Sparkles className="size-4 text-wine" strokeWidth={1.8} aria-hidden />
          {AI_MARK} предлагает
        </h2>
      </header>
      <ul className="divide-y divide-line">
        {proposals.map((p) => (
          <li key={p.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-1 text-sm">
              <p className="font-medium">{aiProposalTitle(p)}</p>
              <p className="text-muted">{p.reason}</p>
              {p.quote ? <blockquote className="border-l-2 border-line pl-2 text-ink-soft">«{p.quote}»</blockquote> : null}
            </div>
            {canEdit ? (
              <div className="flex shrink-0 gap-2">
                <button type="button" className="btn btn-dark btn-sm" disabled={!!busy} onClick={() => act(p.id, true)}>
                  {busy === p.id ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />} Применить
                </button>
                <button type="button" className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => act(p.id, false)} aria-label="Отклонить предложение">
                  <X className="size-4" aria-hidden /> Отклонить
                </button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
