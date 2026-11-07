"use client";

import { useActionState, useState } from "react";
import { createDealAction, type DealFormState } from "../actions";
import { dealSourceLabels, dealSources } from "@/shared/domain/dealSources";
import { LoaderCircle } from "lucide-react";
import Link from "next/link";
import { Panel } from "@/components/ui/Panel";
import { Field } from "@/components/ui/Field";
import { cn } from "@/lib/class-names";
import { submitKeepingValues } from "@/components/admin/submitKeepingValues";
import { Alert } from "@/components/ui/Alert";
import { ClientDealsForm } from "./ClientDealsForm";
import { DiscountHint } from "@/components/admin/DiscountHint";
import { dealListPrice } from "@/modules/sales/domain/pricing";
import { formatPrice, getVisiblePlans } from "@/config/site";
import { planLabels } from "@/modules/ordering/ui/labels";

export function NewDealForm({ stages, defaultStageId, admins, me, client, canAssign = false, maxDiscountPercent = null }: { stages: { id: string; name: string }[]; defaultStageId?: string; admins: { id: string; label: string }[]; me: string; client: { id: string; name: string; phone: string; /** Номер скрыт ролью: в форме маска, номер сервер берёт у клиента. */ phoneMasked?: boolean } | null; canAssign?: boolean; /** Лимит скидки сотрудника от прайса, %; null — без лимита. */ maxDiscountPercent?: number | null }) {
  // Не action формы — при ошибке сервера React не сбросит набранное (submitKeepingValues).
  const [state, action, pending] = useActionState<DealFormState, FormData>(createDealAction, {});
  // Бюджет сделки «вручную» или с тарифом — уже цена для клиента: подсказка «ниже прайса» (от тарифа; без него — от самого дорогого).
  const [amount, setAmount] = useState("0");
  const [source, setSource] = useState("manual");
  const [plan, setPlan] = useState("");
  // Для существующего клиента: обычная заявка или «по договорённости» (оплатил/договорились — можно сразу за несколько книг).
  const [kind, setKind] = useState<"lead" | "agreement">("lead");
  if (client && kind === "agreement")
    return (
      <div className="space-y-4">
        <DealKind kind={kind} onChange={setKind} />
        <ClientDealsForm stages={stages} defaultStageId={defaultStageId} admins={admins} me={me} canAssign={canAssign} client={client} maxDiscountPercent={maxDiscountPercent} />
      </div>
    );
  return (
    <div className="space-y-4">
      {client ? <DealKind kind={kind} onChange={setKind} /> : null}
      {leadForm()}
    </div>
  );

  function leadForm() {
    return (
      <form onSubmit={submitKeepingValues(action)} className="space-y-4">
        {client ? <input type="hidden" name="clientId" value={client.id} /> : null}
        <Panel title="Сделка">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Название" className="sm:col-span-2">
              <input name="title" required maxLength={200} className="input" placeholder="Книга для мамы к юбилею" defaultValue={client ? `Книга: ${client.name}` : ""} />
            </Field>
            <div className="min-w-0">
              <Field label="Бюджет, ₸">
                <input name="amount" type="number" min={0} step={1000} inputMode="numeric" className="input tabular-nums" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </Field>
              <DiscountHint list={dealListPrice(plan || null, source)} price={Number(amount) || 0} maxPercent={maxDiscountPercent} />
            </div>
            <Field label="Источник">
              <select name="source" className="input" value={source} onChange={(e) => setSource(e.target.value)}>
                {dealSources.map((s) => (
                  <option key={s} value={s}>
                    {dealSourceLabels[s]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Тариф договорённости" optional hint="Клиент оформит заказ по договорённости только на этот тариф. Не указан — бюджет действует на любой тариф." className="sm:col-span-2">
              <select name="plan" className="input" value={plan} onChange={(e) => setPlan(e.target.value)} data-testid="new-deal-plan">
                <option value="">Не указан</option>
                {getVisiblePlans().map((p) => (
                  <option key={p.id} value={p.id}>
                    {planLabels[p.id]} · по прайсу {formatPrice(p.price)}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </Panel>
        <Panel title="Контакт">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Имя клиента" className="sm:col-span-2">
              <input name="contactName" maxLength={120} className="input" defaultValue={client?.name ?? ""} placeholder="Как зовут клиента" />
            </Field>
            {client?.phoneMasked ? (
              <div className="min-w-0">
                <span className="label">Телефон</span>
                <div className="input flex items-center bg-sunken text-ink-soft tabular-nums" data-testid="masked-phone">
                  {client.phone || "—"}
                </div>
                <p className="hint">Номер скрыт настройками роли — в сделку попадёт номер из карточки клиента.</p>
              </div>
            ) : (
              <Field label="Телефон">
                <input name="contactPhone" inputMode="tel" maxLength={40} className="input tabular-nums" placeholder="+7 701 000 00 00" defaultValue={client?.phone ?? ""} />
              </Field>
            )}
            <Field label="E-mail" optional>
              <input name="contactEmail" type="email" maxLength={200} className="input" />
            </Field>
          </div>
        </Panel>
        <Panel title="Воронка">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Этап">
              <select name="stageId" className="input" defaultValue={defaultStageId ?? stages[0]?.id}>
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Ответственный">
              <select name="assigneeId" className="input" defaultValue={me}>
                {admins.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </Panel>
        {state.error ? <Alert>{state.error}</Alert> : null}
        <div className="flex flex-wrap items-center gap-2 max-sm:[&>*]:flex-1">
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : null} Создать сделку
          </button>
          <Link href={client ? `/admin/clients/${client.id}` : "/admin/deals"} className="btn btn-ghost">
            Отмена
          </Link>
        </div>
      </form>
    );
  }
}

function DealKind({ kind, onChange }: { kind: "lead" | "agreement"; onChange: (k: "lead" | "agreement") => void }) {
  const tab = (k: "lead" | "agreement", label: string, hint: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={kind === k}
      onClick={() => onChange(k)}
      className={cn("flex flex-1 items-start gap-3 rounded-[14px] border bg-white px-4 py-3.5 text-left text-sm transition-colors", kind === k ? "border-wine ring-[3px] ring-wine/12" : "border-line hover:border-line-strong")}
    >
      <span className={cn("mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border", kind === k ? "border-wine" : "border-line-strong")} aria-hidden>
        {kind === k ? <span className="size-2 rounded-full bg-wine" /> : null}
      </span>
      <span>
        <span className="block font-medium">{label}</span>
        <span className="mt-0.5 block text-xs text-muted">{hint}</span>
      </span>
    </button>
  );
  return (
    <div className="flex flex-col gap-2 sm:flex-row" role="tablist" aria-label="Что заводим" data-testid="deal-kind">
      {tab("lead", "Заявка", "Обычная сделка: бюджет, источник, этап")}
      {tab("agreement", "Оплатил / договорились", "Тариф, цена, предоплата с чеком — можно сразу за несколько книг")}
    </div>
  );
}
