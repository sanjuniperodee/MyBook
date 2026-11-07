"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { KeyRound, LoaderCircle, Plus, Power, Search, ShieldOff, UserRound } from "lucide-react";
import { ask, toast, toastError } from "@/components/ui/overlays";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Facts } from "@/components/ui/Facts";
import { Field } from "@/components/ui/Field";
import { cn } from "@/lib/class-names";
import { createStaffAction, resetStaffPasswordAction, revokeStaffAction, setStaffDisabledAction, setStaffExtensionAction, setStaffPhoneAction, setStaffRoleAction, type TeamState } from "./actions";
import { SidePanel } from "./SidePanel";

export interface Member {
  id: string;
  name: string;
  email: string;
  roleId: string;
  roleName: string;
  extension: string;
  phone: string;
  disabled: boolean;
  onShift: boolean;
  /** Уже отформатированная дата и время последнего входа; null — не входил. */
  lastSeen: string | null;
  openDeals: number;
  calls7d: number;
  isSelf: boolean;
  /** Менять нельзя: это вы или руководитель (а вы не руководитель). */
  locked: boolean;
}

type RoleOption = { id: string; name: string };

function Avatar({ m, size = "size-9" }: { m: Pick<Member, "name" | "email" | "disabled">; size?: string }) {
  const text = (m.name || m.email).trim();
  const initials = text
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  return (
    <span className={cn("grid shrink-0 place-items-center rounded-full bg-sunken text-xs font-semibold text-ink-soft", size, m.disabled && "opacity-50")} aria-hidden>
      {initials || <UserRound className="size-4" />}
    </span>
  );
}

/** Статус сотрудника: отключён / на смене / не на смене — точка и подпись. */
function ShiftBadge({ m }: { m: Pick<Member, "disabled" | "onShift"> }) {
  if (m.disabled) return <Badge tone="danger">отключён</Badge>;
  return m.onShift ? <Badge tone="success">на смене</Badge> : <Badge>не на смене</Badge>;
}

/** Форма приглашения: e-mail, роль и пароль — доступ к CRM появится сразу. Имена полей — как в createStaffAction. */
function StaffForm({ roles }: { roles: RoleOption[] }) {
  const [state, action] = useActionState<TeamState, FormData>(createStaffAction, {});
  const sales = roles.find((r) => r.name === "Менеджер продаж")?.id ?? roles[0]?.id;
  return (
    <form action={action} className="space-y-4">
      <Field label="E-mail" hint="Если e-mail уже зарегистрирован, аккаунт получит доступ к CRM с выбранной ролью.">
        <input name="email" type="email" className="input" placeholder="manager@example.com" required maxLength={200} autoComplete="off" />
      </Field>
      <Field label="Имя" optional>
        <input name="name" className="input" maxLength={100} placeholder="Айгерим" autoComplete="off" />
      </Field>
      <Field label="Роль" hint="Что сотруднику доступно, настраивается во вкладке «Роли и права».">
        <select name="roleId" className="input" required defaultValue={sales}>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Внутренний номер" optional hint="Добавочный в АТС: по нему звонки из CRM идут с телефона сотрудника, а входящие привязываются к нему.">
        <input name="extension" inputMode="numeric" className="input" placeholder="101" maxLength={10} />
      </Field>
      <Field label="Пароль" optional hint="Пустой — сгенерируем и покажем один раз.">
        <input name="password" type="text" autoComplete="off" className="input" placeholder="сгенерировать" maxLength={200} />
      </Field>
      {state.error ? <Alert>{state.error}</Alert> : null}
      {state.ok ? <Alert kind="success">{<span className="break-all select-all">{state.ok}</span>}</Alert> : null}
      <SubmitStaff />
    </form>
  );
}

/** Кнопка внутри формы: состояние отправки берёт из useFormStatus. */
function SubmitStaff() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn btn-primary w-full">
      {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Plus className="size-4" aria-hidden />} Добавить сотрудника
    </button>
  );
}

/** Правка одного сотрудника: роль, номера и опасные действия. Роль, номер и телефон сохраняются сразу при изменении. */
function StaffEditor({ m, roles }: { m: Member; roles: RoleOption[] }) {
  const [pending, start] = useTransition();
  const [ext, setExt] = useState(m.extension);
  const [phone, setPhone] = useState(m.phone);
  const [msg, setMsg] = useState<string | null>(null);
  const run = (fn: () => Promise<unknown>, ok?: string) =>
    start(async () => {
      try {
        const r = await fn();
        if (r && typeof r === "object" && "ok" in r && "message" in r) {
          const res = r as { ok: boolean; message: string };
          toast(res.message, res.ok ? "success" : "error");
        } else if (ok) toast(ok);
      } catch (e) {
        toastError(e);
      }
    });
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Avatar m={m} size="size-12" />
        <div className="min-w-0">
          <div className="truncate font-semibold">{m.name || "Без имени"}</div>
          <div className="truncate text-sm text-muted">{m.email}</div>
        </div>
        <div className="ml-auto shrink-0">
          <ShiftBadge m={m} />
        </div>
      </div>
      <Facts
        items={[
          { label: "Нагрузка", value: `${m.openDeals} открытых сделок, ${m.calls7d} звонков за 7 дней` },
          { label: "Последний вход", value: m.lastSeen ?? "ещё не входил" },
        ]}
      />
      {m.locked ? (
        <Alert kind="info">{m.isSelf ? "Это ваш аккаунт: роль и доступ меняет другой руководитель." : "Аккаунт руководителя меняет только руководитель."}</Alert>
      ) : null}
      <fieldset className="space-y-4" disabled={m.locked || pending}>
        <legend className="mb-3 text-sm font-semibold">Роль и связь</legend>
        <Field label="Роль" hint="Меняется сразу, права — во вкладке «Роли и права».">
          <select className="input" value={m.roleId} onChange={(e) => run(() => setStaffRoleAction(m.id, e.target.value), "Роль изменена")}>
            {!roles.some((r) => r.id === m.roleId) ? <option value={m.roleId}>{m.roleName || "—"}</option> : null}
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Внутренний номер" hint="Добавочный в АТС: по нему звонки из CRM идут с телефона сотрудника.">
          <input className="input tabular-nums" inputMode="numeric" value={ext} maxLength={10} placeholder="—" onChange={(e) => setExt(e.target.value.replace(/\D/g, ""))} onBlur={() => ext !== m.extension && run(() => setStaffExtensionAction(m.id, ext), "Номер сохранён")} />
        </Field>
        <Field label="Телефон (WhatsApp)" hint="На него приходят личные напоминания о задачах.">
          <input className="input tabular-nums" inputMode="tel" value={phone} maxLength={20} placeholder="+7 7__ ___ __ __" onChange={(e) => setPhone(e.target.value)} onBlur={() => phone !== m.phone && run(() => setStaffPhoneAction(m.id, phone))} />
        </Field>
      </fieldset>
      {m.locked ? null : (
        <div className="space-y-2 border-t border-line pt-4">
          <div className="text-sm font-semibold">Доступ</div>
          <div className="flex flex-col gap-2">
            <button
              className="btn btn-outline justify-start"
              disabled={pending}
              onClick={async () => {
                if (await ask("Сбросить пароль? Сотрудник будет разлогинен, новый пароль покажем здесь один раз."))
                  start(async () => {
                    const res = await resetStaffPasswordAction(m.id);
                    setMsg(res.message);
                  });
              }}
            >
              {pending ? <LoaderCircle className="size-4 animate-spin" /> : <KeyRound className="size-4" />} Сбросить пароль
            </button>
            <button
              className="btn btn-outline justify-start"
              disabled={pending}
              onClick={async () => (await ask(m.disabled ? "Включить доступ обратно?" : "Отключить сотрудника? Он сразу потеряет доступ к CRM, данные останутся.")) && run(() => setStaffDisabledAction(m.id, !m.disabled))}
            >
              <Power className="size-4" /> {m.disabled ? "Включить доступ" : "Отключить сотрудника"}
            </button>
            <button className="btn btn-ghost justify-start text-danger hover:bg-danger-bg hover:text-danger" disabled={pending} onClick={async () => (await ask("Забрать доступ к CRM? Аккаунт станет обычным клиентским.", true)) && run(() => revokeStaffAction(m.id), "Доступ снят")}>
              <ShieldOff className="size-4" /> Убрать из команды
            </button>
          </div>
          {msg ? <p className="rounded-[var(--r-ctl)] bg-success-bg px-3 py-2 text-sm break-all text-success select-all">{msg}</p> : null}
        </div>
      )}
    </div>
  );
}

type Filter = "all" | "shift" | "off";

/**
 * Ведомость сотрудников: поиск, фильтр по смене и отключённым, таблица на ноутбуке и карточки на телефоне. Правка и
 * приглашение — в боковой панели (на телефоне шторка), список остаётся перед глазами.
 */
export function StaffBoard({ members, roles, inviteRoles }: { members: Member[]; roles: RoleOption[]; inviteRoles: RoleOption[] }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [editing, setEditing] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const counts = useMemo(() => ({ all: members.length, shift: members.filter((m) => m.onShift && !m.disabled).length, off: members.filter((m) => m.disabled).length }), [members]);
  const rows = members.filter((m) => {
    if (filter === "shift" && !(m.onShift && !m.disabled)) return false;
    if (filter === "off" && !m.disabled) return false;
    const t = q.trim().toLowerCase();
    return !t || m.name.toLowerCase().includes(t) || m.email.toLowerCase().includes(t) || m.roleName.toLowerCase().includes(t) || m.extension.includes(t);
  });
  const current = members.find((m) => m.id === editing) ?? null;
  const chips: [Filter, string][] = [
    ["all", "Все"],
    ["shift", "На смене"],
    ["off", "Отключённые"],
  ];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Имя, e-mail, роль, номер" aria-label="Найти сотрудника" className="input pl-9" />
        </div>
        <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
          {chips.map(([k, label]) => (
            <button key={k} type="button" className="chip" aria-pressed={filter === k} onClick={() => setFilter(k)}>
              {label} <span className="tabular-nums opacity-70">{counts[k]}</span>
            </button>
          ))}
        </div>
        <button type="button" className="btn btn-primary ml-auto max-sm:w-full" onClick={() => setInviting(true)}>
          <Plus className="size-4" aria-hidden /> Пригласить сотрудника
        </button>
      </div>

      <section className="panel overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState compact icon={UserRound} title={members.length ? "Никого не нашли" : "В команде пока никого нет"} action={members.length ? <button className="btn btn-outline btn-sm" onClick={() => (setQ(""), setFilter("all"))}>Сбросить фильтры</button> : <button className="btn btn-dark btn-sm" onClick={() => setInviting(true)}>Пригласить сотрудника</button>}>
            {members.length ? "Измените запрос или уберите фильтр." : "Добавьте первого сотрудника: ему нужны только e-mail и роль."}
          </EmptyState>
        ) : (
          <>
            <table className="table max-lg:hidden" data-testid="staff-table">
              <thead>
                <tr>
                  <th>Сотрудник</th>
                  <th>Роль</th>
                  <th>Смена</th>
                  <th className="num">Сделок</th>
                  <th className="num">Звонков за 7 дн.</th>
                  <th>Последний вход</th>
                  <th>
                    <span className="sr-only">Действия</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m.id} className={cn(m.disabled && "text-muted")}>
                    <td>
                      <button type="button" className="flex min-w-0 items-center gap-3 text-left" onClick={() => setEditing(m.id)}>
                        <Avatar m={m} />
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-ink">
                            {m.name || "Без имени"} {m.isSelf ? <span className="font-normal text-muted">(это вы)</span> : null}
                          </span>
                          <span className="block truncate text-xs text-muted">{m.email}</span>
                        </span>
                      </button>
                    </td>
                    <td>{m.roleName || "—"}</td>
                    <td>
                      <ShiftBadge m={m} />
                    </td>
                    <td className="num">{m.openDeals}</td>
                    <td className="num">{m.calls7d}</td>
                    <td className="whitespace-nowrap text-muted">{m.lastSeen ?? "не входил"}</td>
                    <td className="text-right">
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(m.id)}>
                        Изменить
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ul className="divide-y divide-line lg:hidden" data-testid="staff-cards">
              {rows.map((m) => (
                <li key={m.id}>
                  <button type="button" className="flex w-full items-center gap-3 px-4 py-3 text-left" onClick={() => setEditing(m.id)}>
                    <Avatar m={m} size="size-11" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {m.name || "Без имени"} {m.isSelf ? <span className="font-normal text-muted">(это вы)</span> : null}
                      </span>
                      <span className="block truncate text-xs text-muted">{m.roleName || m.email}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
                        <ShiftBadge m={m} />
                        <span>{m.openDeals} сделок</span>
                        <span>{m.lastSeen ?? "не входил"}</span>
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <footer className="border-t border-line px-4 py-2.5 text-xs text-muted sm:px-5">
              Показано {rows.length} из {members.length}. Роль, внутренний номер и телефон сохраняются сразу при изменении.
            </footer>
          </>
        )}
      </section>

      <SidePanel open={!!current} onClose={() => setEditing(null)} title="Сотрудник" description="Изменения сохраняются сразу">
        {current ? <StaffEditor key={current.id} m={current} roles={roles} /> : null}
      </SidePanel>
      <SidePanel open={inviting} onClose={() => setInviting(false)} title="Пригласить сотрудника" description="Доступ к CRM появится сразу">
        <StaffForm roles={inviteRoles} />
      </SidePanel>
    </div>
  );
}
