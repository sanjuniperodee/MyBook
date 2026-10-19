"use client";

import { useActionState, useState } from "react";
import { createDealAction, type DealFormState } from "../actions";
import { dealSourceLabels, dealSources } from "@/shared/domain/dealSources";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Alert } from "@/components/ui/Alert";
import { ClientDealsForm } from "./ClientDealsForm";
import { DiscountHint } from "@/components/admin/DiscountHint";
import { dealListPrice } from "@/modules/sales/domain/pricing";
import { formatPrice, getVisiblePlans } from "@/config/site";
import { planLabels } from "@/modules/ordering/ui/labels";

export function NewDealForm({ stages, defaultStageId, admins, me, client, canAssign = false, maxDiscountPercent = null }: { stages: { id: string; name: string }[]; defaultStageId?: string; admins: { id: string; label: string }[]; me: string; client: { id: string; name: string; phone: string } | null; canAssign?: boolean; /** Лимит скидки сотрудника от прайса, %; null — без лимита. */ maxDiscountPercent?: number | null }) {
  const [state, action] = useActionState<DealFormState, FormData>(createDealAction, {});
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
    <form action={action} className="grid gap-4 rounded-2xl border border-line bg-white p-5 sm:grid-cols-2">
      {client ? <input type="hidden" name="clientId" value={client.id} /> : null}
      <div className="sm:col-span-2">
        <label className="label">Название</label>
        <input name="title" required maxLength={200} className="input h-11" placeholder="Книга для мамы к юбилею" defaultValue={client ? `Книга: ${client.name}` : ""} />
      </div>
      <div>
        <label className="label">Имя клиента</label>
        <input name="contactName" maxLength={120} className="input h-11" defaultValue={client?.name ?? ""} />
      </div>
      <div>
        <label className="label">Телефон</label>
        <input name="contactPhone" inputMode="tel" maxLength={40} className="input h-11" placeholder="+7 701 000 00 00" defaultValue={client?.phone ?? ""} />
      </div>
      <div>
        <label className="label">E-mail</label>
        <input name="contactEmail" type="email" maxLength={200} className="input h-11" />
      </div>
      <div>
        <label className="label">Бюджет, ₸</label>
        <input name="amount" type="number" min={0} step={1000} className="input h-11" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <DiscountHint list={dealListPrice(plan || null, source)} price={Number(amount) || 0} maxPercent={maxDiscountPercent} />
      </div>
      <div>
        <label className="label">Тариф договорённости</label>
        <select name="plan" className="input h-11" value={plan} onChange={(e) => setPlan(e.target.value)} data-testid="new-deal-plan">
          <option value="">Не указан</option>
          {getVisiblePlans().map((p) => (
            <option key={p.id} value={p.id}>
              {planLabels[p.id]} · по прайсу {formatPrice(p.price)}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-muted">Клиент оформит заказ по договорённости только на этот тариф. Не указан — бюджет сделки «вручную» действует на любой тариф.</p>
      </div>
      <div>
        <label className="label">Источник</label>
        <select name="source" className="input h-11" value={source} onChange={(e) => setSource(e.target.value)}>
          {dealSources.map((s) => (
            <option key={s} value={s}>
              {dealSourceLabels[s]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Этап</label>
        <select name="stageId" className="input h-11" defaultValue={defaultStageId ?? stages[0]?.id}>
          {stages.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      <div className="sm:col-span-2">
        <label className="label">Ответственный</label>
        <select name="assigneeId" className="input h-11" defaultValue={me}>
          {admins.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </select>
      </div>
      {state.error ? <Alert className="sm:col-span-2">{state.error}</Alert> : null}
      <div className="sm:col-span-2">
        <SubmitButton>Создать сделку</SubmitButton>
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
      className={`flex-1 rounded-xl border px-4 py-3 text-left text-sm transition ${kind === k ? "border-wine bg-wine/5 ring-2 ring-wine/10" : "border-line bg-white hover:border-ink/30"}`}
    >
      <span className="block font-medium">{label}</span>
      <span className="mt-0.5 block text-xs text-muted">{hint}</span>
    </button>
  );
  return (
    <div className="flex flex-col gap-2 sm:flex-row" role="tablist" data-testid="deal-kind">
      {tab("lead", "Заявка", "Обычная сделка: бюджет, источник, этап")}
      {tab("agreement", "Оплатил / договорились", "Тариф, цена, предоплата с чеком — можно сразу за несколько книг")}
    </div>
  );
}
