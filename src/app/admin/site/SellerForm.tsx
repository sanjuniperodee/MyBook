"use client";

import { useActionState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { formatPhone } from "@/shared/domain/phone";
import type { SellerDetails } from "@/config/site";
import { Actions, Field, Group, SaveButton, Section } from "../settings/ui";
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
  const row = (keys: (keyof SellerDetails)[]) => keys.map((k) => fields.find((f) => f.key === k)!);
  const field = (f: (typeof fields)[number]) => (
    <Field key={f.key} label={f.label} hint={f.hint}>
      <input name={f.key} defaultValue={values[f.key] ? shown(f.key, values[f.key]!) : ""} inputMode={f.inputMode} className="input" />
    </Field>
  );
  return (
    <Section
      id="seller"
      title="Реквизиты продавца"
      description="Их видят клиенты: оферта, футер сайта, страница сертификата, оплата и упаковочный лист"
      status={missing.length ? { tone: "warn", label: `не заполнено ${missing.length}` } : { tone: "ok", label: "заполнены" }}
    >
      <form action={action} className="space-y-5" data-testid="seller-form">
        {missing.length ? (
          <Alert kind="warning" className="max-w-[40rem]">
            <span data-testid="seller-missing">
              Не заполнено: {missing.map((f) => f.label).join(", ")}. На сайте сейчас заглушка — {missing.map((f) => `«${shown(f.key, factory[f.key])}»`).join(", ")}.
            </span>
          </Alert>
        ) : null}
        <Group title="Юридическое лицо" hint="Оферта, футер сайта, упаковочный лист.">
          {row(["legalName", "bin"]).map(field)}
        </Group>
        <Group title="Связь с магазином" hint="Телефон и WhatsApp, которые видят клиенты.">
          {row(["phone", "whatsapp"]).map(field)}
        </Group>
        {state.error ? <Alert>{state.error}</Alert> : null}
        <Actions>
          <SaveButton>Сохранить реквизиты</SaveButton>
          {state.ok ? (
            <span role="status" className="inline-flex items-center gap-1.5 text-sm text-success">
              <CheckCircle2 className="size-4 shrink-0" aria-hidden /> <span data-testid="seller-saved">{state.ok}</span>
            </span>
          ) : null}
        </Actions>
      </form>
    </Section>
  );
}
