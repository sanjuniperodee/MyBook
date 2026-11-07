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
 * Слева знак, по центру разделы (от 1280 px), справа язык, вход и одно главное действие. Меню — лист на весь экран.
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

  // Закрыть меню клавишей Esc; пока оно открыто, страница под ним не прокручивается.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  const light = overlay && !scrolled && !open;
  const linkTone = light ? "text-white/85 hover:text-white" : "text-ink-soft hover:text-ink";

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-[background-color,border-color,color] duration-300",
        // Размытие создаёт «контейнер» для fixed-потомков, поэтому при открытом меню (лист на весь экран) оно выключено.
        light ? "border-b border-transparent text-white" : open ? "border-b border-line/70 bg-paper text-ink" : "border-b border-line/70 bg-paper/95 text-ink backdrop-blur-xl",
      )}
    >
      <div className="container-x flex h-16 items-center gap-4 sm:h-18 xl:gap-8">
        <Logo className={light ? "text-white" : undefined} />
        <nav className="hidden flex-1 items-center justify-center xl:ml-6 xl:flex" aria-label={m.menu}>
          {nav
            .filter((n) => !n.menuOnly)
            .map((n) => (
              <a
                key={n.href}
                href={lp(n.href)}
                className={cn(
                  "relative px-3.5 py-2 text-[15px] whitespace-nowrap transition-colors after:absolute after:inset-x-3.5 after:bottom-1 after:h-px after:origin-left after:scale-x-0 after:bg-current after:transition-transform hover:after:scale-x-100",
                  linkTone,
                )}
              >
                {n.label}
              </a>
            ))}
        </nav>
        <div className="ml-auto hidden items-center gap-1.5 sm:flex">
          <ShopThemeToggle tone={light ? "dark" : "light"} />
          <LanguageSwitch className="mr-1.5" tone={light ? "dark" : "light"} />
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
          <button
            className={cn("btn btn-icon btn-sm xl:hidden", light ? "text-white hover:bg-[rgb(255_255_255/0.1)]" : "btn-ghost")}
            onClick={() => setOpen((v) => !v)}
            aria-label={m.menu}
            aria-expanded={open}
            aria-controls="site-menu"
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
        <div className="-mr-2 ml-auto flex items-center sm:hidden">
          <ShopThemeToggle tone={light ? "dark" : "light"} className="size-11" />
          <button
            className={cn("flex size-11 items-center justify-center rounded-(--r-ctl) transition", light ? "hover:bg-[rgb(255_255_255/0.1)]" : "hover:bg-ink/5")}
            onClick={() => setOpen((v) => !v)}
            aria-label={m.menu}
            aria-expanded={open}
            aria-controls="site-menu"
          >
            {open ? <X className="size-6" /> : <Menu className="size-6" />}
          </button>
        </div>
      </div>
      {open ? (
        <div id="site-menu" className="fixed inset-x-0 top-16 bottom-0 flex flex-col overflow-y-auto overscroll-contain bg-paper sm:top-18 xl:hidden">
          <div className="container-x flex flex-1 flex-col pt-2 pb-6">
            <nav className="flex flex-col" aria-label={m.menu}>
              {nav.map((n) => (
                <a key={n.href} href={lp(n.href)} onClick={() => setOpen(false)} className="flex min-h-14 items-center border-b border-line/70 font-serif text-[26px] text-ink">
                  {n.label}
                </a>
              ))}
            </nav>
            <LanguageSwitch className="mt-6 self-start sm:hidden" />
            <div className="mt-auto grid gap-3 pt-8 sm:hidden">
              {loggedIn ? (
                <Link href="/books" className="btn btn-primary btn-lg">
                  {m.myBooks}
                </Link>
              ) : (
                <>
                  {canRegister ? (
                    <Link href="/register" className="btn btn-primary btn-lg">
                      {m.createBook}
                    </Link>
                  ) : null}
                  <Link href="/login" className={cn("btn btn-lg", canRegister ? "btn-outline" : "btn-primary")}>
                    {m.login}
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}
