import { Logo } from "@/components/Logo";
import { AppNav } from "@/components/AppNav";
import type { User } from "@/server/auth";
import { isStaff } from "@/server/auth";

/**
 * Шапка кабинета: знак, разделы (Книги, Заказы, Аккаунт), язык, тема и профиль. Высота — 56 px: от неё отсчитывают
 * липкие панели книги. На телефоне надпись MYBOOKS убрана, вместо неё — название раздела (AppNav). Под вырезом экрана —
 * отступ safe-area.
 */
export function AppHeader({ user }: { user: User }) {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/90 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4 sm:px-6">
        <Logo href="/books" className="shrink-0 max-lg:[&>span]:hidden" />
        <AppNav name={user.name} email={user.email} isAdmin={isStaff(user)} />
      </div>
    </header>
  );
}
