"use client";

import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { Logo } from "@/components/Logo";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { ShopThemeToggle } from "@/components/ShopTheme";
import { Link, useLocalizePath, useMessages } from "@/i18n/client";
import { cn } from "@/lib/class-names";
import { registrationOpen } from "@/config/site";

export function LandingHeader({ loggedIn }: { loggedIn: boolean }) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const common = useMessages().common;
  const m = common.nav;
  const lp = useLocalizePath();
  const canRegister = registrationOpen();
  // Абсолютные ссылки на якоря — шапка общая для лендинга и внутренних публичных страниц. «Идеи подарков» — хаб
  // посадочных страниц: ссылка из шапки нужна и людям, и поисковику.
  const nav = [
    { href: "/#how", label: m.how },
    { href: "/#inside", label: m.sample },
    { href: "/kniga", label: common.footer.ideas },
    { href: "/instrumenty", label: common.footer.tools },
    { href: "/#pricing", label: m.pricing },
    { href: "/gift", label: m.gift, wide: true },
    { href: "/#faq", label: m.faq, wide: true },
  ];

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-all duration-300",
        scrolled || open ? "border-b border-line/70 bg-paper/85 backdrop-blur-xl" : "bg-transparent",
      )}
    >
      <div className="container-x flex h-16 items-center justify-between gap-4 sm:h-18">
        <Logo />
        <nav className="hidden items-center gap-0.5 min-[1400px]:ml-6 min-[1400px]:flex">
          {nav.map((n) => (
            <a key={n.href} href={lp(n.href)} className={cn("rounded-full px-2.5 py-2 text-[15px] whitespace-nowrap text-ink-soft transition hover:bg-ink/5 hover:text-ink", "wide" in n && "hidden min-[1640px]:block")}>
              {n.label}
            </a>
          ))}
        </nav>
        <div className="hidden items-center gap-2 sm:flex">
          <ShopThemeToggle />
          <LanguageSwitch className="mr-1" />
          {loggedIn ? (
            <Link href="/books" className="btn btn-primary btn-sm">
              {m.myBooks}
            </Link>
          ) : (
            <>
              <Link href="/login" className="btn btn-ghost btn-sm">
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
        <ShopThemeToggle className="sm:hidden" />
        <button className="btn btn-ghost btn-sm -mr-2 px-2 min-[1400px]:hidden sm:ml-0" onClick={() => setOpen((v) => !v)} aria-label={m.menu} aria-expanded={open}>
          {open ? <X className="size-6" /> : <Menu className="size-6" />}
        </button>
      </div>
      {open ? (
        <div className="container-x pb-6 min-[1400px]:hidden">
          <nav className="flex flex-col">
            {nav.map((n) => (
              <a key={n.href} href={lp(n.href)} onClick={() => setOpen(false)} className="border-b border-line/60 py-3.5 text-lg">
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
