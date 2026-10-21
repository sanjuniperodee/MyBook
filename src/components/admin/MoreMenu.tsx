"use client";

import Link from "next/link";
import { LogOut } from "lucide-react";
import type { Permission } from "@/shared/domain/permissions";
import { logoutAction } from "@/app/(auth)/actions";
import { cn } from "@/lib/class-names";
import { navSections, ShiftToggle } from "./AdminNav";
import { useLive } from "./CrmLive";
import { InstallCrm, useStandalone } from "./InstallCrm";
import { ThemeSwitch } from "./Theme";

/**
 * «Ещё» / «Профиль» на телефоне: кто вошёл и смена, все разделы CRM по правам (то, чего нет в нижней панели), тема,
 * установка на экран «Домой» и выход — как «Профиль» в приложении.
 */
export function MoreMenu({ name, role, email, perms, onShift, tabHrefs }: { name: string; role: string; email: string; perms: Permission[]; onShift: boolean; tabHrefs: string[] }) {
  const { counters } = useLive().live;
  const allowed = new Set(perms);
  const standalone = useStandalone();
  const sections = navSections
    .map((s) => ({ ...s, items: s.items.filter((it) => (!it.perm || it.perm.some((p) => allowed.has(p))) && !tabHrefs.includes(it.href)) }))
    .filter((s) => s.items.length);
  return (
    <div className="mx-auto max-w-xl space-y-5 pb-4">
      <h1 className="text-2xl font-semibold">Ещё</h1>
      <div className="rounded-2xl border border-line bg-white p-4">
        <div className="flex items-center gap-3">
          <span className="flex size-14 items-center justify-center rounded-full bg-gradient-to-br from-wine to-wine-dark text-xl font-semibold text-white uppercase">{name.slice(0, 1) || "?"}</span>
          <div className="min-w-0">
            <div className="truncate text-lg font-semibold">{name}</div>
            <div className="truncate text-sm text-muted">{role}</div>
            <div className="truncate text-xs text-muted">{email}</div>
          </div>
        </div>
        {allowed.has("deals.edit") || allowed.has("chats.send") ? (
          <div className="mt-3 border-t border-line pt-2">
            <ShiftToggle initial={onShift} />
          </div>
        ) : null}
      </div>

      {sections.map((s, i) => (
        <section key={s.title ?? i}>
          {s.title ? <h2 className="mb-2 px-1 text-[11px] font-semibold tracking-wider text-muted uppercase">{s.title}</h2> : null}
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white">
            {s.items.map((it) => {
              const n = it.badge ? counters[it.badge] : 0;
              return (
                <li key={it.href}>
                  <Link href={it.href} className="flex items-center gap-3 px-4 py-3.5 active:bg-cream/60">
                    <span className="flex size-9 items-center justify-center rounded-xl bg-wine/10 text-wine">
                      <it.icon className="size-5" strokeWidth={1.8} />
                    </span>
                    <span className="flex-1 text-[15px]">{it.label}</span>
                    {n ? <span className="rounded-full bg-wine px-2 py-0.5 text-xs font-semibold text-white tabular-nums">{n > 99 ? "99+" : n}</span> : null}
                    <span className="text-muted">›</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <section>
        <h2 className="mb-2 px-1 text-[11px] font-semibold tracking-wider text-muted uppercase">Внешний вид</h2>
        <div className="rounded-2xl border border-line bg-white p-3">
          <ThemeSwitch />
        </div>
      </section>

      {!standalone ? (
        <section>
          <h2 className="mb-2 px-1 text-[11px] font-semibold tracking-wider text-muted uppercase">Приложение</h2>
          <InstallCrm />
        </section>
      ) : null}

      <ul className={cn("divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white")}>
        <li>
          <Link href="/books" className="flex items-center gap-3 px-4 py-3.5 text-[15px]">
            ← На сайт
          </Link>
        </li>
        <li>
          <form action={logoutAction}>
            <button type="submit" className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-[15px] text-red-700">
              <LogOut className="size-5" /> Выйти из аккаунта
            </button>
          </form>
        </li>
      </ul>
    </div>
  );
}
