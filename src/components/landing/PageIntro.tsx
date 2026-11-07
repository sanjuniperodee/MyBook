import type { CSSProperties, ReactNode } from "react";
import { Breadcrumbs } from "@/components/seo/Breadcrumbs";
import { Flourish } from "@/components/landing/FilmFrame";
import { coverPhotoUrl } from "@/lib/book/photo-cover";
import { cn } from "@/lib/class-names";

/**
 * Начало «бумажной» страницы витрины (идеи, блог, сертификат, документы): крошки, титр засечками и росчерк —
 * тот же, что на «кадре», только винный. Отступ сверху — под фиксированную шапку.
 * `kicker` — короткая подпись над титром, `aside` — справа от титра на широком экране (пояснение, счётчик, действие).
 */
export function PageIntro({
  crumbs,
  title,
  lead,
  children,
  className,
  narrow,
  kicker,
  aside,
}: {
  crumbs?: { name: string; href?: string }[];
  title: ReactNode;
  lead?: ReactNode;
  children?: ReactNode;
  className?: string;
  /** Узкая колонка — для статьи и документов. */
  narrow?: boolean;
  kicker?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <header className={cn("pt-28 pb-12 sm:pt-36 sm:pb-16", className)}>
      <div className={cn("container-x", narrow && "max-w-3xl")}>
        {crumbs ? <Breadcrumbs items={crumbs} /> : null}
        <div className={cn(aside && "lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-end lg:gap-14")}>
          <div className="min-w-0">
            {kicker ? <div className="mb-3 text-sm font-medium text-wine">{kicker}</div> : null}
            <h1 className="max-w-4xl font-serif text-[42px] leading-[1.04] font-medium tracking-[-0.01em] text-balance sm:text-6xl">{title}</h1>
            <Flourish className="mt-3 text-wine/45" />
            {lead ? <div className="mt-5 max-w-2xl text-lg leading-relaxed text-ink-soft">{lead}</div> : null}
            {children}
          </div>
          {aside ? <div className="mt-8 lg:mt-0">{aside}</div> : null}
        </div>
      </div>
    </header>
  );
}

const srcSet = (key: string) => [600, 900, 1600].map((w) => `${coverPhotoUrl(key, w)} ${w}w`).join(", ");

/**
 * «Кадр» поменьше — снимок коллекции в тонкой рамке с затемнением внизу и подписью поверх. Витринный образ для
 * плашек вторичных страниц (главный материал блога, шапка каталога, призыв в конце статьи). Основа — `bg-spine`:
 * тёмная в обеих темах. Затемнение — единственный градиент, который допускает система (DESIGN.md §2).
 */
export function PhotoPlate({
  photo,
  position = "50% 40%",
  sizes = "(min-width: 1024px) 60vw, 100vw",
  className,
  children,
  priority,
  frame = true,
  shade = "bottom",
}: {
  photo: string;
  position?: string;
  sizes?: string;
  className?: string;
  children?: ReactNode;
  priority?: boolean;
  frame?: boolean;
  /** bottom — затемнение снизу под подпись; side — слева под титр; full — ровное. */
  shade?: "bottom" | "side" | "full";
}) {
  return (
    <div className={cn("relative isolate flex flex-col justify-end overflow-hidden rounded-[14px] bg-spine text-white", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- готовые уменьшенные копии из /api/cover-photos, кэш навсегда */}
      <img
        src={coverPhotoUrl(photo, 900)}
        srcSet={srcSet(photo)}
        sizes={sizes}
        alt=""
        decoding="async"
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
        className="absolute inset-0 -z-20 size-full object-cover"
        style={{ objectPosition: position } as CSSProperties}
      />
      <div
        aria-hidden
        className={cn(
          "absolute inset-0 -z-10",
          shade === "bottom" && "bg-[linear-gradient(0deg,rgb(14_9_8/0.88)_0%,rgb(14_9_8/0.5)_42%,rgb(14_9_8/0.06)_100%)]",
          shade === "side" && "bg-[linear-gradient(90deg,rgb(14_9_8/0.86)_0%,rgb(14_9_8/0.55)_46%,rgb(14_9_8/0.1)_100%)]",
          shade === "full" && "bg-[rgb(14_9_8/0.55)]",
        )}
      />
      {frame ? <div aria-hidden className="pointer-events-none absolute inset-2 rounded-[8px] border border-[rgb(255_255_255/0.26)] sm:inset-3" /> : null}
      {children}
    </div>
  );
}
