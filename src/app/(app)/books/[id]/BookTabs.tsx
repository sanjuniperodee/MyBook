"use client";

import { Link, useLocalePathname, useMessages } from "@/i18n/client";
import { Fragment, useEffect, useRef, useState, ViewTransition } from "react";
import { LayoutGrid, Mail, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/class-names";
import { bookNavAction } from "./nav-action";
import { stepHref, type BookNav, type StepKey, type StepStatus } from "./book-nav";
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

  // Пять шагов вместо семи: обложка и страницы — «Оформить», макет и заказ — «Заказать» (DESIGN.md §7.3 кабинета).
  const step = (key: StepKey) => nav.steps.find((x) => x.key === key)!;
  const cover = step("cover");
  const orderStep = step("order");
  const groups: { key: string; label: string; href: string; status: StepStatus; fraction: number; active: boolean }[] = [
    { key: "write", label: kind === "blank" ? t.steps.text : t.groups.write, href: stepHref(bookId, "questions", nav), status: step("questions").status, fraction: step("questions").fraction, active: activeStep("questions") },
    { key: "photos", label: t.groups.photos, href: stepHref(bookId, "photos", nav), status: step("photos").status, fraction: step("photos").fraction, active: activeStep("photos") },
    { key: "design", label: t.groups.design, href: stepHref(bookId, "cover", nav), status: cover.status, fraction: cover.fraction, active: activeStep("cover") || activeStep("pages") },
    {
      key: "order",
      label: t.groups.order,
      // До заказа — сначала макет: пролистать книгу перед оплатой; после — страница заказа.
      href: nav.ordered ? stepHref(bookId, "order", nav) : stepHref(bookId, "preview", nav),
      status: orderStep.status,
      fraction: orderStep.fraction,
      active: activeStep("preview") || activeStep("order"),
    },
  ];
  const tab = (active: boolean, quiet = false) => cn("relative flex h-12 shrink-0 items-center gap-2 px-2.5 text-sm font-medium whitespace-nowrap transition-colors max-sm:h-[52px]", active ? "text-ink" : quiet ? "text-muted hover:text-ink" : "text-ink-soft hover:text-ink");
  const overviewActive = pathname === base;
  const mask = `linear-gradient(90deg, ${edges.left ? "transparent" : "#000"} 0, #000 28px, #000 calc(100% - 28px), ${edges.right ? "transparent" : "#000"} 100%)`;

  return (
    // При письме на телефоне ленты нет: экран — вопросу и ответу, к шагам — через «назад» в обзор книги.
    <div className={cn("border-b border-line/70 bg-paper/95 backdrop-blur-xl", sticky && "lg:sticky lg:top-[57px] lg:z-30", pathname.endsWith("/questions") && "max-sm:hidden")}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <nav ref={scroller} aria-label={t.aria} className="no-scrollbar -mx-4 flex items-stretch overflow-x-auto px-4 sm:mx-0 sm:px-0" style={{ maskImage: mask, WebkitMaskImage: mask }}>
          <Link href={base} aria-current={overviewActive ? "page" : undefined} className={cn(tab(overviewActive), "-ml-2.5 gap-1.5 pl-2.5")}>
            <LayoutGrid className={cn("size-4", overviewActive && "text-wine")} strokeWidth={1.8} aria-hidden />
            {t.overview}
            {overviewActive ? <Indicator /> : null}
          </Link>
          <span aria-hidden className="mx-1.5 my-auto h-5 w-px shrink-0 bg-line-strong" />
          <ol className="flex items-stretch">
            {groups.map((g, i) => {
              const active = g.active;
              return (
                <Fragment key={g.key}>
                  {i > 0 ? <li aria-hidden className={cn("my-auto h-px w-3 shrink-0 sm:w-4", groups[i - 1].status === "done" ? "bg-success/45" : "bg-line-strong")} /> : null}
                  <li className="flex">
                    <Link href={g.href} aria-current={active ? "page" : undefined} className={tab(active)}>
                      <StepNode status={g.status} fraction={g.fraction} n={i + 1} current={active} />
                      {g.label}
                      <span className="sr-only">, {t.state[g.status]}</span>
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
                ["/letters", t.letters, Mail, nav.letters.pending, false],
                ["/settings", t.settings, SlidersHorizontal, 0, true],
              ] as const
            ).map(([tail, label, Icon, count, iconOnly]) => {
              const active = pathname.startsWith(base + tail);
              return (
                <Link key={tail} href={base + tail} aria-current={active ? "page" : undefined} aria-label={iconOnly ? label : undefined} title={iconOnly ? label : undefined} className={tab(active, true)}>
                  <Icon className={cn("size-4", active && "text-wine")} strokeWidth={1.8} aria-hidden />
                  {iconOnly ? null : label}
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
