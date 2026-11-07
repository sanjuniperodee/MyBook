"use client";

import { ask, toastError } from "@/components/ui/overlays";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState, useTransition } from "react";
import { Lock, Trash2 } from "lucide-react";
import { deleteRoleAction, saveRoleAction, type TeamState } from "../actions";
import { permissionGroups, type Permission } from "@/shared/domain/permissions";
import { SubmitButton } from "@/components/ui/SubmitButton";
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

/** Редактор одной роли с матрицей прав. role = null — форма новой роли. */
export function RoleEditor({
  role,
  isOwnRole,
}: {
  role: RoleData | null;
  isOwnRole: boolean;
}) {
  const [state, action] = useActionState<TeamState, FormData>(
    saveRoleAction,
    {},
  );
  const [perms, setPerms] = useState<Set<string>>(
    new Set(role?.permissions ?? ["deals.view", "chats.view", "clients.view"]),
  );
  const [pending, start] = useTransition();
  const disabled = !!role?.locked;
  const router = useRouter();
  // Новая роль создана — форма больше не нужна: вторая отправка создала бы дубль. Возвращаемся к списку.
  useEffect(() => {
    if (!role && state.ok) router.replace("/admin/team/roles");
  }, [role, state.ok, router]);

  const toggle = (p: string) =>
    setPerms((s) =>
      s.has(p) ? new Set([...s].filter((x) => x !== p)) : new Set([...s, p]),
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
          <input
            id="role-name"
            name="name"
            defaultValue={role?.name ?? ""}
            placeholder="Например, «Старший менеджер»"
            required
            maxLength={60}
            disabled={disabled}
            className="input h-10 max-w-80 font-medium"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 pb-2">
          {role?.system ? (
            <Badge>
              <Lock className="size-3" aria-hidden /> системная
            </Badge>
          ) : null}
          {role ? (
            <span className="text-xs text-muted">
              сотрудников: {role.members}
            </span>
          ) : null}
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
        <div className="mb-2 text-sm font-semibold">Что видит</div>
        <div className="grid gap-2 sm:grid-cols-2">
          {(["all", "own"] as const).map((s) => (
            <label
              key={s}
              className={cn(
                "flex cursor-pointer items-start gap-2.5 rounded-[10px] border border-line p-3 text-sm transition-colors hover:border-line-strong has-[:checked]:border-wine/50 has-[:checked]:bg-rose/40",
                disabled && "cursor-default opacity-60",
              )}
            >
              <input
                type="radio"
                name="scope"
                value={s}
                defaultChecked={(role?.scope ?? "own") === s}
                disabled={disabled}
                className="mt-0.5 accent-wine"
              />
              <span>
                <span className="block font-medium">
                  {s === "all" ? "Видит всё" : "Только свои"}
                </span>
                <span className="block text-xs text-muted">
                  {s === "all"
                    ? "Все сделки, чаты и клиентов"
                    : "Где он ответственный, плюс неразобранные"}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-x-8 gap-y-6 p-4 sm:grid-cols-2 sm:p-5">
        {permissionGroups.map((g) => (
          <fieldset key={g.label}>
            <legend className="mb-2 flex w-full items-baseline justify-between gap-2 text-sm font-semibold">
              {g.label}
              <span className="text-xs font-normal text-muted tabular-nums">
                {g.items.filter(([p]) => perms.has(p)).length} из{" "}
                {g.items.length}
              </span>
            </legend>
            <div className="space-y-0.5">
              {g.items.map(([p, label]) => (
                <label
                  key={p}
                  className={cn(
                    "-mx-2 flex min-h-9 items-start gap-2.5 rounded-lg px-2 py-1.5 text-sm",
                    disabled
                      ? "text-muted"
                      : "cursor-pointer hover:bg-sunken/60",
                  )}
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4 accent-wine"
                    checked={perms.has(p)}
                    disabled={disabled}
                    onChange={() => toggle(p)}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </div>
      {disabled ? (
        <p className="border-t border-line px-4 py-3 text-xs text-muted sm:px-5">
          У руководителя всегда все права — его нельзя ограничить.
        </p>
      ) : (
        <div className="sticky bottom-[var(--tabbar-h,0px)] flex flex-wrap items-center gap-3 rounded-b-[14px] border-t border-line bg-white/95 px-4 py-3 backdrop-blur sm:px-5">
          <SubmitButton className="h-10 text-sm">
            {role ? "Сохранить права" : "Создать роль"}
          </SubmitButton>
          {isOwnRole ? (
            <span className="text-xs text-muted">Это ваша роль</span>
          ) : null}
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
