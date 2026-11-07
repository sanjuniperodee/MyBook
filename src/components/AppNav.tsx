"use client";

import { useEffect, useRef, useState } from "react";
import { BookOpen, ChevronDown, Gift, LayoutDashboard, LifeBuoy, LogOut, Package, UserRound } from "lucide-react";
import { HELP_OPEN_EVENT } from "@/components/help/events";
import { logoutAction } from "@/app/(auth)/actions";
import { cn } from "@/lib/class-names";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { ShopThemeToggle } from "@/components/ShopTheme";
import { Link, useLocalePathname, useMessages } from "@/i18n/client";

/** Разделы кабинета: книги, заказы, аккаунт. Совпадает по префиксу пути (/books/new и /books/<id> — тоже «Книги»). */
const SECTIONS = [
  { href: "/books", key: "myBooks", icon: BookOpen },
  { href: "/orders", key: "orders", icon: Package },
  { href: "/account", key: "account", icon: UserRound },
] as const;

const isActive = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

/**
 * Страницы редактора книги (/books/<id>/…) ведут свои нижние панели — общая нижняя навигация на них не нужна.
 * /books/new — не книга, а мастер: нижняя навигация там остаётся.
 */
export const inBook = (pathname: string) => /^\/books\/(?!new(\/|$))[^/]+/.test(pathname);

/**
 * Шапка кабинета показывается везде, кроме книги: там одна шапка — шапка книги (знак, путь «Мои книги / книга», состояние,
 * заказ, тема и профиль), а не две друг над другом. Высота у них одна (56 px), поэтому липкие панели редакторов не сдвигаются.
 */
export function CabinetHeaderGate({ children }: { children: React.ReactNode }) {
  return inBook(useLocalePathname()) ? null : children;
}

/** Где мы: название раздела для шапки на телефоне. */
function useSectionTitle(pathname: string) {
  const m = useMessages();
  if (isActive(pathname, "/orders")) return m.common.nav.orders;
  if (isActive(pathname, "/account")) return m.common.nav.account;
  if (isActive(pathname, "/invite")) return m.common.nav.invite;
  if (isActive(pathname, "/books/new")) return m.books.list.newBook;
  return m.common.nav.myBooks;
}

/**
 * Шапка кабинета, правая и средняя части. На компьютере — разделы вкладками с подчёркиванием активного, язык, тема, профиль.
 * На телефоне — название раздела, тема и профиль; разделы уходят в нижнюю панель (AppTabBar). В книге эта шапка не
 * показывается совсем — её место занимает шапка книги (BookLayout), см. `CabinetHeaderGate`.
 */
export function AppNav({ name, email, isAdmin }: { name: string; email: string; isAdmin: boolean }) {
  const pathname = useLocalePathname();
  const m = useMessages().common.nav;
  const title = useSectionTitle(pathname);
  return (
    <>
      {/* Компьютер: вкладки разделов. Высота шапки — 56 px, подчёркивание лежит на её нижней линии. */}
      <nav aria-label={m.sections} className="ml-4 hidden h-14 items-stretch gap-1 md:flex">
        {SECTIONS.map((s) => {
          const active = isActive(pathname, s.href);
          return (
            <Link
              key={s.href}
              href={s.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex items-center rounded-none px-3 text-[15px] font-medium transition-colors",
                active ? "text-ink after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-t-full after:bg-wine" : "text-muted hover:text-ink",
              )}
            >
              {m[s.key]}
            </Link>
          );
        })}
      </nav>
      {/* Телефон: «где я» — название раздела. */}
      <div className="min-w-0 flex-1 truncate pl-1 font-serif text-[22px] leading-none font-medium md:hidden">{title}</div>
      <div className="hidden flex-1 md:block" />

      <div className="flex shrink-0 items-center gap-0.5 sm:gap-1.5">
        {/* Обёртка, а не className: cn() не сливает классы, и «hidden» проиграл бы «inline-flex» переключателя. На телефоне язык — в меню профиля. */}
        <div className="mr-1 hidden md:block">
          <LanguageSwitch />
        </div>
        <ShopThemeToggle className="size-11" />
        <ProfileMenu name={name} email={email} isAdmin={isAdmin} />
      </div>
    </>
  );
}

/**
 * Меню профиля на аватаре: имя, язык (на телефоне), аккаунт, приглашение, CRM для сотрудников, выход. В книге шапка кабинета
 * уступает место шапке книги, поэтому здесь же — путь к заказам (`orders`).
 */
export function ProfileMenu({ name, email, isAdmin, orders = false, help = false, className }: { name: string; email: string; isAdmin: boolean; orders?: boolean; help?: boolean; className?: string }) {
  const msgs = useMessages();
  const m = msgs.common.nav;
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !menu.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const initial = (name || email).trim().charAt(0).toUpperCase();
  const itemCls = "flex min-h-11 items-center gap-2.5 rounded-[10px] px-3 text-sm hover:bg-sunken";
  return (
    <div ref={menu} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex h-11 items-center gap-1 rounded-full py-1 pr-1.5 pl-1 transition hover:bg-ink/5"
      >
        <span className="flex size-8 items-center justify-center rounded-full bg-wine text-[13px] font-semibold text-white">{initial}</span>
        <ChevronDown className={cn("size-4 text-muted transition-transform duration-200 max-sm:hidden", open && "rotate-180")} aria-hidden />
        <span className="sr-only">{m.profileMenu}</span>
      </button>
      {open ? (
        <div role="menu" className="absolute right-0 mt-2 w-60 origin-top-right animate-[toast-in_180ms_var(--ease-out-soft)_both] rounded-[var(--r-panel)] border border-line bg-white p-1.5 shadow-soft">
          <div className="px-3 py-2.5">
            <div className="truncate text-sm font-medium">{name || m.noName}</div>
            <div className="truncate text-xs text-muted">{email}</div>
          </div>
          <div className="my-1 h-px bg-line" />
          <div className="px-3 py-1.5 md:hidden">
            <LanguageSwitch />
          </div>
          {orders ? (
            <>
              <Link role="menuitem" href="/books" onClick={() => setOpen(false)} className={itemCls}>
                <BookOpen className="size-4 text-muted" aria-hidden /> {m.myBooks}
              </Link>
              <Link role="menuitem" href="/orders" onClick={() => setOpen(false)} className={itemCls}>
                <Package className="size-4 text-muted" aria-hidden /> {m.orders}
              </Link>
            </>
          ) : null}
          {help ? (
            <button
              role="menuitem"
              type="button"
              onClick={() => {
                setOpen(false);
                window.dispatchEvent(new Event(HELP_OPEN_EVENT));
              }}
              className={cn(itemCls, "w-full")}
            >
              <LifeBuoy className="size-4 text-muted" aria-hidden /> {msgs.help.button}
            </button>
          ) : null}
          <Link role="menuitem" href="/account" onClick={() => setOpen(false)} className={itemCls}>
            <UserRound className="size-4 text-muted" aria-hidden /> {m.profile}
          </Link>
          <Link role="menuitem" href="/invite" onClick={() => setOpen(false)} className={itemCls}>
            <Gift className="size-4 text-muted" aria-hidden /> {m.invite}
          </Link>
          {isAdmin ? (
            <Link role="menuitem" href="/admin" onClick={() => setOpen(false)} className={cn(itemCls, "text-wine")}>
              <LayoutDashboard className="size-4" aria-hidden /> {m.crm}
            </Link>
          ) : null}
          <form action={logoutAction}>
            <button role="menuitem" className={cn(itemCls, "w-full")}>
              <LogOut className="size-4 text-muted" aria-hidden /> {m.logout}
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Нижняя панель кабинета на телефоне: Книги, Заказы, Аккаунт. Лежит в потоке последним элементом оболочки и «прилипает»
 * к низу экрана (sticky), поэтому ничего не перекрывает и отступы страницам не нужны. Под вырезом — safe-area.
 */
export function AppTabBar() {
  const pathname = useLocalePathname();
  const m = useMessages().common.nav;
  if (inBook(pathname)) return null;
  return (
    <nav aria-label={m.sections} className="sticky bottom-0 z-40 border-t border-line bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden">
      <ul className="mx-auto grid max-w-md grid-cols-3">
        {SECTIONS.map((s) => {
          const active = isActive(pathname, s.href);
          return (
            <li key={s.href}>
              <Link
                href={s.href}
                aria-current={active ? "page" : undefined}
                className={cn("relative flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors", active ? "text-wine" : "text-muted")}
              >
                {active ? <span className="absolute inset-x-6 top-0 h-0.5 rounded-b-full bg-wine" aria-hidden /> : null}
                <s.icon className="size-5" strokeWidth={active ? 2 : 1.7} aria-hidden />
                {m[s.key]}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
