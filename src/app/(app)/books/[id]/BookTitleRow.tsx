/**
 * Шапка книги: липкая полоса 56 px сверху — на месте шапки кабинета, которая в книге не показывается. Под вырезом экрана —
 * отступ safe-area, как у шапки кабинета: от этой высоты отсчитывают липкие панели редакторов (`--ed-top`, `top-[57px]`).
 */
export function BookTitleRow({ children }: { children: React.ReactNode }) {
  return <header className="sticky top-0 z-40 border-b border-line bg-paper/90 pt-[env(safe-area-inset-top)] backdrop-blur-xl">{children}</header>;
}
