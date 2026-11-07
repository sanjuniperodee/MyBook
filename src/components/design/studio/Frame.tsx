"use client";

/**
 * Рама студии оформления: панель с переключателями сверху, слева выбор, в центре сцена с живым результатом, справа
 * свойства. На телефоне — своя раскладка: сцена закреплена под шапкой на ~45% экрана, под ней вкладки, ниже — лист
 * инструментов, который прокручивается под сценой. Рама только раскладывает; что внутри — решает страница.
 */
import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/class-names";

/** Высота липкой шапки кабинета (h-14 + рамка). */
const HEADER = 57;

export function StudioFrame({
  bar,
  left,
  right,
  stage,
  mobileTabs,
  sheet,
  leftOnMobile,
  rightOnMobile,
  leftWidth = 300,
  rightWidth = 320,
  wideRight = false,
  className,
}: {
  /** Панель над колонками: заголовок, режимы, сохранение. Липкая на компьютере. */
  bar: ReactNode;
  /** Левая и правая панели (компьютер); на телефоне их вкладки — в листе. */
  left?: ReactNode;
  right?: ReactNode;
  /** Сцена: StudioStage. */
  stage: ReactNode;
  /** Вкладки листа на телефоне — закреплены под сценой. */
  mobileTabs?: ReactNode;
  /** Содержимое листа на телефоне (не нужно, если лист — сама боковая панель, см. leftOnMobile и rightOnMobile). */
  sheet?: ReactNode;
  /**
   * Панель, которая держит своё состояние (ИИ-дизайнер, студия оформления), в разметке одна: на телефоне она не
   * дублируется в листе, а сама становится листом под сценой. Остальные панели в листе просто рисуются заново.
   */
  leftOnMobile?: boolean;
  rightOnMobile?: boolean;
  leftWidth?: number;
  rightWidth?: number;
  /**
   * Широкая правая панель (выбор обложки, стиля страниц): сцена и галерея делят экран почти поровну, миниатюры крупные.
   * Ширина — до rightWidth, но не меньше 400 px и около половины окна.
   */
  wideRight?: boolean;
  className?: string;
}) {
  const cols = [left ? "var(--sl)" : null, "minmax(0,1fr)", right ? "var(--sr)" : null].filter(Boolean).join(" ");
  return (
    <div className={cn("studio", className)} style={{ "--sl": `clamp(250px, 24vw, ${leftWidth}px)`, "--sr": wideRight ? `clamp(400px, 48vw, ${rightWidth}px)` : `clamp(270px, 26vw, ${rightWidth}px)`, "--studio-h": "clamp(520px, calc(100dvh - 240px), 780px)", "--studio-top": `${HEADER + 64}px`, "--studio-cols": cols } as CSSProperties}>
      <div className="mb-3 lg:sticky lg:top-[57px] lg:z-30 lg:-mx-2 lg:mb-2 lg:bg-paper/90 lg:px-2 lg:py-1.5 lg:backdrop-blur-xl">{bar}</div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-(--studio-cols) lg:items-start lg:gap-5">
        {left ? <aside className={cn("flex-col overflow-hidden lg:sticky lg:top-(--studio-top) lg:flex lg:h-(--studio-h) lg:rounded-[var(--r-panel)] lg:border lg:border-line lg:bg-white", leftOnMobile ? "flex max-lg:order-3 max-lg:pt-3" : "hidden")}>{left}</aside> : null}
        <div className="min-w-0 max-lg:order-1">
          <div className="-mx-4 bg-paper px-4 pb-1 max-lg:sticky max-lg:top-[57px] max-lg:z-20 sm:-mx-6 sm:px-6 lg:sticky lg:top-(--studio-top) lg:mx-0 lg:bg-transparent lg:p-0">
            {stage}
            {mobileTabs ? <div className="mt-1 border-b border-line lg:hidden">{mobileTabs}</div> : null}
          </div>
          {sheet ? <div className="min-h-[46dvh] pt-4 lg:hidden">{sheet}</div> : null}
        </div>
        {right ? <aside className={cn("flex-col overflow-hidden lg:sticky lg:top-(--studio-top) lg:flex lg:h-(--studio-h) lg:rounded-[var(--r-panel)] lg:border lg:border-line lg:bg-white", rightOnMobile ? "flex max-lg:order-3 max-lg:pt-3" : "hidden")}>{right}</aside> : null}
      </div>
    </div>
  );
}

/** Сцена: поле с живым результатом (контейнер для единиц cqh), над ним — панель инструментов, под ним — подпись. */
export function StudioStage({ children, toolbar, foot, overlay, className }: { children: ReactNode; toolbar?: ReactNode; foot?: ReactNode; overlay?: ReactNode; className?: string }) {
  return (
    <div className="flex flex-col gap-2 lg:h-(--studio-h)">
      {toolbar}
      <div className={cn("relative h-[min(38dvh,20rem)] min-h-0 overflow-hidden rounded-[var(--r-sheet)] bg-sunken lg:h-auto lg:flex-1", className)} style={{ containerType: "size" }}>
        {children}
        {overlay}
      </div>
      {foot}
    </div>
  );
}

/** Панель колонки: вкладки сверху (не прокручиваются), ниже — прокручиваемое тело. */
export function PanelBody({ tabs, children, className }: { tabs?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <>
      {tabs ? <div className="shrink-0 border-b border-line px-2 max-lg:hidden">{tabs}</div> : null}
      <div className={cn("min-h-0 flex-1 lg:overflow-y-auto lg:p-4", className)}>{children}</div>
    </>
  );
}
