import { container } from "@/server/container";
import { requireStaff } from "@/server/access";
import { formatDate } from "@/lib/dates";
import { Intro } from "@/components/admin/Intro";
import { Section } from "@/components/admin/Section";
import { StaffForm, StaffRow } from "../TeamControls";

export const metadata = { title: "Команда" };

export default async function AdminTeam() {
  const staff = await requireStaff("team.manage");
  const [roles, members] = await Promise.all([container().access.queries.roles(), container().access.queries.team()]);
  const ownerRole = roles.find((r) => r.key === "owner");
  const roleOptions = roles.filter((r) => r.key !== "owner" || staff.isOwner).map((r) => ({ id: r.id, name: r.name }));

  return (
    <div className="space-y-6">
      <div className="overflow-x-auto rounded-2xl border border-line bg-white">
        <table className="w-full text-sm max-lg:block lg:min-w-[860px]">
          <thead className="border-b border-line text-left text-muted max-lg:hidden">
            <tr>
              <th className="px-4 py-3 font-medium">Сотрудник</th>
              <th className="px-4 py-3 font-medium">Роль</th>
              <th className="px-4 py-3 font-medium">Внутр. номер</th>
              <th className="px-4 py-3 font-medium">Телефон (WhatsApp)</th>
              <th className="px-4 py-3 font-medium">Нагрузка</th>
              <th className="px-4 py-3 font-medium">Последний вход</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line max-lg:block">
            {members.map(({ user: u, openDeals, calls7d }) => (
              <StaffRow
                key={u.id}
                member={{
                  id: u.id,
                  name: u.name,
                  email: u.email,
                  roleId: u.crmRoleId ?? ownerRole?.id ?? "",
                  extension: u.sipExtension ?? "",
                  phone: u.phone ?? "",
                  disabled: u.staffDisabled,
                  lastSeen: u.lastSeenAt ? formatDate(u.lastSeenAt, true) : "—",
                  load: `${openDeals} сделок · ${calls7d} звонков за 7 дней`,
                }}
                roles={roles.map((r) => ({ id: r.id, name: r.name }))}
                isSelf={u.id === staff.user.id}
                canTouchOwner={staff.isOwner}
                isOwner={!u.crmRoleId || u.crmRoleId === ownerRole?.id}
              />
            ))}
          </tbody>
        </table>
      </div>
      <Section title="Добавить сотрудника" defaultOpen={false}>
        <StaffForm roles={roleOptions} />
        <Intro small className="mt-3">
          Если e-mail уже зарегистрирован, аккаунт получит доступ к CRM с выбранной ролью. Пустой пароль — сгенерируем и покажем один раз. Внутренний номер — добавочный в АТС: по нему звонки из CRM идут с
          телефона сотрудника, а входящие привязываются к нему.
        </Intro>
      </Section>
    </div>
  );
}
