import { AppHeader } from "@/components/AppHeader";
import type { Metadata } from "next";
import { requireUser } from "@/server/auth";

/** Личный кабинет: ни одна страница не должна попадать в выдачу. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="min-h-dvh">
      <AppHeader user={user} />
      {children}
    </div>
  );
}
