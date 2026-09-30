"use client";

import { useActionState } from "react";
import { createDealAction, type DealFormState } from "../actions";
import { dealSourceLabels, dealSources } from "@/lib/crm/deal-meta";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Alert } from "@/components/ui/Alert";

export function NewDealForm({ stages, admins, me, client }: { stages: { id: string; name: string }[]; admins: { id: string; label: string }[]; me: string; client: { id: string; name: string; phone: string } | null }) {
  const [state, action] = useActionState<DealFormState, FormData>(createDealAction, {});
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
        <input name="amount" type="number" min={0} step={1000} className="input h-11" defaultValue={0} />
      </div>
      <div>
        <label className="label">Источник</label>
        <select name="source" className="input h-11" defaultValue="manual">
          {dealSources.map((s) => (
            <option key={s} value={s}>
              {dealSourceLabels[s]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Этап</label>
        <select name="stageId" className="input h-11" defaultValue={stages[0]?.id}>
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
