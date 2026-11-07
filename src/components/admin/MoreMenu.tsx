"use client";

import Link from "next/link";
import { ChevronRight, Globe, LogOut } from "lucide-react";
import type { Permission } from "@/shared/domain/permissions";
import { logoutAction } from "@/app/(auth)/actions";
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
      <h1 className="font-semibold">Ещё</h1>
      <div className="panel p-4">
        <div className="flex items-center gap-3">
          <span className="flex size-14 items-center justify-center rounded-full bg-wine text-xl font-semibold text-white uppercase" aria-hidden>{name.slice(0, 1) || "?"}</span>
          <div className="min-w-0">
            <div className="truncate text-lg font-semibold">{name}</div>
            <div className="truncate text-sm text-muted">{role}</div>
            <div className="truncate text-xs text-muted">{email}</div>
          </div>
        </div>
        {allowed.has("deals.edit") || allowed.has("chats.send") ? (
          <div className="mt-3 border-t border-line pt-2">
            <ShiftToggle initial={onShift} variant="row" />
          </div>
        ) : null}
      </div>

      {sections.map((s, i) => (
        <section key={s.title ?? i}>
          {s.title ? <h2 className="mb-2 px-1 text-[13px] font-medium text-muted">{s.title}</h2> : null}
          <ul className="divide-y divide-line overflow-hidden rounded-[14px] border border-line bg-white">
            {s.items.map((it) => {
              const n = it.badge ? counters[it.badge] : 0;
              return (
                <li key={it.href}>
                  <Link href={it.href} className="flex min-h-12 items-center gap-3 px-4 py-2.5 active:bg-sunken">
                    <span className="flex size-8 items-center justify-center rounded-lg bg-sunken text-ink-soft">
                      <it.icon className="size-[18px]" strokeWidth={1.8} aria-hidden />
                    </span>
                    <span className="flex-1 text-[15px]">{it.label}</span>
                    {n ? <span className="min-w-6 rounded-md bg-wine px-1.5 py-0.5 text-center text-xs font-semibold text-white tabular-nums">{n > 99 ? "99+" : n}</span> : null}
                    <ChevronRight className="size-4 text-muted" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <section>
        <h2 className="mb-2 px-1 text-[13px] font-medium text-muted">Внешний вид</h2>
        <div className="panel p-3">
          <ThemeSwitch />
        </div>
      </section>

      {!standalone ? (
        <section>
          <h2 className="mb-2 px-1 text-[13px] font-medium text-muted">Приложение</h2>
          <InstallCrm />
        </section>
      ) : null}

      <ul className="divide-y divide-line overflow-hidden rounded-[14px] border border-line bg-white">
        <li>
          <Link href="/books" className="flex min-h-12 items-center gap-3 px-4 py-3 text-[15px] active:bg-sunken">
            <Globe className="size-5 text-ink-soft" strokeWidth={1.8} aria-hidden /> На сайт
          </Link>
        </li>
        <li>
          <form action={logoutAction}>
            <button type="submit" className="flex min-h-12 w-full items-center gap-3 px-4 py-3 text-left text-[15px] text-danger active:bg-sunken">
              <LogOut className="size-5" strokeWidth={1.8} aria-hidden /> Выйти из аккаунта
            </button>
          </form>
        </li>
      </ul>
    </div>
  );
}
