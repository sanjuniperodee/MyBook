import { ViewTransition } from "react";

/**
 * Страница CRM как экран приложения: при переходе экран целиком въезжает/уезжает (направление — NavMotion, стили — globals.css, .crm-page).
 * Шапка и нижняя панель — вне template, поэтому остаются на месте. Полоса -mx растягивает экран на всю ширину, чтобы края не просвечивали.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition enter="crm-page" exit="crm-page" default="none">
      <div className="crm-page -mx-4 px-4 sm:-mx-6 sm:px-6">{children}</div>
    </ViewTransition>
  );
}
