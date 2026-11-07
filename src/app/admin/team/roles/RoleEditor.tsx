"use client";

import { ask, toastError } from "@/components/ui/overlays";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { Lock, Search, Trash2 } from "lucide-react";
import { deleteRoleAction, saveRoleAction, type TeamState } from "../actions";
import { permissionGroups, type Permission } from "@/shared/domain/permissions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/class-names";
import { Badge } from "@/components/ui/Badge";

interface RoleData {
  id: string;
  name: string;
  scope: "all" | "own";
  permissions: Permission[];
  system: boolean;
  locked: boolean;
  members: number;
}

const total = permissionGroups.reduce((n, g) => n + g.items.length, 0);

/**
 * Редактор одной роли. Сверху название и видимость, ниже — матрица прав: группы с счётчиками и «выбрать все», поиск по
 * названию права и фильтр «только выданные». role = null — форма новой роли. Сохраняется всё сразу (кнопка внизу).
 */
export function RoleEditor({ role, isOwnRole }: { role: RoleData | null; isOwnRole: boolean }) {
  const [state, action] = useActionState<TeamState, FormData>(saveRoleAction, {});
  const [perms, setPerms] = useState<Set<string>>(new Set(role?.permissions ?? ["deals.view", "chats.view", "clients.view"]));
  const [q, setQ] = useState("");
  const [onlyOn, setOnlyOn] = useState(false);
  const [pending, start] = useTransition();
  const disabled = !!role?.locked;
  const router = useRouter();
  // Новая роль создана — форма больше не нужна: вторая отправка создала бы дубль. Возвращаемся к списку.
  useEffect(() => {
    if (!role && state.ok) router.replace("/admin/team/roles");
  }, [role, state.ok, router]);

  const toggle = (p: string) => setPerms((s) => (s.has(p) ? new Set([...s].filter((x) => x !== p)) : new Set([...s, p])));
  const setGroup = (items: readonly (readonly [string, string])[], on: boolean) =>
    setPerms((s) => {
      const n = new Set(s);
      for (const [p] of items) {
        if (on) n.add(p);
        else n.delete(p);
      }
      return n;
    });

  const needle = q.trim().toLowerCase();
  const groups = useMemo(
    () =>
      permissionGroups
        .map((g) => ({ g, shown: g.items.filter(([p, label]) => (!needle || label.toLowerCase().includes(needle) || g.label.toLowerCase().includes(needle)) && (!onlyOn || perms.has(p))) }))
        .filter((x) => x.shown.length > 0),
    [needle, onlyOn, perms],
  );

  return (
    <form action={action} className="panel">
      {role ? <input type="hidden" name="id" value={role.id} /> : null}
      {[...perms].map((p) => (
        <input key={p} type="hidden" name="permissions" value={p} />
      ))}
      <div className="flex flex-wrap items-end gap-3 border-b border-line p-4 sm:p-5">
        <div className="min-w-0 flex-1 basis-56">
          <label htmlFor="role-name" className="label">
            {role ? "Название роли" : "Новая роль"}
          </label>
          <input id="role-name" name="name" defaultValue={role?.name ?? ""} placeholder="Например, «Старший менеджер»" required maxLength={60} disabled={disabled} className="input max-w-80 font-medium" />
        </div>
        <div className="flex flex-wrap items-center gap-2 pb-2">
          {role?.system ? (
            <Badge>
              <Lock className="size-3" aria-hidden /> системная
            </Badge>
          ) : null}
          {role ? <span className="text-xs text-muted">сотрудников: {role.members}</span> : null}
        </div>
        {role && !role.system ? (
          <button
            type="button"
            className="btn btn-ghost btn-icon btn-sm ml-auto text-muted hover:text-danger"
            title="Удалить роль"
            disabled={pending}
            aria-label="Удалить роль"
            onClick={async () =>
              (await ask(`Удалить роль «${role.name}»?`, true)) &&
              start(async () => {
                try {
                  await deleteRoleAction(role.id);
                } catch (e) {
                  toastError(e);
                }
              })
            }
          >
            <Trash2 className="size-4" strokeWidth={1.8} />
          </button>
        ) : null}
      </div>

      <fieldset className="border-b border-line p-4 sm:p-5">
        <legend className="sr-only">Видимость</legend>
        <div className="mb-0.5 text-sm font-semibold">Что видит</div>
        <p className="mb-3 text-xs text-muted">Определяет, чьи сделки, чаты и клиентов сотрудник видит; руководитель всегда видит всё.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {(["all", "own"] as const).map((s) => (
            <label key={s} className={cn("flex cursor-pointer items-start gap-2.5 rounded-[var(--r-ctl)] border border-line p-3 text-sm transition-colors hover:border-line-strong has-[:checked]:border-wine/50 has-[:checked]:bg-rose", disabled && "cursor-default opacity-60")}>
              <input type="radio" name="scope" value={s} defaultChecked={(role?.scope ?? "own") === s} disabled={disabled} className="mt-[3px] accent-wine" />
              <span>
                <span className="block font-medium">{s === "all" ? "Видит всё" : "Только свои"}</span>
                <span className="block text-xs text-muted">{s === "all" ? "Все сделки, чаты и клиентов" : "Где он ответственный, плюс неразобранные"}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="p-4 sm:p-5">
        <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3">
          <h3 className="text-sm font-semibold">Права</h3>
          <span className="text-xs text-muted tabular-nums" data-testid="perm-count">
            Выдано {perms.size} из {total}
          </span>
        </div>
        <p className="mb-3 text-xs text-muted">Права проверяются на сервере: скрытая кнопка — не единственная защита.</p>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative min-w-52 flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Найти право: «звонки», «скидки»" aria-label="Найти право" className="input pl-9" />
          </div>
          <button type="button" className="chip" aria-pressed={onlyOn} onClick={() => setOnlyOn((v) => !v)}>
            Только выданные
          </button>
        </div>
        {groups.length === 0 ? (
          <EmptyState compact icon={Search} title="Таких прав нет" action={<button type="button" className="btn btn-outline btn-sm" onClick={() => (setQ(""), setOnlyOn(false))}>Сбросить поиск</button>}>
            Попробуйте другое слово или уберите фильтр.
          </EmptyState>
        ) : (
          <div className="gap-4 xl:columns-2">
            {groups.map(({ g, shown }) => {
              const given = g.items.filter(([p]) => perms.has(p)).length;
              const all = given === g.items.length;
              return (
                <fieldset key={g.label} className="mb-4 break-inside-avoid overflow-hidden rounded-[var(--r-ctl)] border border-line">
                  <legend className="sr-only">{g.label}</legend>
                  <div className="flex items-center gap-2 border-b border-line bg-sunken/70 px-3 py-1.5">
                    <span className="text-sm font-semibold">{g.label}</span>
                    <span className="text-xs text-muted tabular-nums">
                      {given} из {g.items.length}
                    </span>
                    {disabled ? null : (
                      <button type="button" className="btn btn-ghost btn-sm ml-auto" onClick={() => setGroup(g.items, !all)}>
                        {all ? "Снять все" : "Выбрать все"}
                      </button>
                    )}
                  </div>
                  <div className="divide-y divide-line">
                    {shown.map(([p, label]) => (
                      <label key={p} className={cn("flex min-h-10 items-start gap-2.5 px-3 py-2 text-sm", disabled ? "text-muted" : "cursor-pointer hover:bg-sunken/60")} title={p}>
                        <input type="checkbox" className="mt-[3px] size-4 shrink-0 accent-wine" checked={perms.has(p)} disabled={disabled} onChange={() => toggle(p)} />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              );
            })}
          </div>
        )}
      </div>

      {disabled ? (
        <p className="border-t border-line px-4 py-3 text-xs text-muted sm:px-5">У руководителя всегда все права — его нельзя ограничить.</p>
      ) : (
        <div className="sticky bottom-[var(--tabbar-h,0px)] z-[5] flex flex-wrap items-center gap-3 rounded-b-[var(--r-panel)] border-t border-line bg-sunken/95 px-4 py-3 backdrop-blur sm:px-5">
          <SubmitButton>{role ? "Сохранить права" : "Создать роль"}</SubmitButton>
          {isOwnRole ? <span className="text-xs text-muted">Это ваша роль</span> : null}
          {state.error ? (
            <span role="alert" className="text-sm text-danger">
              {state.error}
            </span>
          ) : null}
          {state.ok ? (
            <span role="status" className="text-sm text-success">
              {state.ok}
            </span>
          ) : null}
        </div>
      )}
    </form>
  );
}
