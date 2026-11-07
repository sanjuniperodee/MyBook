"use client";

import Link from "next/link";
import { ChevronRight, Globe, LogOut } from "lucide-react";
import type { Permission } from "@/shared/domain/permissions";
import { logoutAction } from "@/app/(auth)/actions";
import { navSections, ShiftToggle } from "./AdminNav";
import { useLive } from "./CrmLive";
import { InstallCrm, useStandalone } from "./InstallCrm";
import { ThemeSwitch } from "./Theme";
import { cn } from "@/lib/class-names";

/** Группа строк как в iOS «Настройки»: скруглённый лист, разделитель начинается от подписи, а не от края. */
const group = "overflow-hidden rounded-[var(--r-panel)] border border-line bg-white";
const inset = "relative [&:not(:first-child)]:before:absolute [&:not(:first-child)]:before:top-0 [&:not(:first-child)]:before:right-0 [&:not(:first-child)]:before:left-[3.5rem] [&:not(:first-child)]:before:h-px [&:not(:first-child)]:before:bg-line";
const headCls = "mb-1.5 px-4 text-[13px] font-medium text-muted";

/**
 * «Ещё» / «Профиль» на телефоне: кто вошёл и смена, все разделы CRM по правам (то, чего нет в нижней панели) списками как
 * в iOS, тема, установка на экран «Домой» и выход — как «Профиль» в приложении.
 */
export function MoreMenu({ name, role, email, perms, onShift, tabHrefs }: { name: string; role: string; email: string; perms: Permission[]; onShift: boolean; tabHrefs: string[] }) {
  const { counters } = useLive().live;
  const allowed = new Set(perms);
  const standalone = useStandalone();
  const sections = navSections
    .map((s) => ({ ...s, items: s.items.filter((it) => (!it.perm || it.perm.some((p) => allowed.has(p))) && !tabHrefs.includes(it.href)) }))
    .filter((s) => s.items.length);
  return (
    <div className="mx-auto max-w-xl space-y-6 pb-4">
      <h1 className="font-semibold">Ещё</h1>

      <section aria-label="Профиль">
        <ul className={group}>
          <li className={cn(inset, "flex items-center gap-3 px-4 py-3")}>
            <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-wine text-lg font-semibold text-white uppercase" aria-hidden>
              {name.slice(0, 1) || "?"}
            </span>
            <div className="min-w-0">
              <div className="truncate text-[17px] leading-tight font-semibold">{name}</div>
              <div className="truncate text-sm text-muted">{role}</div>
              <div className="truncate text-xs text-muted">{email}</div>
            </div>
          </li>
          {allowed.has("deals.edit") || allowed.has("chats.send") ? (
            <li className={cn(inset, "px-4 py-1")}>
              <ShiftToggle initial={onShift} variant="row" />
            </li>
          ) : null}
        </ul>
      </section>

      {sections.map((s, i) => (
        <section key={s.title ?? i} aria-label={s.title ?? "Разделы"}>
          {s.title ? <h2 className={headCls}>{s.title}</h2> : null}
          <ul className={group}>
            {s.items.map((it) => {
              const n = it.badge ? counters[it.badge] : 0;
              return (
                <li key={it.href} className={inset}>
                  <Link href={it.href} className="flex min-h-12 items-center gap-3 px-4 py-2 transition-colors active:bg-sunken">
                    <span className="flex size-7 items-center justify-center rounded-[7px] bg-sunken text-ink-soft">
                      <it.icon className="size-[17px]" strokeWidth={1.8} aria-hidden />
                    </span>
                    <span className="flex-1 text-[15px]">{it.label}</span>
                    {n ? <span className="count count-alert">{n > 99 ? "99+" : n}</span> : null}
                    <ChevronRight className="size-4 text-muted" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <section aria-label="Внешний вид">
        <h2 className={headCls}>Внешний вид</h2>
        <div className={cn(group, "p-2")}>
          <ThemeSwitch />
        </div>
      </section>

      {!standalone ? (
        <section aria-label="Приложение">
          <h2 className={headCls}>Приложение</h2>
          <InstallCrm />
        </section>
      ) : null}

      <ul className={group}>
        <li className={inset}>
          <Link href="/books" className="flex min-h-12 items-center gap-3 px-4 py-2 text-[15px] active:bg-sunken">
            <span className="flex size-7 items-center justify-center rounded-[7px] bg-sunken text-ink-soft">
              <Globe className="size-[17px]" strokeWidth={1.8} aria-hidden />
            </span>
            На сайт
          </Link>
        </li>
        <li className={inset}>
          <form action={logoutAction}>
            <button type="submit" className="flex min-h-12 w-full items-center gap-3 px-4 py-2 text-left text-[15px] text-danger active:bg-sunken">
              <span className="flex size-7 items-center justify-center rounded-[7px] bg-danger-bg text-danger">
                <LogOut className="size-[17px]" strokeWidth={1.8} aria-hidden />
              </span>
              Выйти из аккаунта
            </button>
          </form>
        </li>
      </ul>
    </div>
  );
}
