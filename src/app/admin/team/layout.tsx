import { can, requireStaff } from "@/server/access";
import { TeamTabs } from "./TeamTabs";

export default async function TeamLayout({ children }: { children: React.ReactNode }) {
  const staff = await requireStaff("team.manage");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Команда</h1>
        <p className="mt-1 text-sm text-muted">Кто работает в CRM, что каждому доступно и что они меняли.</p>
      </div>
      <TeamTabs showAudit={can(staff, "audit.view")} />
      {children}
    </div>
  );
}
