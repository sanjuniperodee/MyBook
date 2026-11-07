"use client";

import { useActionState, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { Actions, Group, Note, SaveButton, Section, Toggle } from "../settings/ui";
import { setRegistrationAction, type SiteState } from "./actions";

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
