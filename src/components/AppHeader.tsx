import Link from "next/link";
import { LogOut } from "lucide-react";
import { Logo } from "@/components/Logo";
import { logoutAction } from "@/app/(auth)/actions";
import type { User } from "@/lib/db/schema";

export function AppHeader({ user }: { user: User }) {
  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-paper/85 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <Logo href="/books" />
        <nav className="flex items-center gap-1 text-[15px]">
          <Link href="/books" className="hidden rounded-full px-3.5 py-2 text-ink-soft hover:bg-ink/5 hover:text-ink sm:block">Мои книги</Link>
          <Link href="/orders" className="rounded-full px-3.5 py-2 text-ink-soft hover:bg-ink/5 hover:text-ink">Заказы</Link>
          {user.role === "admin" ? (
            <Link href="/admin" className="rounded-full px-3.5 py-2 text-wine hover:bg-wine/5">Админка</Link>
          ) : null}
          <form action={logoutAction}>
            <button className="ml-1 flex items-center gap-2 rounded-full border border-line bg-white px-3.5 py-2 text-sm hover:border-ink/30" title="Выйти">
              <LogOut className="size-4" /> <span className="hidden sm:inline">Выйти</span>
            </button>
          </form>
        </nav>
      </div>
    </header>
  );
}
