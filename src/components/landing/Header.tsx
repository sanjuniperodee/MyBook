"use client";

import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { Logo } from "@/components/Logo";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { ShopThemeToggle } from "@/components/ShopTheme";
import { Link, useLocalizePath, useMessages } from "@/i18n/client";
import { cn } from "@/lib/class-names";
import { registrationOpen } from "@/config/site";

/**
 * Шапка витрины. `overlay` — страница начинается «кадром» (фото во весь экран): до прокрутки шапка прозрачная,
 * со светлым текстом поверх снимка; после — бумажная, как на остальных страницах.
 */
export function LandingHeader({ loggedIn, overlay = false }: { loggedIn: boolean; overlay?: boolean }) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const common = useMessages().common;
  const m = common.nav;
  const lp = useLocalizePath();
  const canRegister = registrationOpen();
  // Абсолютные ссылки на якоря — шапка общая для лендинга и внутренних публичных страниц. «Идеи подарков» — хаб
  // посадочных страниц: ссылка из шапки нужна и людям, и поисковику. На ноутбуке — главное, в меню — всё.
  const nav = [
    { href: "/#how", label: m.how },
    { href: "/#inside", label: m.sample },
    { href: "/kniga", label: common.footer.ideas },
    { href: "/#pricing", label: m.pricing },
    { href: "/gift", label: m.gift },
    { href: "/instrumenty", label: common.footer.tools, menuOnly: true },
    { href: "/blog", label: common.footer.blog, menuOnly: true },
    { href: "/#faq", label: m.faq, menuOnly: true },
  ];

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Закрыть меню клавишей Esc.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const light = overlay && !scrolled && !open;

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-[background-color,border-color,color] duration-300",
        light ? "border-b border-transparent text-white" : "border-b border-line/70 bg-paper/90 text-ink backdrop-blur-xl",
      )}
    >
      <div className={cn("container-x flex h-16 items-center justify-between gap-4", overlay && "sm:h-18")}>
        <Logo className={light ? "text-white" : undefined} />
        <nav className="hidden items-center gap-1 xl:ml-4 xl:flex" aria-label={m.menu}>
          {nav
            .filter((n) => !n.menuOnly)
            .map((n) => (
              <a
                key={n.href}
                href={lp(n.href)}
                className={cn("rounded-[10px] px-3 py-2 text-[15px] whitespace-nowrap transition", light ? "text-white/85 hover:bg-[rgb(255_255_255/0.1)] hover:text-white" : "text-ink-soft hover:bg-ink/5 hover:text-ink")}
              >
                {n.label}
              </a>
            ))}
        </nav>
        <div className="hidden items-center gap-2 sm:flex">
          <ShopThemeToggle tone={light ? "dark" : "light"} />
          <LanguageSwitch className="mr-1" tone={light ? "dark" : "light"} />
          {loggedIn ? (
            <Link href="/books" className="btn btn-primary btn-sm">
              {m.myBooks}
            </Link>
          ) : (
            <>
              <Link href="/login" className={cn("btn btn-sm", light ? "text-white hover:bg-[rgb(255_255_255/0.1)]" : "btn-ghost")}>
                {m.login}
              </Link>
              {canRegister ? (
                <Link href="/register" className="btn btn-primary btn-sm">
                  {m.createBook}
                </Link>
              ) : null}
            </>
          )}
        </div>
        <div className="-mr-2 flex items-center sm:hidden">
          <ShopThemeToggle tone={light ? "dark" : "light"} className="size-11" />
          <button
            className={cn("flex size-11 items-center justify-center rounded-[10px] transition", light ? "hover:bg-[rgb(255_255_255/0.1)]" : "hover:bg-ink/5")}
            onClick={() => setOpen((v) => !v)}
            aria-label={m.menu}
            aria-expanded={open}
            aria-controls="site-menu"
          >
            {open ? <X className="size-6" /> : <Menu className="size-6" />}
          </button>
        </div>
        <button
          className="btn btn-ghost btn-sm -mr-2 hidden px-2 sm:flex xl:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-label={m.menu}
          aria-expanded={open}
          aria-controls="site-menu"
        >
          {open ? <X className="size-6" /> : <Menu className={cn("size-6", light && "text-white")} />}
        </button>
      </div>
      {open ? (
        <div id="site-menu" className="container-x max-h-[calc(100dvh-4rem)] overflow-y-auto pb-6 xl:hidden">
          <nav className="flex flex-col" aria-label={m.menu}>
            {nav.map((n) => (
              <a key={n.href} href={lp(n.href)} onClick={() => setOpen(false)} className="flex min-h-12 items-center border-b border-line/60 font-serif text-[22px]">
                {n.label}
              </a>
            ))}
          </nav>
          <LanguageSwitch className="mt-5 sm:hidden" />
          <div className="mt-5 grid grid-cols-2 gap-3 sm:hidden">
            {loggedIn ? (
              <Link href="/books" className="btn btn-primary col-span-2">
                {m.myBooks}
              </Link>
            ) : (
              <>
                <Link href="/login" className={canRegister ? "btn btn-outline" : "btn btn-primary col-span-2"}>
                  {m.login}
                </Link>
                {canRegister ? (
                  <Link href="/register" className="btn btn-primary">
                    {m.createBook}
                  </Link>
                ) : null}
              </>
            )}
          </div>
        </div>
      ) : null}
    </header>
  );
}
