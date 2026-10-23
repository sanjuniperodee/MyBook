import { can, requireStaff } from "@/server/access";
import { PageHeader } from "@/components/admin/PageHeader";
import { TeamTabs } from "./TeamTabs";

export default async function TeamLayout({ children }: { children: React.ReactNode }) {
  const staff = await requireStaff("team.manage");
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader title="Команда">Кто работает в CRM, что каждому доступно и что они меняли.</PageHeader>
      <TeamTabs showAudit={can(staff, "audit.view")} />
      {children}
    </div>
  );
}
