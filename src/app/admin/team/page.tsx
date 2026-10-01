import { container } from "@/server/container";
import { requireStaff } from "@/server/access";
import { formatDate } from "@/lib/utils";
import { StaffForm, StaffRow } from "./TeamControls";

export const metadata = { title: "Команда" };

export default async function AdminTeam() {
  const staff = await requireStaff("team.manage");
  const [roles, members] = await Promise.all([container().access.queries.roles(), container().access.queries.team()]);
  const ownerRole = roles.find((r) => r.key === "owner");
  const roleOptions = roles.filter((r) => r.key !== "owner" || staff.isOwner).map((r) => ({ id: r.id, name: r.name }));

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-line bg-white p-5">
        <h2 className="mb-4 font-semibold">Добавить сотрудника</h2>
        <StaffForm roles={roleOptions} />
        <p className="mt-3 text-xs text-muted">
          Если e-mail уже зарегистрирован, аккаунт получит доступ к CRM с выбранной ролью. Пустой пароль — сгенерируем и покажем один раз. Внутренний номер — добавочный в АТС: по нему звонки из CRM
          идут с телефона сотрудника, а входящие привязываются к нему.
        </p>
      </section>
      <div className="overflow-x-auto rounded-2xl border border-line bg-white">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="border-b border-line text-left text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Сотрудник</th>
              <th className="px-4 py-3 font-medium">Роль</th>
              <th className="px-4 py-3 font-medium">Внутр. номер</th>
              <th className="px-4 py-3 font-medium">Нагрузка</th>
              <th className="px-4 py-3 font-medium">Последний вход</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {members.map(({ user: u, openDeals, calls7d }) => (
              <StaffRow
                key={u.id}
                member={{
                  id: u.id,
                  name: u.name,
                  email: u.email,
                  roleId: u.crmRoleId ?? ownerRole?.id ?? "",
                  extension: u.sipExtension ?? "",
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
    </div>
  );
}
