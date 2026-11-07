"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/class-names";

/** Раздел карточки: left — главное и действия (слева), context — переписка, история, звонки (справа, липкая колонка). */
export interface WorkspaceTab {
  key: string;
  label: string;
  /** Число рядом с названием (непрочитанные, звонки). */
  count?: number | null;
  /** Счётчик требует действия — винная плашка. */
  alert?: boolean;
  node: React.ReactNode;
}

/** Событие «открой раздел»: кнопки в шапке сделки и панель действий на телефоне переключают разделы, не зная о состоянии. */
export const OPEN_DEAL_TAB = "deal-open-tab";
export type OpenDealTab = { tab: string; scrollTo?: string };

/** Кнопка, открывающая раздел карточки сделки (и, если нужно, прокручивающая к элементу с этим id). */
export function OpenTabButton({ tab, scrollTo, className, children, ...rest }: OpenDealTab & { className?: string; children: React.ReactNode } & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "className" | "children">) {
  return (
    <button type="button" className={className} onClick={() => window.dispatchEvent(new CustomEvent<OpenDealTab>(OPEN_DEAL_TAB, { detail: { tab, scrollTo } }))} {...rest}>
      {children}
    </button>
  );
}

/**
 * Разворот карточки сделки (DESIGN.md §7.2): слева разделы «Обзор / Оплата / Детали» (вкладки), справа — липкая колонка
 * контекста со своими вкладками «Переписка / История / Звонки». Уже 1280 px колонки встают одна под другой, и все разделы
 * собираются в одну полосу вкладок под шапкой (на телефоне она липнет к верху). Все разделы отрисованы сразу и только
 * прячутся — формы не теряют набранное при переключении.
 */
export function DealWorkspace({ left, context, initial = "overview" }: { left: WorkspaceTab[]; context: WorkspaceTab[]; initial?: string }) {
  const [leftTab, setLeftTab] = useState(() => (left.some((t) => t.key === initial) ? initial : left[0].key));
  const [ctxTab, setCtxTab] = useState(() => (context.some((t) => t.key === initial) ? initial : (context[0]?.key ?? "")));
  const [focus, setFocus] = useState<"left" | "ctx">(() => (context.some((t) => t.key === initial) ? "ctx" : "left"));

  const open = (key: string) => {
    if (left.some((t) => t.key === key)) {
      setLeftTab(key);
      setFocus("left");
    } else if (context.some((t) => t.key === key)) {
      setCtxTab(key);
      setFocus("ctx");
    }
  };

  useEffect(() => {
    const on = (e: Event) => {
      const { tab, scrollTo } = (e as CustomEvent<OpenDealTab>).detail;
      if (left.some((t) => t.key === tab)) {
        setLeftTab(tab);
        setFocus("left");
      } else if (context.some((t) => t.key === tab)) {
        setCtxTab(tab);
        setFocus("ctx");
      }
      if (scrollTo) requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            const el = document.getElementById(scrollTo);
            el?.scrollIntoView({ behavior: "smooth", block: "center" });
            if (el instanceof HTMLInputElement) el.focus({ preventScroll: true });
          }),
        );
    };
    window.addEventListener(OPEN_DEAL_TAB, on);
    return () => window.removeEventListener(OPEN_DEAL_TAB, on);
  }, [left, context]);

  const bar = (items: WorkspaceTab[], selected: (key: string) => boolean, className?: string) => (
    <div className={cn("tabs m-hscroll", className)} role="tablist" aria-label="Разделы сделки">
      {items.map((t) => (
        <button key={t.key} type="button" role="tab" aria-selected={selected(t.key)} aria-controls={`deal-panel-${t.key}`} onClick={() => open(t.key)} className="tab max-lg:h-11 max-lg:text-sm">
          {t.label}
          {t.count ? <span className={cn("count", t.alert && "count-alert")}>{t.count}</span> : null}
        </button>
      ))}
    </div>
  );

  return (
    <div data-focus={focus}>
      {/* До 1280: все разделы одной полосой, липнет под шапкой. */}
      <div className="sticky top-[var(--topbar-h)] z-10 -mx-4 mb-4 bg-canvas px-4 pt-1 xl:hidden">{bar([...left, ...context], (k) => k === (focus === "left" ? leftTab : ctxTab))}</div>
      <div className="xl:grid xl:grid-cols-[minmax(0,47rem)_minmax(0,1fr)] xl:items-start xl:gap-5">
        <div className="min-w-0">
          {bar(left, (k) => k === leftTab, "mb-4 max-xl:hidden")}
          <div className="space-y-4 lg:space-y-5">
            {left.map((t) => (
              <div key={t.key} id={`deal-panel-${t.key}`} role="tabpanel" aria-label={t.label} className={cn("space-y-4 lg:space-y-5", leftTab !== t.key ? "hidden" : focus !== "left" && "max-xl:hidden")}>
                {t.node}
              </div>
            ))}
          </div>
        </div>
        {context.length ? (
          <aside aria-label="Контекст сделки" className={cn("min-w-0 xl:sticky xl:top-[calc(var(--topbar-h)+1rem)] xl:h-[calc(100dvh-var(--topbar-h)-2rem)]", focus !== "ctx" && "max-xl:hidden")}>
            <section className="panel flex h-full min-h-0 flex-col overflow-hidden">
              {bar(context, (k) => k === ctxTab, "px-2 max-xl:hidden")}
              {context.map((t) => (
                <div key={t.key} id={`deal-panel-${t.key}`} role="tabpanel" aria-label={t.label} className={cn("min-h-0 flex-1 flex-col", ctxTab === t.key ? "flex" : "hidden")}>
                  {t.node}
                </div>
              ))}
            </section>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
