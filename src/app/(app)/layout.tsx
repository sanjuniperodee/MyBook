import { AppHeader } from "@/components/AppHeader";
import { AppTabBar } from "@/components/AppNav";
import type { Metadata } from "next";
import { requireUser } from "@/server/auth";

/** Личный кабинет: ни одна страница не должна попадать в выдачу. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * Оболочка кабинета: шапка сверху, страница, на телефоне — нижняя панель разделов. Колонка на всю высоту экрана: нижняя
 * панель лежит в потоке последней и прилипает к низу, поэтому короткая страница не оставляет её посреди экрана.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader user={user} />
      <div className="flex-1">{children}</div>
      <AppTabBar />
    </div>
  );
}
