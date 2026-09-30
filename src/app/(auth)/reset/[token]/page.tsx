"use client";

import { use, useActionState } from "react";
import { useMessages } from "@/i18n/client";
import { resetAction, type FormState } from "../../actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Alert } from "@/components/ui/Alert";

export default function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [state, action] = useActionState<FormState, FormData>(resetAction, {});
  const { reset: t, fields: f } = useMessages().auth;
  return (
    <>
      <h1 className="font-serif text-4xl font-medium">{t.title}</h1>
      <p className="mt-2 mb-8 text-muted">{t.text}</p>
      <form action={action} className="space-y-4">
        <input type="hidden" name="token" value={token} />
        {state.error ? <Alert>{state.error}</Alert> : null}
        <div>
          <label className="label" htmlFor="password">{f.newPassword}</label>
          <input className="input" id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
        </div>
        <SubmitButton className="btn-lg w-full">{t.submit}</SubmitButton>
      </form>
    </>
  );
}
