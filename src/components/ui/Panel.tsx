import { cn } from "@/lib/class-names";

/**
 * Лист (DESIGN.md §6): белая панель на холсте с заголовком и действиями. Без тени — линия; содержимое с полями
 * (flush — без полей: таблица или список на всю ширину листа).
 */
export function Panel({
  title,
  description,
  actions,
  children,
  flush,
  className,
  id,
  as: Tag = "section",
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  flush?: boolean;
  className?: string;
  id?: string;
  as?: "section" | "div" | "article";
}) {
  return (
    <Tag id={id} className={cn("panel scroll-mt-[calc(var(--topbar-h)+1rem)]", className)}>
      {title || actions ? (
        <header className="panel-head">
          <div className="min-w-0">
            {title ? <h2 className="panel-title">{title}</h2> : null}
            {description ? <p className="mt-0.5 text-xs text-muted">{description}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}
      <div className={flush ? undefined : "panel-body"}>{children}</div>
    </Tag>
  );
}
