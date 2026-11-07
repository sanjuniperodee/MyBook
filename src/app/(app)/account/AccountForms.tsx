"use client";

import { useActionState, useState } from "react";
import { changePasswordAction, updateProfileAction, type AccountState } from "./actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Alert } from "@/components/ui/Alert";
import { Field } from "@/components/ui/Field";
import { PasswordInput } from "@/app/(auth)/PasswordInput";
import { useMessages } from "@/i18n/client";

/** Профиль: поля не теряются после ошибки (форма после ответа сервера сбрасывается), ошибка стоит у своего поля. */
export function ProfileForm({ name, phone, email }: { name: string; phone: string; email: string }) {
  const [state, action] = useActionState<AccountState, FormData>(updateProfileAction, {});
  const t = useMessages().orders.account;
  const [nameValue, setNameValue] = useState(name);
  const [phoneValue, setPhoneValue] = useState(phone);
  const at = (f: AccountState["field"]) => (state.field === f ? state.error : undefined);
  return (
    <form action={action} className="max-w-lg space-y-4">
      <Field label={t.email} hint={t.emailHint}>
        <input className="input" type="email" value={email} autoComplete="email" disabled readOnly />
      </Field>
      <Field label={t.name} error={at("name")}>
        <input className="input" id="name" name="name" value={nameValue} onChange={(e) => setNameValue(e.target.value)} maxLength={100} autoComplete="name" required />
      </Field>
      <Field label={t.phone} error={at("phone")}>
        <input className="input" id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" value={phoneValue} onChange={(e) => setPhoneValue(e.target.value)} placeholder="+7 7__ ___ __ __" />
      </Field>
      {state.error && !state.field ? <Alert>{state.error}</Alert> : null}
      {state.ok ? <Alert kind="success">{state.ok}</Alert> : null}
      <SubmitButton className="max-sm:w-full">{t.save}</SubmitButton>
    </form>
  );
}

/** Смена пароля: оба поля с кнопкой «показать»; неверный текущий и короткий новый — под своими полями. */
export function PasswordForm({ email }: { email: string }) {
  const [state, action] = useActionState<AccountState, FormData>(changePasswordAction, {});
  const t = useMessages().orders.account;
  const at = (f: AccountState["field"]) => (state.field === f ? state.error : undefined);
  return (
    <form action={action} className="max-w-lg space-y-4">
      {/* Скрытое имя пользователя — менеджер паролей понимает, к какой учётке относится новый пароль. */}
      <input type="email" name="username" autoComplete="username" value={email} className="sr-only" aria-hidden tabIndex={-1} readOnly />
      <Field label={t.current} error={at("current")}>
        <PasswordInput id="current" name="current" autoComplete="current-password" required />
      </Field>
      <Field label={t.next} error={at("next")}>
        <PasswordInput id="next" name="next" autoComplete="new-password" minLength={8} required />
      </Field>
      {state.error && !state.field ? <Alert>{state.error}</Alert> : null}
      {state.ok ? <Alert kind="success">{state.ok}</Alert> : null}
      <SubmitButton className="max-sm:w-full">{t.change}</SubmitButton>
    </form>
  );
}
