import Link from "next/link";
import { cn } from "@/lib/class-names";
import { SETTINGS_TABS, type SettingsTabId } from "./tabs";

/**
 * Навигация по разделам «Интеграций»: слева (на широком экране) с группами, на телефоне — лента вкладок. Это ссылки
 * (?tab=…), поэтому вкладку можно открыть напрямую, вернуться назад и отправить коллеге адрес.
 */
export function SettingsNav({ active }: { active: SettingsTabId }) {
  const groups = [...new Set(SETTINGS_TABS.map((t) => t.group))];
  return (
    <nav aria-label="Разделы интеграций" className="min-w-0">
      <ul className="m-hscroll flex gap-2 overflow-x-auto pb-1 md:hidden">
        {SETTINGS_TABS.map((t) => (
          <li key={t.id} className="shrink-0">
            <Link href={`/admin/settings?tab=${t.id}`} aria-current={t.id === active ? "page" : undefined} className={cn("flex items-center gap-1.5 min-h-10 rounded-full border px-3.5 py-1.5 text-sm whitespace-nowrap", t.id === active ? "border-wine/40 bg-rose/40 font-medium text-wine" : "border-line bg-white text-ink-soft")}>
              <t.icon className="size-4" /> {t.label}
            </Link>
          </li>
        ))}
      </ul>
      <div className="hidden space-y-5 md:block">
        {groups.map((g) => (
          <div key={g}>
            <div className="mb-1.5 px-3 text-[11px] font-medium tracking-wide text-muted uppercase">{g}</div>
            <ul className="space-y-0.5">
              {SETTINGS_TABS.filter((t) => t.group === g).map((t) => (
                <li key={t.id}>
                  <Link href={`/admin/settings?tab=${t.id}`} aria-current={t.id === active ? "page" : undefined} className={cn("flex items-start gap-2.5 rounded-xl px-3 py-2 text-sm transition-colors", t.id === active ? "bg-rose/40 font-medium text-wine" : "text-ink-soft hover:bg-cream/70")}>
                    <t.icon className="mt-0.5 size-4 shrink-0" />
                    <span>
                      {t.label}
                      <span className={cn("block text-xs font-normal", t.id === active ? "text-wine/70" : "text-muted")}>{t.hint}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}
