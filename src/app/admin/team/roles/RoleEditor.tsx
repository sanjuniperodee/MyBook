"use client";

import { ask, toastError } from "@/components/ui/overlays";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState, useTransition } from "react";
import { Lock, Trash2 } from "lucide-react";
import { deleteRoleAction, saveRoleAction, type TeamState } from "../actions";
import { permissionGroups, type Permission } from "@/shared/domain/permissions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { cn } from "@/lib/class-names";

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
export function RoleEditor({ role, isOwnRole }: { role: RoleData | null; isOwnRole: boolean }) {
  const [state, action] = useActionState<TeamState, FormData>(saveRoleAction, {});
  const [perms, setPerms] = useState<Set<string>>(new Set(role?.permissions ?? ["deals.view", "chats.view", "clients.view"]));
  const [pending, start] = useTransition();
  const disabled = !!role?.locked;
  const router = useRouter();
  // Новая роль создана — форма больше не нужна: вторая отправка создала бы дубль. Возвращаемся к списку.
  useEffect(() => {
    if (!role && state.ok) router.replace("/admin/team/roles");
  }, [role, state.ok, router]);

  const toggle = (p: string) => setPerms((s) => (s.has(p) ? new Set([...s].filter((x) => x !== p)) : new Set([...s, p])));
  return (
    <form action={action} className="rounded-2xl border border-line bg-white p-5 sm:p-6">
      {role ? <input type="hidden" name="id" value={role.id} /> : null}
      {[...perms].map((p) => (
        <input key={p} type="hidden" name="permissions" value={p} />
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <input name="name" defaultValue={role?.name ?? ""} placeholder="Название роли" required maxLength={60} disabled={disabled} className="input h-10 max-w-64 font-semibold" />
        {role?.system ? (
          <span className="flex items-center gap-1 rounded-full bg-cream px-2.5 py-1 text-xs text-muted">
            <Lock className="size-3" /> системная
          </span>
        ) : null}
        {role ? <span className="text-xs text-muted">сотрудников: {role.members}</span> : null}
        {role && !role.system ? (
          <button
            type="button"
            className="ml-auto text-muted hover:text-red-700"
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
            <Trash2 className="size-4" />
          </button>
        ) : null}
      </div>
      <div className="mt-4 flex gap-2 text-sm">
        {(["all", "own"] as const).map((s) => (
          <label key={s} className={cn("flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2", disabled && "cursor-default opacity-60")}>
            <input type="radio" name="scope" value={s} defaultChecked={(role?.scope ?? "own") === s} disabled={disabled} className="accent-wine" />
            {s === "all" ? "Видит всё" : "Только свои"}
          </label>
        ))}
      </div>
      <div className="mt-6 grid gap-x-8 gap-y-6 border-t border-line pt-5 sm:grid-cols-2">
        {permissionGroups.map((g) => (
          <fieldset key={g.label}>
            <legend className="mb-1.5 flex w-full items-baseline justify-between text-xs font-semibold tracking-wide text-muted uppercase">
              {g.label}
              <span className="font-normal tracking-normal normal-case tabular-nums">
                {g.items.filter(([p]) => perms.has(p)).length} из {g.items.length}
              </span>
            </legend>
            <div className="space-y-1">
              {g.items.map(([p, label]) => (
                <label key={p} className={cn("flex items-start gap-2 text-sm", disabled ? "text-muted" : "cursor-pointer")}>
                  <input type="checkbox" className="mt-0.5 size-4 accent-wine" checked={perms.has(p)} disabled={disabled} onChange={() => toggle(p)} />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </div>
      {disabled ? (
        <p className="mt-4 text-xs text-muted">У руководителя всегда все права — его нельзя ограничить.</p>
      ) : (
        <div className="mt-5 flex items-center gap-3">
          <SubmitButton className="btn-sm">{role ? "Сохранить" : "Создать роль"}</SubmitButton>
          {isOwnRole ? <span className="text-xs text-muted">Это ваша роль</span> : null}
          {state.error ? <span className="text-xs text-red-700">{state.error}</span> : null}
          {state.ok ? <span className="text-xs text-emerald-700">{state.ok}</span> : null}
        </div>
      )}
    </form>
  );
}
