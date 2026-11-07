/**
 * Шапка инструмента книги (обложка, страницы, фото, письма, настройки, макет): название засечками, одна-две строки —
 * зачем этот раздел, справа — главное действие. Одна и та же на всех вкладках, чтобы они читались как один продукт.
 */
export function ToolHeader({ title, description, actions }: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-4 sm:mb-8">
      <div className="max-w-2xl min-w-0">
        <h1 className="font-serif text-[32px] leading-tight font-medium sm:text-[40px]">{title}</h1>
        {description ? <p className="mt-1.5 text-[15px] leading-relaxed text-pretty text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2 max-sm:w-full">{actions}</div> : null}
    </header>
  );
}
