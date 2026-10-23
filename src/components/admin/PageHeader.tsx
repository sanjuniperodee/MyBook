import { Intro } from "./Intro";

/**
 * Шапка страницы CRM: заголовок, короткое пояснение (длинное сворачивается) и действия справа. Одна для всех страниц
 * блока «Управление» — раньше у каждой был свой отступ, ширина и размер текста.
 */
export function PageHeader({ title, children, actions }: { title: string; children?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
      <div className="min-w-0 max-w-2xl">
        <h1 className="text-2xl font-semibold">{title}</h1>
        {children ? <Intro className="mt-1">{children}</Intro> : null}
      </div>
      {actions ? <div className="flex w-full flex-wrap items-center gap-2 max-lg:[&>.btn-primary]:flex-1 lg:w-auto">{actions}</div> : null}
    </div>
  );
}
