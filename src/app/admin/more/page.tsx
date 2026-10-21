import { requireStaff, can } from "@/server/access";
import { MoreMenu } from "@/components/admin/MoreMenu";
import { layoutTabs, mobileLayout } from "@/shared/domain/mobileLayout";

export const metadata = { title: "Ещё" };

const HREFS = { overview: "/admin", chats: "/admin/chats", tasks: "/admin/tasks", deals: "/admin/deals", clients: "/admin/clients", orders: "/admin/board", calls: "/admin/calls" } as const;

/** «Ещё» / «Профиль» — последняя вкладка нижней панели на телефоне: профиль, смена, остальные разделы, тема, установка, выход. */
export default async function MorePage() {
  const staff = await requireStaff();
  const has = (p: Parameters<typeof can>[1]) => can(staff, p);
  const tabs = layoutTabs(mobileLayout(has, staff.isOwner), has);
  return <MoreMenu name={staff.user.name || staff.user.email} role={staff.roleName} email={staff.user.email} perms={[...staff.permissions]} onShift={staff.user.onShift} tabHrefs={tabs.map((t) => HREFS[t])} />;
}
