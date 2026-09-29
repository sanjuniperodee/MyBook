import { Search } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { crmCounters, adminLabel } from "@/lib/crm";
import { AdminNav } from "@/components/admin/AdminNav";

export const metadata = { title: { default: "CRM", template: "%s · CRM" }, robots: { index: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  const counters = await crmCounters(admin.id);
  return (
    <div className="flex min-h-dvh bg-[#f7f4ef]">
      <AdminNav variant="sidebar" counters={counters} adminName={adminLabel(admin)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-white/85 px-4 backdrop-blur sm:px-6">
          <AdminNav variant="mobile" counters={counters} adminName={adminLabel(admin)} />
          <form action="/admin/search" className="relative w-full max-w-md">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
            <input name="q" placeholder="Поиск: № заказа, имя, e-mail, телефон, книга" className="h-9 w-full rounded-xl border border-line bg-[#f7f4ef] pr-3 pl-9 text-sm outline-none focus:border-wine/40 focus:bg-white" />
          </form>
        </header>
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
