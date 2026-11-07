import type { ReactNode } from "react";
import { cn } from "@/lib/class-names";

/**
 * Заголовок раздела главной: засечками слева, пояснение (и действие) — справа от него на широком экране и под ним на
 * телефоне. Свой, а не общий SectionHead: общий ведёт другая группа и может измениться независимо.
 */
export function Head({ title, note, id, className, children }: { title: ReactNode; note?: ReactNode; id?: string; className?: string; children?: ReactNode }) {
  return (
    <div className={cn("flex flex-col gap-4 md:flex-row md:items-end md:justify-between md:gap-12", className)}>
      <h2 id={id} className="max-w-2xl font-serif text-[34px] leading-[1.05] font-medium tracking-tight text-balance sm:text-5xl">
        {title}
      </h2>
      {note || children ? (
        <div className="max-w-sm md:pb-1.5">
          {note ? <p className="leading-relaxed text-muted">{note}</p> : null}
          {children}
        </div>
      ) : null}
    </div>
  );
}
