import { Logo } from "@/components/Logo";
import { AppNav } from "@/components/AppNav";
import type { User } from "@/server/auth";
import { isStaff } from "@/server/auth";
import { ShopThemeToggle } from "@/components/ShopTheme";

/**
 * Шапка кабинета: знак, переключатель темы, разделы и профиль. На телефоне — только знак без надписи: надпись
 * MYBOOKS налезала на кнопки. Высота — 56 px, под вырезом экрана — отступ safe-area.
 */
export function AppHeader({ user }: { user: User }) {
  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-paper/90 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
        <Logo href="/books" className="shrink-0 max-sm:[&>span]:hidden" />
        <div className="flex min-w-0 items-center gap-1 sm:gap-2">
          <ShopThemeToggle className="size-11" />
          <AppNav name={user.name} email={user.email} isAdmin={isStaff(user)} />
        </div>
      </div>
    </header>
  );
}
