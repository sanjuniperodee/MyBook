"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";

/**
 * Тёмная тема CRM. Выбор — «светлая», «тёмная» или «как в системе» — хранится в браузере (на каждом устройстве свой).
 * Класс .dark ставится на <html>, но только пока открыта админка: сайт магазина всегда светлый.
 */
export type ThemePref = "light" | "dark" | "system";
const KEY = "crm-theme";
const EVENT = "crm-theme-change";

const read = (): ThemePref => {
  try {
    const v = localStorage.getItem(KEY);
    return v === "dark" || v === "system" ? v : "light";
  } catch {
    return "light";
  }
};

const subscribe = (cb: () => void) => {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
};

const isDark = (pref: ThemePref) => pref === "dark" || (pref === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);

/** Скрипт до первой отрисовки: страница сразу тёмная, без белой вспышки. */
export const THEME_SCRIPT = `try{var t=localStorage.getItem("${KEY}");if(t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches))document.documentElement.classList.add("dark")}catch(e){}`;

/** Держит класс .dark в соответствии с выбором и снимает его при уходе из админки. */
export function ThemeSync() {
  const pref = useSyncExternalStore(subscribe, read, () => "light" as ThemePref);
  useEffect(() => {
    const root = document.documentElement;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => root.classList.toggle("dark", isDark(pref));
    apply();
    mq.addEventListener("change", apply);
    return () => {
      mq.removeEventListener("change", apply);
      root.classList.remove("dark");
    };
  }, [pref]);
  return null;
}

const NEXT: Record<ThemePref, ThemePref> = { light: "dark", dark: "system", system: "light" };
const LABEL: Record<ThemePref, string> = { light: "Светлая тема", dark: "Тёмная тема", system: "Тема как в системе" };

/** Кнопка в шапке: светлая → тёмная → как в системе. */
export function ThemeToggle() {
  const pref = useSyncExternalStore(subscribe, read, () => "light" as ThemePref);
  const Icon = pref === "dark" ? Moon : pref === "system" ? Monitor : Sun;
  return (
    <button
      type="button"
      onClick={() => {
        try {
          localStorage.setItem(KEY, NEXT[pref]);
        } catch {}
        window.dispatchEvent(new Event(EVENT));
      }}
      className="flex size-9 items-center justify-center rounded-full text-muted transition hover:bg-cream hover:text-ink"
      title={`${LABEL[pref]} — нажмите, чтобы сменить`}
      aria-label={`${LABEL[pref]}. Сменить`}
    >
      <Icon className="size-[18px]" />
    </button>
  );
}

/** Выбор темы тремя кнопками (страница «Ещё» на телефоне): светлая, тёмная, как в системе. */
export function ThemeSwitch() {
  const pref = useSyncExternalStore(subscribe, read, () => "light" as ThemePref);
  const opts: { key: ThemePref; label: string; icon: typeof Sun }[] = [
    { key: "system", label: "Авто", icon: Monitor },
    { key: "light", label: "Светлая", icon: Sun },
    { key: "dark", label: "Тёмная", icon: Moon },
  ];
  return (
    <div className="grid grid-cols-3 gap-1 rounded-xl bg-cream/70 p-1" role="radiogroup" aria-label="Тема">
      {opts.map((o) => (
        <button
          key={o.key}
          type="button"
          role="radio"
          aria-checked={pref === o.key}
          onClick={() => {
            try {
              localStorage.setItem(KEY, o.key);
            } catch {}
            window.dispatchEvent(new Event(EVENT));
          }}
          className={pref === o.key ? "flex items-center justify-center gap-1.5 rounded-lg bg-white py-2 text-sm font-medium shadow-sm" : "flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm text-muted"}
        >
          <o.icon className="size-4" /> {o.label}
        </button>
      ))}
    </div>
  );
}
