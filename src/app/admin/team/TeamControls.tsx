"use client";

import { useActionState, useState, useTransition } from "react";
import { KeyRound, LoaderCircle, ShieldOff } from "lucide-react";
import { createAccountAction, resetPasswordAction, setUserRoleAction, type AdminState } from "../actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Alert } from "@/components/ui/Alert";

export function AccountForm() {
  const [state, action] = useActionState<AdminState, FormData>(createAccountAction, {});
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6 lg:items-end">
      <div className="lg:col-span-2">
        <label className="label">E-mail</label>
        <input name="email" type="email" className="input h-11" placeholder="manager@example.com" required maxLength={200} />
      </div>
      <div>
        <label className="label">Имя</label>
        <input name="name" className="input h-11" maxLength={100} placeholder="Айгерим" />
      </div>
      <div>
        <label className="label">Пароль</label>
        <input name="password" type="text" autoComplete="off" className="input h-11" placeholder="сгенерировать" maxLength={200} />
      </div>
      <div>
        <label className="label">Доступ</label>
        <select name="role" className="input h-11" defaultValue="admin">
          <option value="admin">Администратор (CRM)</option>
          <option value="user">Клиент</option>
        </select>
      </div>
      <div>
        <SubmitButton className="h-11 w-full">Создать / выдать</SubmitButton>
      </div>
      {state.error ? <Alert className="sm:col-span-2 lg:col-span-6">{state.error}</Alert> : null}
      {state.ok ? <Alert kind="success" className="sm:col-span-2 lg:col-span-6 break-all select-all">{state.ok}</Alert> : null}
    </form>
  );
}

export function MemberActions({ userId, isSelf }: { userId: string; isSelf: boolean }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  if (isSelf) return <span className="text-xs text-muted">это вы</span>;
  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex gap-3">
        <button
          className="flex items-center gap-1.5 text-xs text-muted hover:text-ink"
          disabled={pending}
          onClick={() => {
            if (confirm("Сбросить пароль? Пользователь будет разлогинен, новый пароль покажем здесь один раз."))
              start(async () => {
                const res = await resetPasswordAction(userId);
                setMsg({ ok: res.ok, text: res.message });
              });
          }}
        >
          {pending ? <LoaderCircle className="size-3.5 animate-spin" /> : <KeyRound className="size-3.5" />} Сбросить пароль
        </button>
        <button
          className="flex items-center gap-1.5 text-xs text-red-700 hover:text-red-900"
          disabled={pending}
          onClick={() => {
            if (confirm("Снять права администратора? Аккаунт останется обычным клиентским."))
              start(async () => {
                try {
                  await setUserRoleAction(userId, "user");
                } catch (e) {
                  setMsg({ ok: false, text: (e as Error).message });
                }
              });
          }}
        >
          <ShieldOff className="size-3.5" /> Снять доступ
        </button>
      </div>
      {msg ? <p className={`max-w-xs text-right text-xs break-all select-all ${msg.ok ? "text-emerald-700" : "text-red-700"}`}>{msg.text}</p> : null}
    </div>
  );
}
