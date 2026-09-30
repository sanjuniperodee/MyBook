"use client";

import { Link, useMessages } from "@/i18n/client";
import { useActionState } from "react";
import { forgotAction, type FormState } from "../actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Alert } from "@/components/ui/Alert";

export default function ForgotPage() {
  const [state, action] = useActionState<FormState, FormData>(forgotAction, {});
  const { forgot: t, fields: f } = useMessages().auth;
  return (
    <>
      <h1 className="font-serif text-4xl font-medium">{t.title}</h1>
      <p className="mt-2 mb-8 text-muted">{t.text}</p>
      {state.ok ? (
        <Alert kind="success">{state.message}</Alert>
      ) : (
        <form action={action} className="space-y-4">
          {state.error ? <Alert>{state.error}</Alert> : null}
          <div>
            <label className="label" htmlFor="email">{f.email}</label>
            <input className="input" id="email" name="email" type="email" autoComplete="email" required />
          </div>
          <SubmitButton className="btn-lg w-full">{t.submit}</SubmitButton>
        </form>
      )}
      <p className="mt-8 text-center text-sm text-muted">
        <Link href="/login" className="font-medium text-wine hover:underline">{t.back}</Link>
      </p>
    </>
  );
}
