"use client";

import { ask, toast, toastError } from "@/components/ui/overlays";
import { useActionState, useState, useTransition } from "react";
import { KeyRound, LoaderCircle, Power, ShieldOff } from "lucide-react";
import { createStaffAction, resetStaffPasswordAction, revokeStaffAction, setStaffDisabledAction, setStaffExtensionAction, setStaffPhoneAction, setStaffRoleAction, type TeamState } from "./actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Alert } from "@/components/ui/Alert";
import { cn } from "@/lib/class-names";
import { Badge } from "@/components/ui/Badge";

export function StaffForm({ roles }: { roles: { id: string; name: string }[] }) {
  const [state, action] = useActionState<TeamState, FormData>(createStaffAction, {});
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-7 lg:items-end">
      <div className="lg:col-span-2">
        <label className="label" htmlFor="staff-email">E-mail</label>
        <input id="staff-email" name="email" type="email" className="input h-10 text-sm" placeholder="manager@example.com" required maxLength={200} />
      </div>
      <div>
        <label className="label" htmlFor="staff-name">Имя</label>
        <input id="staff-name" name="name" className="input h-10 text-sm" maxLength={100} placeholder="Айгерим" />
      </div>
      <div>
        <label className="label" htmlFor="staff-role">Роль</label>
        <select id="staff-role" name="roleId" className="input h-10 text-sm" required defaultValue={roles.find((r) => r.name === "Менеджер продаж")?.id ?? roles[0]?.id}>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="staff-ext">Внутр. номер</label>
        <input id="staff-ext" name="extension" inputMode="numeric" className="input h-10 text-sm" placeholder="101" maxLength={10} />
      </div>
      <div>
        <label className="label" htmlFor="staff-password">Пароль</label>
        <input id="staff-password" name="password" type="text" autoComplete="off" className="input h-10 text-sm" placeholder="сгенерировать" maxLength={200} />
      </div>
      <div>
        <SubmitButton className="h-10 w-full text-sm">Добавить</SubmitButton>
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
  phone: string;
  disabled: boolean;
  lastSeen: string;
  load: string;
}

export function StaffRow({ member: m, roles, isSelf, canTouchOwner, isOwner }: { member: Member; roles: { id: string; name: string }[]; isSelf: boolean; canTouchOwner: boolean; isOwner: boolean }) {
  const [pending, start] = useTransition();
  const [ext, setExt] = useState(m.extension);
  const [phone, setPhone] = useState(m.phone);
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
    <tr className={cn("max-lg:block max-lg:space-y-3 max-lg:px-4 max-lg:py-4 [&>td]:max-lg:border-0", m.disabled && "bg-sunken/40 text-muted")}>
      <td className="max-lg:block max-lg:p-0">
        <div className="font-medium">
          {m.name || "—"} {isSelf ? <Badge className="ml-1 font-normal">это вы</Badge> : null}
          {m.disabled ? <Badge tone="danger" className="ml-1 font-normal">отключён</Badge> : null}
        </div>
        <div className="text-xs text-muted">{m.email}</div>
      </td>
      <td className="max-lg:block max-lg:p-0">
        <select className="input h-10 min-w-40 text-sm max-lg:w-full lg:h-9" value={m.roleId} disabled={locked || pending} onChange={(e) => run(() => setStaffRoleAction(m.id, e.target.value), "Роль изменена")} aria-label="Роль">
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </td>
      <td className="max-lg:block max-lg:p-0">
        <span className="mb-1 block text-xs text-muted lg:hidden">Внутренний номер</span>
        <input
          className="input h-10 w-24 text-sm tabular-nums max-lg:w-full lg:h-9"
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
      <td className="max-lg:block max-lg:p-0">
        <span className="mb-1 block text-xs text-muted lg:hidden">Телефон (WhatsApp)</span>
        <input
          className="input h-10 w-40 text-sm tabular-nums max-lg:w-full lg:h-9"
          inputMode="tel"
          value={phone}
          maxLength={20}
          placeholder="+7 7__ ___ __ __"
          disabled={pending}
          onChange={(e) => setPhone(e.target.value)}
          onBlur={() => phone !== m.phone && run(() => setStaffPhoneAction(m.id, phone), "Телефон сохранён")}
          aria-label="Телефон сотрудника для напоминаний в WhatsApp"
        />
      </td>
      <td className="text-xs text-muted max-lg:block max-lg:p-0">{m.load}</td>
      <td className="text-xs whitespace-nowrap text-muted max-lg:block max-lg:p-0">
        <span className="lg:hidden">Последний вход: </span>
        {m.lastSeen}
      </td>
      <td className="max-lg:block max-lg:p-0">
        {locked ? null : (
          <div className="flex flex-col items-end gap-1.5 max-lg:items-stretch">
            <div className="flex flex-wrap justify-end gap-1 max-lg:justify-start">
              <button
                className="btn btn-ghost btn-sm text-xs"
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
                className="btn btn-ghost btn-sm text-xs"
                disabled={pending}
                onClick={async () => (await ask(m.disabled ? "Включить доступ обратно?" : "Отключить сотрудника? Он сразу потеряет доступ к CRM, данные останутся.")) && run(() => setStaffDisabledAction(m.id, !m.disabled))}
              >
                <Power className="size-3.5" /> {m.disabled ? "Включить" : "Отключить"}
              </button>
              <button
                className="btn btn-ghost btn-sm text-xs text-danger hover:bg-danger-bg hover:text-danger"
                disabled={pending}
                onClick={async () => (await ask("Забрать доступ к CRM? Аккаунт станет обычным клиентским.", true)) && run(() => revokeStaffAction(m.id), "Доступ снят")}
              >
                <ShieldOff className="size-3.5" /> Убрать из команды
              </button>
            </div>
            {msg ? <p className="max-w-xs text-right max-lg:text-left text-xs break-all text-success select-all">{msg}</p> : null}
          </div>
        )}
      </td>
    </tr>
  );
}
