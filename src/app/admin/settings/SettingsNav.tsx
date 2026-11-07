import Link from "next/link";
import { cn } from "@/lib/class-names";
import { SETTINGS_TABS, type SettingsTabId } from "./tabs";

/**
 * Навигация по разделам «Интеграций»: на ноутбуке (lg, как весь каркас CRM) — колонка слева с группами, прилипает под
 * шапкой; на телефоне и планшете — лента вкладок, листается вбок. Это ссылки (?tab=…), поэтому вкладку можно открыть
 * напрямую, вернуться назад и отправить коллеге адрес.
 */
export function SettingsNav({ active }: { active: SettingsTabId }) {
  const groups = [...new Set(SETTINGS_TABS.map((t) => t.group))];
  return (
    <nav aria-label="Разделы интеграций" className="min-w-0 lg:sticky lg:top-[calc(var(--topbar-h,3.5rem)+1.5rem)] lg:self-start">
      <ul className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 lg:hidden">
        {SETTINGS_TABS.map((t) => (
          <li key={t.id} className="shrink-0">
            <Link href={`/admin/settings?tab=${t.id}`} aria-current={t.id === active ? "page" : undefined} className={cn("chip h-10", t.id === active && "chip-on")}>
              <t.icon className="size-4" strokeWidth={1.8} aria-hidden /> {t.label}
            </Link>
          </li>
        ))}
      </ul>
      <div className="hidden space-y-5 lg:block">
        {groups.map((g) => (
          <div key={g}>
            <div className="mb-1 px-3 text-xs text-muted">{g}</div>
            <ul className="space-y-0.5">
              {SETTINGS_TABS.filter((t) => t.group === g).map((t) => {
                const on = t.id === active;
                return (
                  <li key={t.id}>
                    <Link
                      href={`/admin/settings?tab=${t.id}`}
                      aria-current={on ? "page" : undefined}
                      className={cn("relative flex items-start gap-2.5 rounded-[10px] px-3 py-2 text-sm transition-colors", on ? "bg-white font-medium text-ink shadow-[inset_0_0_0_1px_var(--color-line)]" : "text-ink-soft hover:bg-ink/[0.05] hover:text-ink")}
                    >
                      {on ? <span className="absolute top-2 bottom-2 left-0 w-0.5 rounded-full bg-wine" aria-hidden /> : null}
                      <t.icon className={cn("mt-0.5 size-4 shrink-0", on ? "text-wine" : "text-muted")} strokeWidth={1.8} aria-hidden />
                      <span className="min-w-0">
                        {t.label}
                        <span className="block text-xs font-normal text-muted">{t.hint}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}
