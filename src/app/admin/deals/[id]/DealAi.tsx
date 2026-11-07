"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CalendarPlus, ListChecks, LoaderCircle, Sparkles, TriangleAlert } from "lucide-react";
import { aiApplyFieldsAction, aiExtractFieldsAction, aiNextStepTaskAction, aiSummaryAction, type FieldProposal } from "@/app/admin/ai-actions";
import { temperatureLabels, type AiSummary } from "@/modules/assistant/domain";
import { toast, toastError } from "@/components/ui/overlays";
import { cn } from "@/lib/class-names";

const tempTones = { hot: "badge-danger", warm: "badge-warning", cold: "badge-info" } as const;

/** AI-помощник в карточке сделки: резюме со следующим шагом и заполнение полей из переписки. */
export function DealAi({ dealId, summary, summaryAt, canEdit }: { dealId: string; summary: AiSummary | null; summaryAt: string | null; canEdit: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"summary" | "fields" | "apply" | "task" | null>(null);
  const [proposals, setProposals] = useState<FieldProposal[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [, start] = useTransition();

  const run = (kind: NonNullable<typeof busy>, fn: () => Promise<void>) => {
    setBusy(kind);
    start(async () => {
      try {
        await fn();
      } catch (err) {
        toastError(err);
      } finally {
        setBusy(null);
      }
    });
  };

  const getSummary = () =>
    run("summary", async () => {
      const r = await aiSummaryAction(dealId);
      if (!r.ok) return void toast(r.message, "error");
      router.refresh();
    });

  const getFields = () =>
    run("fields", async () => {
      const r = await aiExtractFieldsAction(dealId);
      if (!r.ok) return void toast(r.message, "error");
      if (!r.proposals.length) return void toast("Новых данных в переписке не нашлось");
      setProposals(r.proposals);
      // По умолчанию отмечаем только пустые поля — заполненные вручную не перетираем без спроса.
      setPicked(new Set(r.proposals.filter((p) => p.current === null).map((p) => p.key)));
    });

  const apply = () =>
    run("apply", async () => {
      const values = Object.fromEntries((proposals ?? []).filter((p) => picked.has(p.key)).map((p) => [p.key, p.value]));
      const r = await aiApplyFieldsAction(dealId, values);
      if (!r.ok) return void toast(r.message, "error");
      toast(`Заполнено полей: ${r.count}`, "success");
      setProposals(null);
      router.refresh();
    });

  const task = () =>
    run("task", async () => {
      const r = await aiNextStepTaskAction(dealId);
      if (!r.ok) return void toast(r.message, "error");
      toast("Задача поставлена", "success");
      router.refresh();
    });

  const spin = (k: typeof busy) => (busy === k ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : null);

  return (
    <section className="panel" data-testid="deal-ai">
      <header className="panel-head">
        <h2 className="panel-title flex items-center gap-2">
          <Sparkles className="size-4 text-wine" strokeWidth={1.8} aria-hidden />
          AI-помощник
        </h2>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-outline btn-sm" onClick={getSummary} disabled={!!busy}>
            {spin("summary") ?? <Sparkles className="size-4" aria-hidden />} {summary ? "Обновить резюме" : "Резюме и следующий шаг"}
          </button>
          {canEdit ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={getFields} disabled={!!busy}>
              {spin("fields") ?? <ListChecks className="size-4" aria-hidden />} Заполнить поля
            </button>
          ) : null}
        </div>
      </header>
      <div className="panel-body space-y-3">
        {summary ? (
          <div className="space-y-3 text-sm" data-testid="ai-summary">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
              <span className={cn("badge", tempTones[summary.temperature])}>{temperatureLabels[summary.temperature]}</span>
              {summaryAt ? <span>обновлено {summaryAt}</span> : null}
            </div>
            <p className="whitespace-pre-wrap text-ink-soft">{summary.summary}</p>
            {summary.nextStep ? (
              <div className="flex flex-wrap items-center gap-3 rounded-[var(--r-ctl)] bg-sunken p-3">
                <div className="min-w-0 flex-1 basis-48">
                  <div className="text-xs text-muted">Следующий шаг, {summary.dueDays === 0 ? "сегодня" : summary.dueDays === 1 ? "завтра" : `через ${summary.dueDays} дн.`}</div>
                  <div className="font-medium">{summary.nextStep}</div>
                </div>
                <button type="button" className="btn btn-dark btn-sm" onClick={task} disabled={!!busy}>
                  {spin("task") ?? <CalendarPlus className="size-4" aria-hidden />} В задачи
                </button>
              </div>
            ) : null}
            {summary.risks ? (
              <p className="flex items-start gap-1.5 text-xs text-warning">
                <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden /> Риск: {summary.risks}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-muted">Помощник прочитает переписку, звонки и заметки и подскажет, что делать дальше. В чате он же предложит ответ клиенту.</p>
        )}

        {proposals ? (
          <div className="rounded-[var(--r-ctl)] border border-line p-3" data-testid="ai-fields">
            <div className="mb-2 text-sm font-medium">Нашлось в переписке — отметьте, что записать в карточку</div>
            <ul className="space-y-1.5 text-sm">
              {proposals.map((p) => (
                <li key={p.key}>
                  <label className="flex min-h-8 items-start gap-2">
                    <input
                      type="checkbox"
                      className="mt-1 size-4 accent-wine"
                      checked={picked.has(p.key)}
                      onChange={(e) =>
                        setPicked((s) => {
                          const n = new Set(s);
                          if (e.target.checked) n.add(p.key);
                          else n.delete(p.key);
                          return n;
                        })
                      }
                    />
                    <span>
                      <span className="text-muted">{p.label}:</span> <b className="font-semibold">{p.type === "date" && typeof p.value === "string" ? p.value.split("-").reverse().join(".") : p.value}</b>
                      {p.current !== null ? <span className="text-xs text-muted"> (сейчас: {p.current})</span> : null}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex gap-2">
              <button type="button" className="btn btn-dark btn-sm" onClick={apply} disabled={!!busy || !picked.size}>
                {spin("apply")} Записать
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setProposals(null)}>
                Отмена
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
