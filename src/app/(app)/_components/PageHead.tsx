import { cn } from "@/lib/class-names";

/**
 * Заголовок страницы кабинета: название шрифтом книги, пояснение и действия справа. На телефоне название раздела уже
 * в шапке («где я»), поэтому здесь оно остаётся только для экранного диктора — на экране сразу пояснение и действие.
 */
export function PageHead({ title, lead, actions, className }: { title: string; lead?: React.ReactNode; actions?: React.ReactNode; className?: string }) {
  return (
    <header className={cn("flex items-end justify-between gap-x-6 gap-y-3 max-md:items-center", className)}>
      <div className="min-w-0">
        <h1 className="font-serif text-4xl leading-tight font-medium sm:text-5xl max-md:sr-only">{title}</h1>
        {lead ? <p className="mt-1.5 text-sm text-muted sm:text-[15px] max-md:mt-0">{lead}</p> : null}
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </header>
  );
}
