"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CalendarPlus, ListChecks, LoaderCircle, Sparkles } from "lucide-react";
import { aiApplyFieldsAction, aiExtractFieldsAction, aiNextStepTaskAction, aiSummaryAction, type FieldProposal } from "@/app/admin/ai-actions";
import { temperatureLabels, type AiSummary } from "@/modules/assistant/domain";
import { toast, toastError } from "@/components/ui/overlays";
import { cn } from "@/lib/utils";

const tempColors = { hot: "bg-red-100 text-red-800", warm: "bg-amber-100 text-amber-800", cold: "bg-sky-100 text-sky-800" } as const;

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

  const spin = (k: typeof busy) => (busy === k ? <LoaderCircle className="size-4 animate-spin" /> : null);

  return (
    <section className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-white p-5" data-testid="deal-ai">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto flex items-center gap-2 font-semibold">
          <Sparkles className="size-4 text-violet-600" /> AI-помощник
        </h2>
        <button type="button" className="btn btn-outline btn-sm" onClick={getSummary} disabled={!!busy}>
          {spin("summary") ?? <Sparkles className="size-4" />} {summary ? "Обновить резюме" : "Резюме и следующий шаг"}
        </button>
        {canEdit ? (
          <button type="button" className="btn btn-outline btn-sm" onClick={getFields} disabled={!!busy}>
            {spin("fields") ?? <ListChecks className="size-4" />} Заполнить поля из переписки
          </button>
        ) : null}
      </div>

      {summary ? (
        <div className="mt-4 space-y-2 text-sm" data-testid="ai-summary">
          <div className="flex items-center gap-2 text-xs text-muted">
            <span className={cn("rounded-full px-2 py-0.5 font-medium", tempColors[summary.temperature])}>{temperatureLabels[summary.temperature]}</span>
            {summaryAt ? <span>обновлено {summaryAt}</span> : null}
          </div>
          <p className="whitespace-pre-wrap">{summary.summary}</p>
          {summary.nextStep ? (
            <div className="flex flex-wrap items-start gap-3 rounded-xl bg-white p-3 ring-1 ring-violet-100">
              <div className="min-w-0 flex-1">
                <div className="text-xs text-muted">Следующий шаг · {summary.dueDays === 0 ? "сегодня" : summary.dueDays === 1 ? "завтра" : `через ${summary.dueDays} дн.`}</div>
                <div className="font-medium">{summary.nextStep}</div>
              </div>
              <button type="button" className="btn btn-sm" onClick={task} disabled={!!busy}>
                {spin("task") ?? <CalendarPlus className="size-4" />} В задачи
              </button>
            </div>
          ) : null}
          {summary.risks ? <p className="text-xs text-amber-800">Риск: {summary.risks}</p> : null}
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted">AI-помощник прочитает переписку, звонки и заметки и подскажет, что делать дальше. В чате — кнопка ✨ предложит ответ клиенту.</p>
      )}

      {proposals ? (
        <div className="mt-4 rounded-xl bg-white p-3 ring-1 ring-violet-100" data-testid="ai-fields">
          <div className="mb-2 text-sm font-medium">Нашлось в переписке — отметьте, что записать в карточку:</div>
          <ul className="space-y-1.5 text-sm">
            {proposals.map((p) => (
              <li key={p.key}>
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-1 accent-violet-600"
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
                    <span className="text-muted">{p.label}:</span> <b>{p.type === "date" && typeof p.value === "string" ? p.value.split("-").reverse().join(".") : p.value}</b>
                    {p.current !== null ? <span className="text-xs text-muted"> (сейчас: {p.current})</span> : null}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex gap-2">
            <button type="button" className="btn btn-sm" onClick={apply} disabled={!!busy || !picked.size}>
              {spin("apply")} Записать
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setProposals(null)}>
              Отмена
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
