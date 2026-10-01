import { Search } from "lucide-react";
import { requireStaffShell } from "@/lib/crm/rbac";
import { logoutAction } from "@/app/(auth)/actions";
import { adminLabel } from "@/lib/crm";
import { getLive } from "@/lib/crm/live";
import { AdminNav } from "@/components/admin/AdminNav";
import { CrmLiveProvider, IncomingCall, NotificationBell } from "@/components/admin/CrmLive";
import { Webphone } from "@/components/admin/Webphone";
import { webphoneAvailable } from "@/lib/crm/telephony";
import { can } from "@/lib/crm/rbac";

export const metadata = {
  title: { default: "CRM", template: "%s · CRM" },
  robots: { index: false },
  // Установка CRM на телефон как приложения (PWA) и push-уведомления.
  manifest: "/crm.webmanifest",
  appleWebApp: { capable: true, title: "MyBooks CRM", statusBarStyle: "default" as const },
};

export const viewport = { themeColor: "#7a1f2b" };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { staff, gate } = await requireStaffShell();
  if (gate === "2fa") {
    // Владелец включил обязательную 2FA: пока сотрудник её не настроит, доступна только страница «Безопасность».
    return (
      <div className="min-h-dvh bg-[#f7f4ef]">
        <header className="flex h-14 items-center justify-between border-b border-line bg-white px-4 sm:px-6">
          <span className="font-semibold">MyBooks CRM</span>
          <form action={logoutAction}>
            <button className="text-sm text-muted hover:text-ink">Выйти</button>
          </form>
        </header>
        <main className="px-4 py-8 sm:px-6">{children}</main>
      </div>
    );
  }
  const [live, phone] = await Promise.all([getLive(staff), can(staff, "calls.make") ? webphoneAvailable(staff.user.sipExtension) : false]);
  const nav = { adminName: adminLabel(staff.user), roleName: staff.roleName, perms: [...staff.permissions], onShift: staff.user.onShift };
  return (
    <CrmLiveProvider initial={live}>
      <div className="flex min-h-dvh bg-[#f7f4ef]">
        <AdminNav variant="sidebar" {...nav} />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-white/85 px-4 backdrop-blur sm:px-6">
            <AdminNav variant="mobile" {...nav} />
            <form action="/admin/search" className="relative w-full max-w-md">
              <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
              <input name="q" placeholder="Поиск: сделка, заказ, имя, телефон, книга" className="h-9 w-full rounded-xl border border-line bg-[#f7f4ef] pr-3 pl-9 text-sm outline-none focus:border-wine/40 focus:bg-white" />
            </form>
            <div className="ml-auto flex items-center gap-1">
              {phone ? <Webphone /> : null}
              <NotificationBell />
            </div>
          </header>
          <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:py-8">{children}</main>
        </div>
      </div>
      <IncomingCall />
    </CrmLiveProvider>
  );
}
