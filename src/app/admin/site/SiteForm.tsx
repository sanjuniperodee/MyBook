"use client";

import { useActionState, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { Actions, Field, Group, Note, SaveButton, Section, Toggle } from "../settings/ui";
import { setGiftNoteAction, setMaxPhotosAction, setRegistrationAction, type SiteState } from "./actions";

export function SiteForm({ registration }: { registration: boolean }) {
  const [state, action] = useActionState<SiteState, FormData>(setRegistrationAction, {});
  const [open, setOpen] = useState(registration);
  return (
    <Section id="registration" title="Регистрация клиентов" description="Могут ли гости сами создать аккаунт на сайте" status={registration ? { tone: "ok", label: "открыта" } : { tone: "off", label: "закрыта" }}>
      <form action={action} className="space-y-5" data-testid="site-form">
        <Group title="Набор клиентов" hint="Применяется сразу.">
          <Toggle
            name="registration"
            defaultChecked={registration}
            onChange={setOpen}
            label={<span className="font-medium">Открыть регистрацию на сайте</span>}
            hint={
              open
                ? "Открыта: гости видят кнопки «Создать книгу» и «Зарегистрироваться», могут создать аккаунт."
                : "Закрыта: кнопки скрыты, на лендингах вместо них — вход, страница регистрации объясняет, что набор закрыт, и ведёт в WhatsApp."
            }
          />
        </Group>
        <Note>
          Клиенты, которые уже зарегистрированы, входят и работают как обычно. Менеджеры по-прежнему заводят клиентов вручную: CRM → Клиенты → Новый клиент (с логином и паролем). Покупка подарочных сертификатов не требует аккаунта и работает всегда.
        </Note>
        {state.error ? <Alert>{state.error}</Alert> : null}
        <Actions>
          <SaveButton />
          {state.ok ? (
            <span role="status" className="inline-flex items-center gap-1.5 text-sm text-success">
              <CheckCircle2 className="size-4 shrink-0" aria-hidden /> <span data-testid="site-saved">{state.ok}</span>
            </span>
          ) : null}
        </Actions>
      </form>
    </Section>
  );
}

/** Открытка к заказу: предлагать ли клиенту вписать текст открытки при оформлении. */
export function GiftNoteForm({ enabled }: { enabled: boolean }) {
  const [state, action] = useActionState<SiteState, FormData>(setGiftNoteAction, {});
  const [on, setOn] = useState(enabled);
  return (
    <Section id="gift-note" title="Открытка к заказу" description="Может ли клиент добавить подарочную открытку при оформлении" status={enabled ? { tone: "ok", label: "включена" } : { tone: "off", label: "выключена" }}>
      <form action={action} className="space-y-5" data-testid="gift-note-form">
        <Group title="Оформление заказа" hint="Применяется сразу.">
          <Toggle
            name="giftNote"
            defaultChecked={enabled}
            onChange={setOn}
            label={<span className="font-medium">Предлагать открытку к заказу</span>}
            hint={
              on
                ? "Включена: на шаге «Подарок» клиент может вписать текст открытки, мы печатаем её и вкладываем в упаковку."
                : "Выключена: на шаге «Подарок» остаются только дата и «сюрприз», поля для текста открытки нет."
            }
          />
        </Group>
        <Note>
          Открытки в уже оформленных заказах остаются: их видно в карточке заказа и на бланке для типографии, сотрудник может поправить или убрать текст в «Изменить контакты и доставку».
        </Note>
        {state.error ? <Alert>{state.error}</Alert> : null}
        <Actions>
          <SaveButton />
          {state.ok ? (
            <span role="status" className="inline-flex items-center gap-1.5 text-sm text-success">
              <CheckCircle2 className="size-4 shrink-0" aria-hidden /> <span data-testid="gift-note-saved">{state.ok}</span>
            </span>
          ) : null}
        </Actions>
      </form>
    </Section>
  );
}

/** Предел фото в одной книге: сколько снимков клиент может загрузить. */
export function MaxPhotosForm({ value, ceiling }: { value: number; ceiling: number }) {
  const [state, action] = useActionState<SiteState, FormData>(setMaxPhotosAction, {});
  return (
    <Section id="max-photos" title="Фото в книге" description="Сколько фото клиент может загрузить в одну книгу" status={{ tone: "ok", label: `до ${value}` }}>
      <form action={action} className="space-y-5" data-testid="max-photos-form">
        <Group title="Предел фото" hint="Применяется сразу.">
          <Field label="Фото в одной книге" hint={`Целое число от 1 до ${ceiling}. По умолчанию 140.`}>
            <input name="maxPhotos" type="number" inputMode="numeric" min={1} max={ceiling} defaultValue={value} required className="input max-w-40" />
          </Field>
        </Group>
        <Note>Уже загруженные фото остаются, даже если их больше нового предела: не загрузятся только новые. Клиент видит предел в сообщении при загрузке.</Note>
        {state.error ? <Alert>{state.error}</Alert> : null}
        <Actions>
          <SaveButton />
          {state.ok ? (
            <span role="status" className="inline-flex items-center gap-1.5 text-sm text-success">
              <CheckCircle2 className="size-4 shrink-0" aria-hidden /> <span data-testid="max-photos-saved">{state.ok}</span>
            </span>
          ) : null}
        </Actions>
      </form>
    </Section>
  );
}
