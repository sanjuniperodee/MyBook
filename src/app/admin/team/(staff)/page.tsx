import { container } from "@/server/container";
import { requireStaff } from "@/server/access";
import { formatDate } from "@/lib/dates";
import { Intro } from "@/components/admin/Intro";
import { Section } from "@/components/admin/Section";
import { Panel } from "@/components/ui/Panel";
import { StaffForm, StaffRow } from "../TeamControls";

export const metadata = { title: "Команда" };

export default async function AdminTeam() {
  const staff = await requireStaff("team.manage");
  const [roles, members] = await Promise.all([container().access.queries.roles(), container().access.queries.team()]);
  const ownerRole = roles.find((r) => r.key === "owner");
  const roleOptions = roles.filter((r) => r.key !== "owner" || staff.isOwner).map((r) => ({ id: r.id, name: r.name }));

  return (
    <div className="space-y-4">
      <Section title="Добавить сотрудника" defaultOpen={false} description="E-mail, роль и пароль — доступ к CRM появится сразу">
        <StaffForm roles={roleOptions} />
        <Intro small className="mt-3">
          Если e-mail уже зарегистрирован, аккаунт получит доступ к CRM с выбранной ролью. Пустой пароль — сгенерируем и покажем один раз. Внутренний номер — добавочный в АТС: по нему звонки из CRM идут с
          телефона сотрудника, а входящие привязываются к нему.
        </Intro>
      </Section>
      <Panel flush title={<>Сотрудники <span className="font-normal text-muted tabular-nums">{members.length}</span></>} description="Роль, внутренний номер и телефон сохраняются сразу при изменении">
        <div className="lg:overflow-x-auto">
          <table className="table max-lg:block lg:min-w-[960px] lg:[&_td:first-child]:pl-5 lg:[&_th:first-child]:pl-5 lg:[&_td:last-child]:pr-5 lg:[&_th:last-child]:pr-5">
            <thead className="max-lg:hidden">
              <tr>
                <th>Сотрудник</th>
                <th>Роль</th>
                <th>Внутр. номер</th>
                <th>Телефон (WhatsApp)</th>
                <th>Нагрузка</th>
                <th>Последний вход</th>
                <th>
                  <span className="sr-only">Действия</span>
                </th>
              </tr>
            </thead>
            <tbody className="max-lg:block max-lg:divide-y max-lg:divide-line">
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
                    load: `${openDeals} сделок, ${calls7d} звонков за 7 дней`,
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
      </Panel>
    </div>
  );
}
