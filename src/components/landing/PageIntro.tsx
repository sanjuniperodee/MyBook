import type { ReactNode } from "react";
import { Breadcrumbs } from "@/components/seo/Breadcrumbs";
import { Flourish } from "@/components/landing/FilmFrame";
import { cn } from "@/lib/class-names";

/**
 * Начало «бумажной» страницы витрины (идеи, блог, сертификат, документы): крошки, титр засечками и росчерк —
 * тот же, что на «кадре», только винный. Отступ сверху — под фиксированную шапку.
 */
export function PageIntro({
  crumbs,
  title,
  lead,
  children,
  className,
  narrow,
}: {
  crumbs?: { name: string; href?: string }[];
  title: ReactNode;
  lead?: ReactNode;
  children?: ReactNode;
  className?: string;
  /** Узкая колонка — для статьи и документов. */
  narrow?: boolean;
}) {
  return (
    <header className={cn("pt-28 pb-12 sm:pt-36 sm:pb-16", className)}>
      <div className={cn("container-x", narrow && "max-w-3xl")}>
        {crumbs ? <Breadcrumbs items={crumbs} /> : null}
        <h1 className="max-w-4xl font-serif text-[42px] leading-[1.04] font-medium tracking-[-0.01em] text-balance sm:text-6xl">{title}</h1>
        <Flourish className="mt-3 text-wine/45" />
        {lead ? <div className="mt-5 max-w-2xl text-lg leading-relaxed text-ink-soft">{lead}</div> : null}
        {children}
      </div>
    </header>
  );
}
