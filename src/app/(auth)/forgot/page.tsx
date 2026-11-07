"use client";

import { Link, useMessages } from "@/i18n/client";
import { useActionState, useState } from "react";
import { Field } from "@/components/ui/Field";
import { forgotAction, type FormState } from "../actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Alert } from "@/components/ui/Alert";
import { AuthHead } from "../AuthHead";

export default function ForgotPage() {
  const [state, action] = useActionState<FormState, FormData>(forgotAction, {});
  const { forgot: t, fields: f } = useMessages().auth;
  // Почта остаётся в поле после ошибки: форма после ответа сервера сбрасывается.
  const [email, setEmail] = useState("");
  return (
    <>
      <AuthHead title={t.title} text={t.text} />
      {state.ok ? (
        <Alert kind="success">{state.message}</Alert>
      ) : (
        <form action={action} className="space-y-4">
          {state.error && !state.field ? <Alert>{state.error}</Alert> : null}
          <Field label={f.email} error={state.field === "email" ? state.error : undefined}>
            <input className="input" id="email" name="email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          <SubmitButton className="btn-lg w-full">{t.submit}</SubmitButton>
        </form>
      )}
      <p className="mt-6 border-t border-line pt-4 text-center text-sm text-muted">
        <Link href="/login" className="inline-flex min-h-11 items-center font-medium text-wine hover:underline">
          {t.back}
        </Link>
      </p>
    </>
  );
}
