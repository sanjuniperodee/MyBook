"use client";

import { usePathname } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { useMessages } from "@/i18n/client";
import { cn } from "@/lib/class-names";

/**
 * Тёмная тема витрины (лендинг, книги, оплата). Выбор хранится в браузере; класс .shop-dark ставится на <html>.
 * Админка и CRM своей темой управляют сами (класс .dark), поэтому здесь они пропускаются.
 */
const KEY = "shop-theme";
const CLASS = "shop-dark";
const CRM_PATH = /^\/(kk\/)?(admin|crm)(\/|$)/;

/** Скрипт до первой отрисовки: тёмная витрина без белой вспышки. */
export const SHOP_THEME_SCRIPT = `try{if(!/^\\/(kk\\/)?(admin|crm)(\\/|$)/.test(location.pathname)&&localStorage.getItem("${KEY}")==="dark")document.documentElement.classList.add("${CLASS}")}catch(e){}`;

/** Держит класс в соответствии с выбором при переходах внутри сайта (из витрины в CRM класс снимается). */
export function ShopThemeSync() {
  const pathname = usePathname() ?? "/";
  useEffect(() => {
    const dark = !CRM_PATH.test(pathname) && localStorage.getItem(KEY) === "dark";
    document.documentElement.classList.toggle(CLASS, dark);
  }, [pathname]);
  return null;
}

/** Тема видна по классу на <html>: следим за ним, чтобы иконка совпадала и после смены темы из другого места. */
const subscribeClass = (cb: () => void) => {
  const observer = new MutationObserver(cb);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
};
const isDarkNow = () => document.documentElement.classList.contains(CLASS);

/** Кнопка в шапке витрины: переключает светлую и тёмную тему. */
export function ShopThemeToggle({ className }: { className?: string }) {
  const t = useMessages().common.theme;
  const dark = useSyncExternalStore(subscribeClass, isDarkNow, () => false);

  const toggle = () => {
    const next = !dark;
    document.documentElement.classList.toggle(CLASS, next);
    try {
      localStorage.setItem(KEY, next ? "dark" : "light");
    } catch {}
  };

  const Icon = dark ? Sun : Moon;
  const label = dark ? t.light : t.dark;
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className={cn("flex size-9 shrink-0 items-center justify-center rounded-full text-ink-soft transition hover:bg-ink/5 hover:text-ink", className)}
    >
      <Icon className="size-[18px]" aria-hidden />
    </button>
  );
}
