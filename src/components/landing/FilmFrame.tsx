import type { ReactNode } from "react";
import type { ThemeId } from "@/lib/content/types";
import { coverPhotoUrl } from "@/lib/book/photo-cover";
import { cn } from "@/lib/class-names";

/**
 * «Кадр фильма» — главный образ витрины (docs/design/DESIGN.md §1): снимок во всю ширину, затемнение, тонкая рамка
 * и титр засечками. Фото — встроенные снимки коллекции (assets/cover-photos, лицензия Unsplash), отдаются
 * /api/cover-photos с нужной шириной; next/image не нужен — файлы уже уменьшены и кэшируются навсегда.
 * Основа — `bg-spine`: тёмная в обеих темах, поэтому кадр выглядит одинаково и в тёмной витрине.
 */

/** Снимок кадра по теме книги: люди, о которых эта книга. */
export const themePhoto: Record<ThemeId, { key: string; position?: string }> = {
  love: { key: "couple", position: "50% 30%" },
  mom: { key: "mamahug", position: "60% 30%" },
  dad: { key: "daddy", position: "50% 25%" },
  parents: { key: "family", position: "50% 25%" },
  family: { key: "family", position: "50% 25%" },
  grandma: { key: "familydusk", position: "50% 60%" },
  grandpa: { key: "familydusk", position: "50% 60%" },
  daughterinlaw: { key: "family", position: "50% 25%" },
  child: { key: "newborn", position: "50% 45%" },
  sibling: { key: "laughter", position: "50% 40%" },
  friend: { key: "friends", position: "50% 30%" },
  teacher: { key: "autumn", position: "50% 50%" },
  autobiography: { key: "familydusk", position: "50% 60%" },
  blank: { key: "postcards", position: "50% 50%" },
};

const srcSet = (key: string) => [900, 1600, 2400].map((w) => `${coverPhotoUrl(key, w)} ${w}w`).join(", ");

export function FilmFrame({
  photo,
  position = "50% 40%",
  mobilePosition,
  priority,
  size = "screen",
  children,
  aside,
  className,
  id,
  label,
}: {
  photo: string;
  /** object-position снимка на широком экране. */
  position?: string;
  /** object-position на телефоне: кадр узкий — лица держим в нём (по умолчанию — как position). */
  mobilePosition?: string;
  /** Первый экран: снимок — самое крупное на странице (LCP), грузится сразу. */
  priority?: boolean;
  /** screen — первый экран целиком; band — полоса (финальный призыв, 404). */
  size?: "screen" | "band";
  children: ReactNode;
  /** Справа на широком экране — например, книга с этим же снимком на обложке. */
  aside?: ReactNode;
  className?: string;
  id?: string;
  label?: string;
}) {
  return (
    <section
      id={id}
      aria-label={label}
      className={cn(
        "relative isolate flex flex-col justify-end overflow-hidden bg-spine text-white",
        size === "screen" ? "min-h-[max(620px,100svh)] lg:min-h-[min(100svh,980px)]" : "min-h-[560px] sm:min-h-[620px]",
        className,
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- готовые уменьшенные копии из /api/cover-photos, кэш навсегда */}
      <img
        src={coverPhotoUrl(photo, 1600)}
        srcSet={srcSet(photo)}
        sizes="100vw"
        alt=""
        decoding="async"
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
        className="absolute inset-x-0 top-0 -z-20 h-[62%] w-full object-cover [object-position:var(--pos-m)] lg:inset-0 lg:h-full lg:[object-position:var(--pos)]"
        style={{ "--pos": position, "--pos-m": mobilePosition ?? position } as React.CSSProperties}
      />
      {/*
        Затемнение. Телефон: снимок занимает верх, ниже он уходит в тёмную основу — под титр и кнопки.
        Широкий экран: снимок во весь кадр, темнее слева — под титр.
      */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgb(14_9_8/0.55)_0%,rgb(14_9_8/0)_15%,rgb(14_9_8/0.08)_26%,rgb(20_14_13/0.45)_37%,rgb(20_14_13/0.82)_47%,var(--color-spine)_60%)] lg:bg-[linear-gradient(90deg,rgb(14_9_8/0.86)_0%,rgb(14_9_8/0.6)_42%,rgb(14_9_8/0.12)_78%),linear-gradient(0deg,rgb(14_9_8/0.55)_0%,transparent_45%),linear-gradient(180deg,rgb(14_9_8/0.5)_0%,transparent_22%)]"
      />
      {/* Тонкая рамка кадра; на первом экране — под шапкой, чтобы линия не резала меню. */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-2.5 border border-[rgb(255_255_255/0.26)] sm:inset-4 lg:inset-5",
          size === "screen" && "top-[68px]! sm:top-[76px]! lg:top-[76px]!",
        )}
      />
      <div className={cn("container-x relative w-full sm:px-10 xl:px-6", size === "screen" ? "pt-28 pb-12 sm:pb-16 lg:pb-20" : "py-16 sm:py-20")}>
        {aside ? (
          <div className="grid items-end gap-10 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-16">
            <div className="min-w-0">{children}</div>
            <div className="hidden lg:block">{aside}</div>
          </div>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

/** Росчерк под титром — рисуется один раз при загрузке (класс .draw; при «уменьшении движения» сразу целиком). */
export function Flourish({ className }: { className?: string }) {
  return (
    <svg className={cn("draw pointer-events-none h-5 w-56 sm:h-6 sm:w-72", className)} viewBox="0 0 288 24" fill="none" aria-hidden>
      <path
        d="M2 15 C 46 6, 98 5, 146 11 S 228 20, 262 10 C 272 7, 280 3, 284 6 C 287 9, 280 14, 271 12"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        style={{ "--len": 330, "--d": 500 } as React.CSSProperties}
      />
    </svg>
  );
}

/** Кнопки на кадре: вторичная — прозрачная со светлой линией (в обеих темах). */
export const frameGhostBtn = "btn btn-lg border border-[rgb(255_255_255/0.45)] text-white hover:bg-[rgb(255_255_255/0.1)] hover:border-[rgb(255_255_255/0.7)]";
