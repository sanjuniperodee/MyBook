"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { Logo } from "@/components/Logo";
import { cn } from "@/lib/utils";

// Абсолютные ссылки на якоря — шапка общая для лендинга и внутренних публичных страниц.
const nav = [
  { href: "/#how", label: "Как это работает" },
  { href: "/#inside", label: "Пример книги" },
  { href: "/#pricing", label: "Цены" },
  { href: "/gift", label: "Сертификат" },
  { href: "/#faq", label: "Вопросы" },
];

export function LandingHeader({ loggedIn }: { loggedIn: boolean }) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

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
            <a key={n.href} href={n.href} className="rounded-full px-3.5 py-2 text-[15px] text-ink-soft transition hover:bg-ink/5 hover:text-ink">
              {n.label}
            </a>
          ))}
        </nav>
        <div className="hidden items-center gap-2 sm:flex">
          {loggedIn ? (
            <Link href="/books" className="btn btn-primary btn-sm">
              Мои книги
            </Link>
          ) : (
            <>
              <Link href="/login" className="btn btn-ghost btn-sm">
                Войти
              </Link>
              <Link href="/register" className="btn btn-primary btn-sm">
                Создать книгу
              </Link>
            </>
          )}
        </div>
        <button className="btn btn-ghost btn-sm -mr-2 px-2 lg:hidden sm:ml-0" onClick={() => setOpen((v) => !v)} aria-label="Меню" aria-expanded={open}>
          {open ? <X className="size-6" /> : <Menu className="size-6" />}
        </button>
      </div>
      {open ? (
        <div className="container-x pb-6 lg:hidden">
          <nav className="flex flex-col">
            {nav.map((n) => (
              <a key={n.href} href={n.href} onClick={() => setOpen(false)} className="border-b border-line/60 py-3.5 text-lg">
                {n.label}
              </a>
            ))}
          </nav>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:hidden">
            {loggedIn ? (
              <Link href="/books" className="btn btn-primary col-span-2">
                Мои книги
              </Link>
            ) : (
              <>
                <Link href="/login" className="btn btn-outline">
                  Войти
                </Link>
                <Link href="/register" className="btn btn-primary">
                  Создать книгу
                </Link>
              </>
            )}
          </div>
        </div>
      ) : null}
    </header>
  );
}
