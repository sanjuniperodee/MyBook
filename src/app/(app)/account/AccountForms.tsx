"use client";

import { useActionState } from "react";
import { changePasswordAction, updateProfileAction, type AccountState } from "./actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Alert } from "@/components/ui/Alert";

export function ProfileForm({ name, phone, email }: { name: string; phone: string; email: string }) {
  const [state, action] = useActionState<AccountState, FormData>(updateProfileAction, {});
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label">E-mail</label>
        <input className="input bg-cream/50" value={email} disabled />
      </div>
      <div>
        <label className="label" htmlFor="name">Имя</label>
        <input className="input" id="name" name="name" defaultValue={name} maxLength={100} required />
      </div>
      <div>
        <label className="label" htmlFor="phone">Телефон</label>
        <input className="input" id="phone" name="phone" type="tel" defaultValue={phone} placeholder="+7 7__ ___ __ __" />
      </div>
      {state.error ? <Alert>{state.error}</Alert> : null}
      {state.ok ? <Alert kind="success">{state.ok}</Alert> : null}
      <SubmitButton>Сохранить</SubmitButton>
    </form>
  );
}

export function PasswordForm() {
  const [state, action] = useActionState<AccountState, FormData>(changePasswordAction, {});
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label" htmlFor="current">Текущий пароль</label>
        <input className="input" id="current" name="current" type="password" autoComplete="current-password" required />
      </div>
      <div>
        <label className="label" htmlFor="next">Новый пароль</label>
        <input className="input" id="next" name="next" type="password" autoComplete="new-password" minLength={8} required />
      </div>
      {state.error ? <Alert>{state.error}</Alert> : null}
      {state.ok ? <Alert kind="success">{state.ok}</Alert> : null}
      <SubmitButton>Сменить пароль</SubmitButton>
    </form>
  );
}
