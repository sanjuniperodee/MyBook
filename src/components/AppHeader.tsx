import { Logo } from "@/components/Logo";
import { AppNav } from "@/components/AppNav";
import type { User } from "@/lib/db/schema";
import { isStaff } from "@/server/auth";

export function AppHeader({ user }: { user: User }) {
  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-paper/85 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <Logo href="/books" />
        <AppNav name={user.name} email={user.email} isAdmin={isStaff(user)} />
      </div>
    </header>
  );
}
