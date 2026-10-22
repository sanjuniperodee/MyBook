import { container } from "@/server/container";
import { Search } from "lucide-react";
import { requireStaffShell } from "@/server/access";
import { logoutAction } from "@/app/(auth)/actions";
import { staffLabel } from "@/shared/domain/staff";
import { AdminNav } from "@/components/admin/AdminNav";
import { CrmLiveProvider, IncomingCall, NotificationBell } from "@/components/admin/CrmLive";
import { Webphone } from "@/components/admin/Webphone";
import { can } from "@/server/access";
import { autoShiftOnVisit } from "@/server/shift";
import { THEME_SCRIPT, ThemeSync, ThemeToggle } from "@/components/admin/Theme";
import { NavMotion } from "@/components/admin/NavMotion";
import { MobileTabBar } from "@/components/admin/MobileTabBar";
import { PullToRefresh } from "@/components/admin/PullToRefresh";
import { layoutTabs, mobileLayout } from "@/shared/domain/mobileLayout";

export const metadata = {
  title: { default: "CRM", template: "%s · CRM" },
  robots: { index: false },
  // Установка CRM на телефон как приложения (PWA) и push-уведомления.
  manifest: "/crm.webmanifest",
  appleWebApp: { capable: true, title: "MyBooks CRM", statusBarStyle: "default" as const },
};

// viewport-fit=cover — экран до краёв (вырез и «домашняя» полоска iPhone учитываются отступами env(safe-area-inset-*)); клавиатура ужимает страницу, а не перекрывает её.
export const viewport = { themeColor: "#7a1f2b", viewportFit: "cover" as const, interactiveWidget: "resizes-content" as const };

// Открыто как установленное приложение — страница не «резинится» при протяжке (см. .crm-shell в globals.css).
const STANDALONE_SCRIPT = `try{if(matchMedia("(display-mode: standalone)").matches||navigator.standalone===true)document.documentElement.dataset.standalone="1"}catch(e){}`;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { staff, gate } = await requireStaffShell();
  if (gate === "2fa") {
    // Владелец включил обязательную 2FA: пока сотрудник её не настроит, доступна только страница «Безопасность».
    return (
      <div className="min-h-dvh bg-[#f7f4ef]">
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <ThemeSync />
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
  // Зашёл в рабочее время — сразу «в сети».
  const onShift = await autoShiftOnVisit(staff);
  const [live, phone] = await Promise.all([container().reporting.live(staff.context), can(staff, "calls.make") ? container().telephony.phone.webphoneAvailable(staff.user.sipExtension) : false]);
  const nav = { adminName: staffLabel(staff.user), roleName: staff.roleName, perms: [...staff.permissions], onShift };
  // Нижняя панель на телефоне — по роли, как в приложении.
  const layout = mobileLayout((p) => can(staff, p), staff.isOwner);
  const tabs = layoutTabs(layout, (p) => can(staff, p));
  return (
    <CrmLiveProvider initial={live}>
      <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      <script dangerouslySetInnerHTML={{ __html: STANDALONE_SCRIPT }} />
      <ThemeSync />
      <div className="crm-shell flex min-h-dvh bg-[#f7f4ef]">
        <AdminNav variant="sidebar" {...nav} />
        <div className="flex min-w-0 flex-1 flex-col">
          <header style={{ viewTransitionName: "crm-topbar" }} className="crm-topbar sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-white/85 px-4 backdrop-blur sm:px-6">
            <form action="/admin/search" className="relative w-full max-w-md">
              <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
              <input name="q" placeholder="Поиск: сделка, заказ, имя, телефон, книга" className="h-9 w-full rounded-xl border border-line bg-[#f7f4ef] pr-3 pl-9 text-sm outline-none focus:border-wine/40 focus:bg-white" />
            </form>
            <div className="ml-auto flex items-center gap-1">
              <ThemeToggle />
              {phone ? <Webphone /> : null}
              <NotificationBell />
            </div>
          </header>
          <main className="crm-main min-w-0 flex-1 px-4 py-5 sm:px-6 lg:py-8">
            <PullToRefresh>{children}</PullToRefresh>
          </main>
        </div>
      </div>
      <NavMotion />
      <MobileTabBar tabs={tabs} profileLabel={layout === "leader" ? "Ещё" : "Профиль"} />
      <IncomingCall />
    </CrmLiveProvider>
  );
}
