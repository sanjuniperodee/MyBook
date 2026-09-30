"use client";

import { useActionState, useState, useTransition } from "react";
import { Check, Trash2 } from "lucide-react";
import { ask, toastError } from "@/components/ui/overlays";
import { assignDealAction, deleteDealAction, moveDealAction, updateDealAction, type DealFormState } from "../actions";
import { LostDialog } from "../DealsBoard";
import { ManagerSelect } from "@/components/admin/ContactActions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { dealSourceLabels, dealSources } from "@/lib/crm/deal-meta";
import { cn } from "@/lib/utils";

interface Stage {
  id: string;
  name: string;
  color: string;
  kind: "open" | "won" | "lost";
}

/** Этапы как в amoCRM: полоса с текущим положением; клик — перевести сделку. */
export function StageBar({ dealId, current, stages, disabled }: { dealId: string; current: string; stages: Stage[]; disabled: boolean }) {
  const [value, setValue] = useState(current);
  const [lost, setLost] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const idx = stages.findIndex((s) => s.id === value);
  const cur = stages[idx];
  const go = (stageId: string, reason?: string) => {
    const prev = value;
    setValue(stageId);
    start(async () => {
      try {
        await moveDealAction(dealId, stageId, reason);
      } catch (e) {
        setValue(prev);
        toastError(e);
      }
    });
  };
  return (
    <>
      <div className="flex gap-1 overflow-x-auto pb-1" data-testid="stage-bar">
        {stages.map((s, i) => {
          const passed = cur?.kind === "open" ? s.kind === "open" && i <= idx : s.id === value;
          return (
            <button
              key={s.id}
              type="button"
              disabled={disabled || pending || s.id === value}
              onClick={() => (s.kind === "lost" ? setLost(s.id) : go(s.id))}
              className={cn(
                "min-w-24 flex-1 truncate rounded-lg px-3 py-2 text-xs font-medium transition disabled:cursor-default",
                passed ? "text-white" : "bg-white text-ink-soft hover:bg-cream",
                s.id === value && "ring-2 ring-ink/20",
              )}
              style={passed ? { background: s.color } : undefined}
              title={s.name}
            >
              {s.id === value ? <Check className="mr-1 inline size-3" /> : null}
              {s.name}
            </button>
          );
        })}
      </div>
      {lost ? (
        <LostDialog
          onCancel={() => setLost(null)}
          onSubmit={(r) => {
            go(lost, r);
            setLost(null);
          }}
        />
      ) : null}
    </>
  );
}

export function DealFields({
  deal,
  masked,
  disabled,
}: {
  deal: { id: string; title: string; amount: number; source: string; contactName: string; contactPhone: string; contactEmail: string; tags: string[] };
  masked: { phone: string; email: string } | null;
  disabled: boolean;
}) {
  const [state, action] = useActionState<DealFormState, FormData>(updateDealAction, {});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={deal.id} />
      <Field label="Название">
        <input name="title" defaultValue={deal.title} required maxLength={200} disabled={disabled} className="input h-9 text-sm" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Бюджет, ₸">
          <input name="amount" type="number" min={0} step={1000} defaultValue={deal.amount} disabled={disabled} className="input h-9 text-sm" />
        </Field>
        <Field label="Источник">
          <select name="source" defaultValue={deal.source} disabled={disabled} className="input h-9 text-sm">
            {dealSources.map((s) => (
              <option key={s} value={s}>
                {dealSourceLabels[s]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Контакт">
        <input name="contactName" defaultValue={deal.contactName} maxLength={120} disabled={disabled} className="input h-9 text-sm" placeholder="Имя" />
      </Field>
      {masked ? (
        <div className="space-y-1 text-sm text-ink-soft" title="Контакты скрыты настройками вашей роли" data-testid="masked-contacts">
          <div className="tabular-nums">{masked.phone || "—"}</div>
          <div>{masked.email || "—"}</div>
          {/* Скрытые поля не отправляем: сервер сохранит прежние значения. */}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Телефон">
            <input name="contactPhone" defaultValue={deal.contactPhone} maxLength={40} inputMode="tel" disabled={disabled} className="input h-9 text-sm" />
          </Field>
          <Field label="E-mail">
            <input name="contactEmail" type="email" defaultValue={deal.contactEmail} maxLength={200} disabled={disabled} className="input h-9 text-sm" />
          </Field>
        </div>
      )}
      <Field label="Теги (через запятую)">
        <input name="tags" defaultValue={deal.tags.join(", ")} maxLength={300} disabled={disabled} className="input h-9 text-sm" placeholder="юбилей, срочно" />
      </Field>
      {disabled ? null : (
        <div className="flex items-center gap-3">
          <SubmitButton className="btn-sm">Сохранить</SubmitButton>
          {state.error ? <span className="text-xs text-red-700">{state.error}</span> : null}
          {state.ok ? <span className="text-xs text-emerald-700">{state.ok}</span> : null}
        </div>
      )}
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-muted">{label}</span>
      {children}
    </label>
  );
}

export function DealAssignee({ dealId, value, options, disabled }: { dealId: string; value: string | null; options: { id: string; label: string }[]; disabled: boolean }) {
  return <ManagerSelect value={value} options={options} disabled={disabled} onChange={(v) => assignDealAction(dealId, v)} />;
}

export function DealDelete({ id, number }: { id: string; number: number }) {
  const [pending, start] = useTransition();
  return (
    <button
      className="btn btn-ghost btn-sm text-red-700"
      disabled={pending}
      onClick={async () =>
        (await ask(`Удалить сделку №${number}? Задачи и история по ней тоже удалятся.`, true)) &&
        start(async () => {
          try {
            await deleteDealAction(id);
          } catch (e) {
            if ((e as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw e;
            toastError(e);
          }
        })
      }
    >
      <Trash2 className="size-4" /> Удалить
    </button>
  );
}
