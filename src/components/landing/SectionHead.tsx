import { cn } from "@/lib/class-names";

/**
 * Заголовок раздела витрины: засечками слева, пояснение — справа на широком экране и под ним на телефоне.
 * `kicker` — короткая винная подпись над титром; `level` — уровень заголовка в разметке (по умолчанию h2).
 */
export function SectionHead({
  title,
  note,
  id,
  className,
  kicker,
  level = 2,
}: {
  title: string;
  note?: string;
  id?: string;
  className?: string;
  kicker?: string;
  level?: 2 | 3;
}) {
  const H = level === 3 ? "h3" : "h2";
  return (
    <div className={cn("flex flex-col gap-4 md:flex-row md:items-end md:justify-between md:gap-12", className)}>
      <div className="min-w-0">
        {kicker ? <div className="mb-2 text-sm font-medium text-wine">{kicker}</div> : null}
        <H id={id} className="max-w-2xl font-serif text-4xl leading-[1.05] font-medium tracking-tight text-balance sm:text-5xl">
          {title}
        </H>
      </div>
      {note ? <p className="max-w-sm leading-relaxed text-muted md:pb-1.5">{note}</p> : null}
    </div>
  );
}
