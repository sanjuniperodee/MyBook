"use client";

import { ask, toast, toastError } from "@/components/ui/overlays";
import { useActionState, useState, useTransition } from "react";
import { KeyRound, LoaderCircle, Power, ShieldOff } from "lucide-react";
import { createStaffAction, resetStaffPasswordAction, revokeStaffAction, setStaffDisabledAction, setStaffExtensionAction, setStaffRoleAction, type TeamState } from "./actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Alert } from "@/components/ui/Alert";
import { cn } from "@/lib/utils";

export function StaffForm({ roles }: { roles: { id: string; name: string }[] }) {
  const [state, action] = useActionState<TeamState, FormData>(createStaffAction, {});
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-7 lg:items-end">
      <div className="lg:col-span-2">
        <label className="label">E-mail</label>
        <input name="email" type="email" className="input h-11" placeholder="manager@example.com" required maxLength={200} />
      </div>
      <div>
        <label className="label">Имя</label>
        <input name="name" className="input h-11" maxLength={100} placeholder="Айгерим" />
      </div>
      <div>
        <label className="label">Роль</label>
        <select name="roleId" className="input h-11" required defaultValue={roles.find((r) => r.name === "Менеджер продаж")?.id ?? roles[0]?.id}>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Внутр. номер</label>
        <input name="extension" inputMode="numeric" className="input h-11" placeholder="101" maxLength={10} />
      </div>
      <div>
        <label className="label">Пароль</label>
        <input name="password" type="text" autoComplete="off" className="input h-11" placeholder="сгенерировать" maxLength={200} />
      </div>
      <div>
        <SubmitButton className="h-11 w-full">Добавить</SubmitButton>
      </div>
      {state.error ? <Alert className="sm:col-span-2 lg:col-span-7">{state.error}</Alert> : null}
      {state.ok ? <Alert kind="success" className="break-all select-all sm:col-span-2 lg:col-span-7">{state.ok}</Alert> : null}
    </form>
  );
}

interface Member {
  id: string;
  name: string;
  email: string;
  roleId: string;
  extension: string;
  disabled: boolean;
  lastSeen: string;
  load: string;
}

export function StaffRow({ member: m, roles, isSelf, canTouchOwner, isOwner }: { member: Member; roles: { id: string; name: string }[]; isSelf: boolean; canTouchOwner: boolean; isOwner: boolean }) {
  const [pending, start] = useTransition();
  const [ext, setExt] = useState(m.extension);
  const [msg, setMsg] = useState<string | null>(null);
  const locked = isSelf || (isOwner && !canTouchOwner);
  const run = (fn: () => Promise<unknown>, ok?: string) =>
    start(async () => {
      try {
        await fn();
        if (ok) toast(ok);
      } catch (e) {
        toastError(e);
      }
    });

  return (
    <tr className={cn(m.disabled && "bg-cream/40 text-muted")}>
      <td className="px-4 py-3">
        <div className="font-medium">
          {m.name || "—"} {isSelf ? <span className="ml-1 rounded-full bg-cream px-2 py-0.5 text-[11px] font-normal text-muted">это вы</span> : null}
          {m.disabled ? <span className="ml-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-normal text-red-700">отключён</span> : null}
        </div>
        <div className="text-xs text-muted">{m.email}</div>
      </td>
      <td className="px-4 py-3">
        <select className="input h-9 min-w-40 text-sm" value={m.roleId} disabled={locked || pending} onChange={(e) => run(() => setStaffRoleAction(m.id, e.target.value), "Роль изменена")} aria-label="Роль">
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </td>
      <td className="px-4 py-3">
        <input
          className="input h-9 w-24 text-sm"
          inputMode="numeric"
          value={ext}
          maxLength={10}
          placeholder="—"
          disabled={pending}
          onChange={(e) => setExt(e.target.value.replace(/\D/g, ""))}
          onBlur={() => ext !== m.extension && run(() => setStaffExtensionAction(m.id, ext), "Номер сохранён")}
          aria-label="Внутренний номер"
        />
      </td>
      <td className="px-4 py-3 text-xs text-muted">{m.load}</td>
      <td className="px-4 py-3 text-xs text-muted">{m.lastSeen}</td>
      <td className="px-4 py-3">
        {locked ? null : (
          <div className="flex flex-col items-end gap-1.5">
            <div className="flex flex-wrap justify-end gap-3">
              <button
                className="flex items-center gap-1.5 text-xs text-muted hover:text-ink"
                disabled={pending}
                onClick={async () => {
                  if (await ask("Сбросить пароль? Сотрудник будет разлогинен, новый пароль покажем здесь один раз."))
                    start(async () => {
                      const res = await resetStaffPasswordAction(m.id);
                      setMsg(res.message);
                    });
                }}
              >
                {pending ? <LoaderCircle className="size-3.5 animate-spin" /> : <KeyRound className="size-3.5" />} Пароль
              </button>
              <button
                className="flex items-center gap-1.5 text-xs text-muted hover:text-ink"
                disabled={pending}
                onClick={async () => (await ask(m.disabled ? "Включить доступ обратно?" : "Отключить сотрудника? Он сразу потеряет доступ к CRM, данные останутся.")) && run(() => setStaffDisabledAction(m.id, !m.disabled))}
              >
                <Power className="size-3.5" /> {m.disabled ? "Включить" : "Отключить"}
              </button>
              <button
                className="flex items-center gap-1.5 text-xs text-red-700 hover:text-red-900"
                disabled={pending}
                onClick={async () => (await ask("Забрать доступ к CRM? Аккаунт станет обычным клиентским.", true)) && run(() => revokeStaffAction(m.id), "Доступ снят")}
              >
                <ShieldOff className="size-3.5" /> Убрать из команды
              </button>
            </div>
            {msg ? <p className="max-w-xs text-right text-xs break-all text-emerald-700 select-all">{msg}</p> : null}
          </div>
        )}
      </td>
    </tr>
  );
}
