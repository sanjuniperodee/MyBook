"use client";

import { Link, useMessages } from "@/i18n/client";
import { useActionState, useState } from "react";
import { loginAction, type FormState } from "../actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Alert } from "@/components/ui/Alert";
import { Field } from "@/components/ui/Field";
import { PasswordInput } from "../PasswordInput";

/** Вход: логин остаётся в поле после ошибки (форма после ответа сервера сбрасывается), пароль — с кнопкой «показать». */
export function LoginForm({ next }: { next?: string }) {
  const [state, action] = useActionState<FormState, FormData>(loginAction, {});
  const { login: t, fields: f } = useMessages().auth;
  const [login, setLogin] = useState("");
  return (
    <form action={action} className="space-y-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}
      {state.error ? <Alert>{state.error}</Alert> : null}
      <Field label={f.login}>
        <input className="input" id="email" name="email" type="text" inputMode="email" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={login} onChange={(e) => setLogin(e.target.value)} required />
      </Field>
      <div>
        <Field label={f.password}>
          <PasswordInput id="password" name="password" autoComplete="current-password" required />
        </Field>
        <Link href="/forgot" className="mt-1 inline-flex min-h-11 items-center text-sm text-wine underline-offset-4 hover:underline sm:min-h-9">
          {t.forgot}
        </Link>
      </div>
      <SubmitButton className="btn-lg w-full" pendingText={t.pending}>
        {t.submit}
      </SubmitButton>
    </form>
  );
}
