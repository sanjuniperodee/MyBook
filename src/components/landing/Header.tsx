"use client";

import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { Logo } from "@/components/Logo";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { Link, useLocalizePath, useMessages } from "@/i18n/client";
import { cn } from "@/lib/utils";

export function LandingHeader({ loggedIn }: { loggedIn: boolean }) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const m = useMessages().common.nav;
  const lp = useLocalizePath();
  // Абсолютные ссылки на якоря — шапка общая для лендинга и внутренних публичных страниц.
  const nav = [
    { href: "/#how", label: m.how },
    { href: "/#inside", label: m.sample },
    { href: "/#pricing", label: m.pricing },
    { href: "/gift", label: m.gift },
    { href: "/#faq", label: m.faq },
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
        <nav className="hidden items-center gap-1 lg:flex">
          {nav.map((n) => (
            <a key={n.href} href={lp(n.href)} className="rounded-full px-3.5 py-2 text-[15px] text-ink-soft transition hover:bg-ink/5 hover:text-ink">
              {n.label}
            </a>
          ))}
        </nav>
        <div className="hidden items-center gap-2 sm:flex">
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
              <Link href="/register" className="btn btn-primary btn-sm">
                {m.createBook}
              </Link>
            </>
          )}
        </div>
        <button className="btn btn-ghost btn-sm -mr-2 px-2 lg:hidden sm:ml-0" onClick={() => setOpen((v) => !v)} aria-label={m.menu} aria-expanded={open}>
          {open ? <X className="size-6" /> : <Menu className="size-6" />}
        </button>
      </div>
      {open ? (
        <div className="container-x pb-6 lg:hidden">
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
                <Link href="/login" className="btn btn-outline">
                  {m.login}
                </Link>
                <Link href="/register" className="btn btn-primary">
                  {m.createBook}
                </Link>
              </>
            )}
          </div>
        </div>
      ) : null}
    </header>
  );
}
