"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Panel } from "@/components/ui/Panel";
import { setRegistrationAction, type SiteState } from "./actions";

export function SiteForm({ registration }: { registration: boolean }) {
  const [state, action] = useActionState<SiteState, FormData>(setRegistrationAction, {});
  const [open, setOpen] = useState(registration);
  return (
    <Panel title="Регистрация клиентов" description="Могут ли гости сами создать аккаунт на сайте" actions={<Badge tone={registration ? "success" : "neutral"} dot>{registration ? "открыта" : "закрыта"}</Badge>}>
      <form action={action} className="space-y-4" data-testid="site-form">
        <label className="flex cursor-pointer items-start gap-3 rounded-[10px] border border-line p-3.5 transition-colors hover:border-line-strong has-[:checked]:border-wine/40 has-[:checked]:bg-rose/30">
          <input type="checkbox" name="registration" defaultChecked={registration} onChange={(e) => setOpen(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-wine" />
          <span>
            <span className="block text-sm font-medium">Открыть регистрацию на сайте</span>
            <span className="mt-0.5 block text-sm text-muted">
              {open
                ? "Открыта: гости видят кнопки «Создать книгу» и «Зарегистрироваться», могут создать аккаунт."
                : "Закрыта: кнопки скрыты, на лендингах вместо них — вход, страница регистрации объясняет, что набор закрыт, и ведёт в WhatsApp."}
            </span>
          </span>
        </label>
        <ul className="list-disc space-y-1 pl-5 text-xs text-muted">
          <li>Клиенты, которые уже зарегистрированы, входят и работают как обычно.</li>
          <li>Менеджеры по-прежнему заводят клиентов вручную: CRM → Клиенты → Новый клиент (с логином и паролем).</li>
          <li>Покупка подарочных сертификатов не требует аккаунта и работает всегда.</li>
        </ul>
        {state.error ? <Alert>{state.error}</Alert> : null}
        {state.ok ? (
          <Alert kind="success">
            <span data-testid="site-saved">{state.ok}</span>
          </Alert>
        ) : null}
        <div className="border-t border-line pt-4">
          <SubmitButton className="h-10 text-sm">Сохранить</SubmitButton>
        </div>
      </form>
    </Panel>
  );
}
