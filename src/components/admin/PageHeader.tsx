import { BackLink } from "./BackLink";
import { Intro } from "./Intro";

/**
 * Шапка страницы CRM (DESIGN.md §6–7) — одна на все страницы: «назад» (для экранов уровнем ниже), заголовок, мета
 * (номер, статус — справа от заголовка), короткое пояснение (длинное сворачивается) и действия справа. На телефоне
 * главная кнопка растягивается на ширину, остальные — рядом.
 */
export function PageHeader({
  title,
  children,
  actions,
  back,
  meta,
}: {
  title: React.ReactNode;
  children?: React.ReactNode;
  actions?: React.ReactNode;
  back?: { href: string; label: string };
  meta?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-1">
      {back ? <BackLink href={back.href}>{back.label}</BackLink> : null}
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 max-w-3xl">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            {meta}
          </div>
          {children ? <Intro className="mt-1">{children}</Intro> : null}
        </div>
        {actions ? <div className="flex w-full flex-wrap items-center gap-2 max-lg:[&>.btn-dark]:flex-1 max-lg:[&>.btn-primary]:flex-1 lg:w-auto">{actions}</div> : null}
      </div>
    </header>
  );
}
