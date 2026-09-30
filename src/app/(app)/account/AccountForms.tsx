"use client";

import { useActionState } from "react";
import { changePasswordAction, updateProfileAction, type AccountState } from "./actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Alert } from "@/components/ui/Alert";
import { useMessages } from "@/i18n/client";

export function ProfileForm({ name, phone, email }: { name: string; phone: string; email: string }) {
  const [state, action] = useActionState<AccountState, FormData>(updateProfileAction, {});
  const t = useMessages().orders.account;
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label">{t.email}</label>
        <input className="input bg-cream/50" value={email} disabled />
      </div>
      <div>
        <label className="label" htmlFor="name">{t.name}</label>
        <input className="input" id="name" name="name" defaultValue={name} maxLength={100} required />
      </div>
      <div>
        <label className="label" htmlFor="phone">{t.phone}</label>
        <input className="input" id="phone" name="phone" type="tel" defaultValue={phone} placeholder="+7 7__ ___ __ __" />
      </div>
      {state.error ? <Alert>{state.error}</Alert> : null}
      {state.ok ? <Alert kind="success">{state.ok}</Alert> : null}
      <SubmitButton>{t.save}</SubmitButton>
    </form>
  );
}

export function PasswordForm() {
  const [state, action] = useActionState<AccountState, FormData>(changePasswordAction, {});
  const t = useMessages().orders.account;
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label" htmlFor="current">{t.current}</label>
        <input className="input" id="current" name="current" type="password" autoComplete="current-password" required />
      </div>
      <div>
        <label className="label" htmlFor="next">{t.next}</label>
        <input className="input" id="next" name="next" type="password" autoComplete="new-password" minLength={8} required />
      </div>
      {state.error ? <Alert>{state.error}</Alert> : null}
      {state.ok ? <Alert kind="success">{state.ok}</Alert> : null}
      <SubmitButton>{t.change}</SubmitButton>
    </form>
  );
}
