"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, LoaderCircle, Merge } from "lucide-react";
import { ask, toast, toastError } from "@/components/ui/overlays";
import { cn } from "@/lib/class-names";
import { mergeDealAction } from "../actions";
import { mergeQuestion } from "../[id]/DealControls";
import { StageLabel } from "../StageLabel";
import { dealNo } from "../ui";

export interface CompareDeal {
  id: string;
  number: number;
  title: string;
  stage: string;
  color: string;
  created: string;
  assignee: string | null;
  amount: string;
  contactName: string;
  phone: string;
  email: string;
  tags: string;
  /** Можно ли вливать другие сделки в эту / эту в другие (право и доступ к записи). */
  canMerge: boolean;
}

/**
 * Сравнение дублей (DESIGN.md §7.2): сделки одного человека рядом, расходящиеся значения выделены. Выберите, какую оставить, —
 * «Объединить» перенесёт в неё переписку, звонки, задачи и историю остальных, лишние номера удалятся (как «Объединить сюда» в
 * карточке сделки, с тем же подтверждением и перечнем отменяемых счетов).
 * cancels[«оставляемая:вливаемая»] — счета, которые слияние отменит.
 */
export function DuplicateCompare({ deals, cancels }: { deals: CompareDeal[]; cancels: Record<string, string[]> }) {
  const [keep, setKeep] = useState(deals[0].id);
  const [pending, start] = useTransition();
  const router = useRouter();
  const target = deals.find((d) => d.id === keep) ?? deals[0];
  const others = deals.filter((d) => d.id !== target.id);
  const allowed = target.canMerge && others.every((d) => d.canMerge);

  const rows: { label: string; value: (d: CompareDeal) => string }[] = [
    { label: "Название", value: (d) => d.title },
    { label: "Контакт", value: (d) => d.contactName },
    { label: "Телефон", value: (d) => d.phone },
    { label: "E-mail", value: (d) => d.email },
    { label: "Бюджет", value: (d) => d.amount },
    { label: "Ответственный", value: (d) => d.assignee ?? "" },
    { label: "Теги", value: (d) => d.tags },
    { label: "Создана", value: (d) => d.created },
  ];

  const merge = async () => {
    const notes = others.flatMap((o) => cancels[`${target.id}:${o.id}`] ?? []);
    const question = others.length === 1 ? mergeQuestion(others[0].number, false, cancels[`${target.id}:${others[0].id}`] ?? []) : `Объединить сделки ${others.map((o) => `№${o.number}`).join(", ")} с №${target.number}? Переписка, звонки, задачи и история перейдут в №${target.number}, остальные удалятся.${notes.length ? ` Будут отменены открытые счета ${notes.join(", ")} — ссылки на оплату у клиента перестанут работать.` : ""}`;
    if (!(await ask(question, true))) return;
    start(async () => {
      try {
        for (const o of others) {
          const r = await mergeDealAction(target.id, o.id);
          if (r?.error) return toast(r.error, "error");
        }
        toast(`Объединено: оставлена ${dealNo(target.number)}`, "success");
        router.refresh();
      } catch (e) {
        toastError(e);
      }
    });
  };

  return (
    <div data-testid="duplicate-group">
      <div className={cn("grid gap-px bg-line", deals.length > 2 ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
        {deals.map((d) => {
          const here = d.id === target.id;
          return (
            <article key={d.id} className={cn("flex min-w-0 flex-col bg-white", here && "bg-rose/30")} aria-label={`Сделка ${dealNo(d.number)}`}>
              <header className="flex items-start gap-2 border-b border-line px-4 py-3">
                <div className="min-w-0 flex-1">
                  <Link href={`/admin/deals/${d.id}`} className="block truncate font-semibold hover:text-wine">
                    <span className="tabular-nums text-muted">{dealNo(d.number)}</span> {d.title}
                  </Link>
                  <StageLabel name={d.stage} color={d.color} className="mt-0.5 text-xs" />
                </div>
                <button type="button" className={cn("btn btn-sm shrink-0", here ? "btn-dark" : "btn-outline")} aria-pressed={here} disabled={pending || !d.canMerge} onClick={() => setKeep(d.id)}>
                  {here ? <Check className="size-4" aria-hidden /> : null} {here ? "Остаётся" : "Оставить эту"}
                </button>
              </header>
              <dl className="divide-y divide-line px-4 text-sm">
                {rows.map((r) => {
                  const values = deals.map((x) => r.value(x));
                  const differs = new Set(values).size > 1;
                  const v = r.value(d);
                  return (
                    <div key={r.label} className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 py-2">
                      <dt className="text-muted">{r.label}</dt>
                      <dd className={cn("min-w-0 break-words tabular-nums", differs ? "font-medium text-ink" : "text-ink-soft")}>
                        {v || <span className="font-normal text-muted">—</span>}
                        {differs && v ? <span className="sr-only"> (отличается)</span> : null}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </article>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-line bg-sunken/40 px-4 py-3 sm:px-5">
        <p className="min-w-0 flex-1 basis-64 text-sm text-muted">
          {allowed ? (
            <>
              Останется <b className="font-semibold text-ink">{dealNo(target.number)}</b>, в неё перейдут переписка, звонки, задачи и история {others.map((o) => dealNo(o.number)).join(", ")}. Расходящиеся значения выделены.
            </>
          ) : (
            "Объединять сделки может сотрудник с правом править и удалять сделки; чужие сделки у роли «только свои» не объединяются."
          )}
        </p>
        <button type="button" className="btn btn-dark max-sm:w-full" disabled={pending || !allowed} onClick={() => void merge()}>
          {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Merge className="size-4" aria-hidden />} Объединить
        </button>
      </div>
    </div>
  );
}
