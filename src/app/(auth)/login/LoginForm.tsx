"use client";

import { Link, useMessages } from "@/i18n/client";
import { useActionState } from "react";
import { loginAction, type FormState } from "../actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Alert } from "@/components/ui/Alert";

export function LoginForm({ next }: { next?: string }) {
  const [state, action] = useActionState<FormState, FormData>(loginAction, {});
  const { login: t, fields: f } = useMessages().auth;
  return (
    <form action={action} className="space-y-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}
      {state.error ? <Alert>{state.error}</Alert> : null}
      <div>
        <label className="label" htmlFor="email">{f.login}</label>
        <input className="input" id="email" name="email" type="text" autoComplete="username" autoCapitalize="none" spellCheck={false} required />
      </div>
      <div>
        <div className="flex items-center justify-between">
          <label className="label" htmlFor="password">{f.password}</label>
          <Link href="/forgot" className="mb-1.5 text-sm text-wine hover:underline">{t.forgot}</Link>
        </div>
        <input className="input" id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      <SubmitButton className="btn-lg w-full" pendingText={t.pending}>{t.submit}</SubmitButton>
    </form>
  );
}
