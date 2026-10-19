"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Alert } from "@/components/ui/Alert";
import { formatPhone } from "@/shared/domain/phone";
import type { SellerDetails } from "@/config/site";
import { saveSellerAction, type SiteState } from "./actions";

const fields: { key: keyof SellerDetails; label: string; hint: string; inputMode?: "numeric" | "tel" }[] = [
  { key: "legalName", label: "Юр. название", hint: "Оферта, футер сайта и упаковочный лист" },
  { key: "bin", label: "БИН / ИИН", hint: "12 цифр — в оферте и футере", inputMode: "numeric" },
  { key: "phone", label: "Телефон магазина", hint: "Футер, оферта, упаковочный лист", inputMode: "tel" },
  { key: "whatsapp", label: "WhatsApp магазина", hint: "Кнопки «Написать в WhatsApp» на сайте, на сертификате и в рекламных ссылках", inputMode: "tel" },
];

const shown = (key: keyof SellerDetails, v: string) => (key === "phone" || key === "whatsapp" ? formatPhone(v) : v);

/** Реквизиты продавца: пустое поле — на сайте заглушка (сервер пишет предупреждение в лог). */
export function SellerForm({ values, factory }: { values: Partial<SellerDetails>; factory: SellerDetails }) {
  const [state, action] = useActionState<SiteState, FormData>(saveSellerAction, {});
  const missing = fields.filter((f) => !values[f.key]);
  return (
    <form action={action} className="space-y-4 rounded-2xl border border-line bg-white p-5" data-testid="seller-form">
      <div>
        <h2 className="font-semibold">Реквизиты продавца</h2>
        <p className="mt-1 text-sm text-muted">Их видят клиенты: оферта, футер сайта, страница сертификата, оплата и упаковочный лист.</p>
      </div>
      {missing.length ? (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900" data-testid="seller-missing">
          Не заполнено: {missing.map((f) => f.label).join(", ")}. На сайте сейчас заглушка — {missing.map((f) => `«${shown(f.key, factory[f.key])}»`).join(", ")}.
        </p>
      ) : null}
      {state.error ? <Alert>{state.error}</Alert> : null}
      {state.ok ? (
        <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900" role="status" data-testid="seller-saved">
          {state.ok}
        </p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map((f) => (
          <label key={f.key} className="block">
            <span className="mb-1 block text-xs text-muted">{f.label}</span>
            <input name={f.key} defaultValue={values[f.key] ? shown(f.key, values[f.key]!) : ""} inputMode={f.inputMode} className="input h-10 text-sm" />
            <span className="mt-1 block text-[11px] text-muted">{f.hint}</span>
          </label>
        ))}
      </div>
      <SubmitButton className="btn btn-primary">Сохранить реквизиты</SubmitButton>
    </form>
  );
}
