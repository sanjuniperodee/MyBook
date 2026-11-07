"use client";

import { Link, useLocalePathname, useMessages } from "@/i18n/client";
import { Fragment, useEffect, useRef, useState, ViewTransition } from "react";
import { LayoutGrid, Mail, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/class-names";
import { bookNavAction } from "./nav-action";
import { stepHref, type BookNav, type StepKey } from "./book-nav";
import { StepNode } from "./StepNode";

/** Разделы, где лента закреплена под шапкой кабинета: свои длинные страницы. У редакторов свои липкие панели — им лента не мешает. */
const STICKY_TAIL = ["/checkout", "/preview", "/letters", "/settings"];

/** Полоска под активным разделом — при переходе «переезжает» на новый. */
function Indicator() {
  return (
    <ViewTransition name="book-tab-indicator" share="indicator" default="none">
      <span className="absolute inset-x-1.5 -bottom-px h-0.5 rounded-t-full bg-wine" />
    </ViewTransition>
  );
}

/**
 * Лента пути книги: «Обзор», шаги работы (вопросы, фото, страницы, обложка, макет, заказ) с их состоянием и два
 * необязательных раздела справа (письма, настройки). Состояние приходит с сервера и обновляется при каждом
 * переходе: layout не перерисовывается, когда автор переходит между разделами внутри книги. На телефоне лента
 * прокручивается, открытый раздел всегда в видимой части.
 */
export function BookTabs({ bookId, nav: initial, kind }: { bookId: string; nav: BookNav; kind: "bank" | "blank" }) {
  const pathname = useLocalePathname();
  const t = useMessages().bookStudio.nav;
  const base = `/books/${bookId}`;
  const scroller = useRef<HTMLElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  // Свежее состояние: серверное (initial) заменяет живое, когда layout перерисовался; иначе берём ответ действия.
  const [seen, setSeen] = useState(initial);
  const [live, setLive] = useState<BookNav | null>(null);
  if (initial !== seen) {
    setSeen(initial);
    setLive(null);
  }
  const nav = live ?? initial;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    let off = false;
    const load = () => void bookNavAction(bookId).then((n) => !off && setLive(n)).catch(() => {});
    load();
    const onVisible = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      off = true;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [bookId, pathname]);

  // Открытый раздел виден на узком экране; тени по краям подсказывают, что ленту можно листать.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const update = () => setEdges({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
    el.querySelector<HTMLElement>('[aria-current="page"]')?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
    const raf = requestAnimationFrame(update);
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [pathname]);

  const checkout = pathname.endsWith("/checkout");
  const sticky = pathname === base || STICKY_TAIL.some((tail) => pathname.endsWith(tail));
  const activeStep = (key: StepKey) => (key === "order" ? checkout : pathname.startsWith(`${base}/${key === "questions" ? "questions" : key}`));
  const stepLabel = (key: StepKey) => (key === "questions" && kind === "blank" ? t.steps.text : t.steps[key]);

  const tab = (active: boolean, quiet = false) => cn("relative flex h-12 shrink-0 items-center gap-2 px-2.5 text-sm font-medium whitespace-nowrap transition-colors max-sm:h-[52px]", active ? "text-ink" : quiet ? "text-muted hover:text-ink" : "text-ink-soft hover:text-ink");
  const overviewActive = pathname === base;
  const mask = `linear-gradient(90deg, ${edges.left ? "transparent" : "#000"} 0, #000 28px, #000 calc(100% - 28px), ${edges.right ? "transparent" : "#000"} 100%)`;

  return (
    <div className={cn("border-b border-line/70 bg-paper/95 backdrop-blur-xl", sticky && "lg:sticky lg:top-[57px] lg:z-30")}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <nav ref={scroller} aria-label={t.aria} className="no-scrollbar -mx-4 flex items-stretch overflow-x-auto px-4 sm:mx-0 sm:px-0" style={{ maskImage: mask, WebkitMaskImage: mask }}>
          <Link href={base} aria-current={overviewActive ? "page" : undefined} className={cn(tab(overviewActive), "-ml-2.5 gap-1.5 pl-2.5")}>
            <LayoutGrid className={cn("size-4", overviewActive && "text-wine")} strokeWidth={1.8} aria-hidden />
            {t.overview}
            {overviewActive ? <Indicator /> : null}
          </Link>
          <span aria-hidden className="mx-1.5 my-auto h-5 w-px shrink-0 bg-line-strong" />
          <ol className="flex items-stretch">
            {nav.steps.map((s, i) => {
              const active = activeStep(s.key);
              const href = stepHref(bookId, s.key, nav);
              return (
                <Fragment key={s.key}>
                  {i > 0 ? <li aria-hidden className={cn("my-auto h-px w-3 shrink-0 sm:w-4", nav.steps[i - 1].status === "done" ? "bg-success/45" : "bg-line-strong")} /> : null}
                  <li className="flex">
                    <Link href={href} aria-current={active ? "page" : undefined} className={tab(active)}>
                      <StepNode status={s.status} fraction={s.fraction} n={i + 1} current={active} />
                      {stepLabel(s.key)}
                      <span className="sr-only">, {t.state[s.status]}</span>
                      {active ? <Indicator /> : null}
                    </Link>
                  </li>
                </Fragment>
              );
            })}
          </ol>
          <span aria-hidden className="mx-1.5 my-auto h-5 w-px shrink-0 bg-line-strong sm:ml-auto" />
          <div role="group" aria-label={t.extrasAria} className="flex items-stretch">
            {(
              [
                ["/letters", t.letters, Mail, nav.letters.pending],
                ["/settings", t.settings, SlidersHorizontal, 0],
              ] as const
            ).map(([tail, label, Icon, count]) => {
              const active = pathname.startsWith(base + tail);
              return (
                <Link key={tail} href={base + tail} aria-current={active ? "page" : undefined} className={tab(active, true)}>
                  <Icon className={cn("size-4", active && "text-wine")} strokeWidth={1.8} aria-hidden />
                  {label}
                  {count ? <span className="count count-alert">{count}</span> : null}
                  {active ? <Indicator /> : null}
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}
