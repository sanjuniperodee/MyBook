"use client";

import { Link, useMessages } from "@/i18n/client";
import { useActionState, useState } from "react";
import { Field } from "@/components/ui/Field";
import { forgotAction, type FormState } from "../actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Alert } from "@/components/ui/Alert";

export default function ForgotPage() {
  const [state, action] = useActionState<FormState, FormData>(forgotAction, {});
  const { forgot: t, fields: f } = useMessages().auth;
  // Почта остаётся в поле после ошибки: форма после ответа сервера сбрасывается.
  const [email, setEmail] = useState("");
  return (
    <>
      <h1 className="font-serif text-[36px] leading-tight font-medium sm:text-4xl">{t.title}</h1>
      <p className="mt-2 mb-8 text-[15px] leading-relaxed text-muted">{t.text}</p>
      {state.ok ? (
        <Alert kind="success">{state.message}</Alert>
      ) : (
        <form action={action} className="space-y-4">
          {state.error ? <Alert>{state.error}</Alert> : null}
          <Field label={f.email}>
            <input className="input" id="email" name="email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          <SubmitButton className="btn-lg w-full">{t.submit}</SubmitButton>
        </form>
      )}
      <p className="mt-8 text-center text-sm text-muted">
        <Link href="/login" className="inline-flex min-h-11 items-center font-medium text-wine hover:underline">
          {t.back}
        </Link>
      </p>
    </>
  );
}
