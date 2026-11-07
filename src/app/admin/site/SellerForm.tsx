"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Field } from "@/components/ui/Field";
import { Panel } from "@/components/ui/Panel";
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
    <Panel
      title="Реквизиты продавца"
      description="Их видят клиенты: оферта, футер сайта, страница сертификата, оплата и упаковочный лист"
      actions={missing.length ? <Badge tone="warning">не заполнено {missing.length}</Badge> : <Badge tone="success" dot>заполнены</Badge>}
    >
      <form action={action} className="space-y-4" data-testid="seller-form">
        {missing.length ? (
          <Alert kind="warning">
            <span data-testid="seller-missing">
              Не заполнено: {missing.map((f) => f.label).join(", ")}. На сайте сейчас заглушка — {missing.map((f) => `«${shown(f.key, factory[f.key])}»`).join(", ")}.
            </span>
          </Alert>
        ) : null}
        <div className="grid gap-x-4 gap-y-4 sm:grid-cols-2">
          {fields.map((f) => (
            <Field key={f.key} label={f.label} hint={f.hint}>
              <input name={f.key} defaultValue={values[f.key] ? shown(f.key, values[f.key]!) : ""} inputMode={f.inputMode} className="input h-10 text-sm" />
            </Field>
          ))}
        </div>
        {state.error ? <Alert>{state.error}</Alert> : null}
        {state.ok ? (
          <Alert kind="success">
            <span data-testid="seller-saved">{state.ok}</span>
          </Alert>
        ) : null}
        <div className="border-t border-line pt-4">
          <SubmitButton className="h-10 text-sm">Сохранить реквизиты</SubmitButton>
        </div>
      </form>
    </Panel>
  );
}
