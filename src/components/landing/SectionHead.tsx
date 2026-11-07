import { cn } from "@/lib/class-names";

/** Заголовок раздела витрины: засечками слева, пояснение — справа на широком экране и под ним на телефоне. */
export function SectionHead({ title, note, id, className }: { title: string; note?: string; id?: string; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-4 md:flex-row md:items-end md:justify-between md:gap-12", className)}>
      <h2 id={id} className="max-w-2xl font-serif text-4xl leading-[1.05] font-medium tracking-tight text-balance sm:text-5xl">
        {title}
      </h2>
      {note ? <p className="max-w-sm leading-relaxed text-muted md:pb-1.5">{note}</p> : null}
    </div>
  );
}
