import { AppHeader } from "@/components/AppHeader";
import { requireUser } from "@/server/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="min-h-dvh">
      <AppHeader user={user} />
      {children}
    </div>
  );
}
