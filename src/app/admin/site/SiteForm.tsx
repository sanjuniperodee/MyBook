"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Alert } from "@/components/ui/Alert";
import { setRegistrationAction, type SiteState } from "./actions";

export function SiteForm({ registration }: { registration: boolean }) {
  const [state, action] = useActionState<SiteState, FormData>(setRegistrationAction, {});
  const [open, setOpen] = useState(registration);
  return (
    <form action={action} className="space-y-4 rounded-2xl border border-line bg-white p-5" data-testid="site-form">
      {state.error ? <Alert>{state.error}</Alert> : null}
      {state.ok ? (
        <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900" role="status" data-testid="site-saved">
          {state.ok}
        </p>
      ) : null}
      <section>
        <label className="flex cursor-pointer items-start gap-3">
          <input type="checkbox" name="registration" defaultChecked={registration} onChange={(e) => setOpen(e.target.checked)} className="mt-1 size-5 accent-wine" />
          <span>
            <span className="block font-medium">Регистрация клиентов на сайте</span>
            <span className="mt-1 block text-sm text-muted">
              {open
                ? "Открыта: гости видят кнопки «Создать книгу» и «Зарегистрироваться», могут создать аккаунт."
                : "Закрыта: кнопки скрыты, на лендингах вместо них — вход, страница регистрации объясняет, что набор закрыт, и ведёт в WhatsApp."}
            </span>
          </span>
        </label>
        <ul className="mt-4 list-disc space-y-1 pl-9 text-xs text-muted">
          <li>Клиенты, которые уже зарегистрированы, входят и работают как обычно.</li>
          <li>Менеджеры по-прежнему заводят клиентов вручную: CRM → Клиенты → Новый клиент (с логином и паролем).</li>
          <li>Покупка подарочных сертификатов не требует аккаунта и работает всегда.</li>
        </ul>
      </section>
      <SubmitButton className="btn btn-primary">Сохранить</SubmitButton>
    </form>
  );
}
