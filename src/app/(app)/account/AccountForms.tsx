"use client";

import { useActionState } from "react";
import { changePasswordAction, updateProfileAction, type AccountState } from "./actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Alert } from "@/components/ui/Alert";
import { Field } from "@/components/ui/Field";
import { useMessages } from "@/i18n/client";

export function ProfileForm({ name, phone, email }: { name: string; phone: string; email: string }) {
  const [state, action] = useActionState<AccountState, FormData>(updateProfileAction, {});
  const t = useMessages().orders.account;
  return (
    <form action={action} className="space-y-4">
      <Field label={t.email}>
        <input className="input" type="email" value={email} autoComplete="email" disabled />
      </Field>
      <Field label={t.name}>
        <input className="input" id="name" name="name" defaultValue={name} maxLength={100} autoComplete="name" required />
      </Field>
      <Field label={t.phone}>
        <input className="input" id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" defaultValue={phone} placeholder="+7 7__ ___ __ __" />
      </Field>
      {state.error ? <Alert>{state.error}</Alert> : null}
      {state.ok ? <Alert kind="success">{state.ok}</Alert> : null}
      <SubmitButton>{t.save}</SubmitButton>
    </form>
  );
}

export function PasswordForm({ email }: { email: string }) {
  const [state, action] = useActionState<AccountState, FormData>(changePasswordAction, {});
  const t = useMessages().orders.account;
  return (
    <form action={action} className="space-y-4">
      {/* Скрытое имя пользователя — менеджер паролей понимает, к какой учётке относится новый пароль. */}
      <input type="email" name="username" autoComplete="username" value={email} className="sr-only" aria-hidden tabIndex={-1} readOnly />
      <Field label={t.current}>
        <input className="input" id="current" name="current" type="password" autoComplete="current-password" required />
      </Field>
      <Field label={t.next}>
        <input className="input" id="next" name="next" type="password" autoComplete="new-password" minLength={8} required />
      </Field>
      {state.error ? <Alert>{state.error}</Alert> : null}
      {state.ok ? <Alert kind="success">{state.ok}</Alert> : null}
      <SubmitButton>{t.change}</SubmitButton>
    </form>
  );
}
