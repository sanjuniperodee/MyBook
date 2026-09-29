import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { LogoMark } from "@/components/Logo";

export const metadata = { title: "Админка", robots: { index: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div className="min-h-dvh bg-[#f6f3ee]">
      <header className="sticky top-0 z-40 border-b border-line bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4 sm:px-6">
          <Link href="/admin" className="flex items-center gap-2 font-semibold">
            <LogoMark className="size-7" /> Админка
          </Link>
          <nav className="flex gap-1 text-sm">
            <Link href="/admin" className="rounded-lg px-3 py-1.5 hover:bg-ink/5">Обзор</Link>
            <Link href="/admin/orders" className="rounded-lg px-3 py-1.5 hover:bg-ink/5">Заказы</Link>
            <Link href="/admin/users" className="rounded-lg px-3 py-1.5 hover:bg-ink/5">Клиенты</Link>
            <Link href="/admin/promo" className="rounded-lg px-3 py-1.5 hover:bg-ink/5">Промокоды</Link>
          </nav>
          <Link href="/books" className="ml-auto text-sm text-muted hover:text-ink">← На сайт</Link>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
