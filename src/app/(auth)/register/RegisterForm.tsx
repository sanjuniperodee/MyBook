"use client";

import { Link, useMessages } from "@/i18n/client";
import { useActionState, useEffect, useState } from "react";
import { registerAction, type FormState } from "../actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Alert } from "@/components/ui/Alert";
import { Field } from "@/components/ui/Field";
import { PasswordInput } from "../PasswordInput";

/** Регистрация: имя и почта не теряются после ошибки сервера; пароль можно показать; ошибка стоит у своего поля; согласие — одной строкой у кнопки. */
export function RegisterForm({ theme }: { theme?: string }) {
  const [state, action] = useActionState<FormState, FormData>(registerAction, {});
  const { register: t, fields: f } = useMessages().auth;
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  // Согласие, как имя и почта, не сбрасывается ответом сервера: иначе после ошибки в пароле его пришлось бы ставить заново.
  const [consent, setConsent] = useState(false);
  const at = (field: FormState["field"]) => (state.field === field ? state.error : undefined);
  useEffect(() => {
    if (state.field) document.getElementById(state.field)?.focus();
  }, [state]);
  return (
    <form action={action} className="space-y-4">
      {theme ? <input type="hidden" name="theme" value={theme} /> : null}
      {state.error && !state.field ? <Alert>{state.error}</Alert> : null}
      <Field label={f.name} error={at("name")}>
        <input className="input" id="name" name="name" autoComplete="given-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} />
      </Field>
      <Field label={f.email} error={at("email")}>
        <input className="input" id="email" name="email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} value={email} onChange={(e) => setEmail(e.target.value)} required />
      </Field>
      <Field label={f.password} hint={f.passwordHint} error={at("password")}>
        <PasswordInput id="password" name="password" autoComplete="new-password" minLength={8} required />
      </Field>
      <div>
        <label className="flex cursor-pointer items-start gap-2.5 py-1 text-sm leading-relaxed text-muted">
          <input type="checkbox" id="consent" name="consent" checked={consent} onChange={(e) => setConsent(e.target.checked)} required aria-invalid={state.field === "consent" ? true : undefined} aria-describedby={state.field === "consent" ? "consent-error" : undefined} className="mt-1 size-4 shrink-0 accent-wine" />
          <span>
            {t.consentStart}{" "}
            <Link href="/offer" target="_blank" className="text-wine underline underline-offset-2">
              {t.consentOffer}
            </Link>{" "}
            {t.consentAnd}{" "}
            <Link href="/privacy" target="_blank" className="text-wine underline underline-offset-2">
              {t.consentPrivacy}
            </Link>
          </span>
        </label>
        {state.field === "consent" ? (
          <span id="consent-error" className="field-error" role="alert">
            {state.error}
          </span>
        ) : null}
      </div>
      <SubmitButton className="btn-lg w-full" pendingText={t.pending}>
        {t.submit}
      </SubmitButton>
    </form>
  );
}
