import { asc, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { crmRoles, users } from "@/lib/db/schema";
import { requireStaff } from "@/lib/crm/rbac";
import { allPermissions, type Permission } from "@/lib/crm/permissions";
import { RoleEditor } from "./RoleEditor";

export const metadata = { title: "Роли и права" };

export default async function RolesPage() {
  const staff = await requireStaff("team.manage");
  const roles = await db
    .select({ role: crmRoles, members: sql<number>`(select count(*)::int from ${users} u where u.crm_role_id = ${crmRoles.id} and u.role = 'admin')` })
    .from(crmRoles)
    .orderBy(asc(crmRoles.createdAt));
  return (
    <div className="space-y-5">
      <p className="max-w-3xl text-sm text-muted">
        Роль — это набор прав и видимость. «Только свои» — сотрудник видит сделки, чаты и клиентов, где он ответственный, плюс неразобранные. Руководитель всегда видит всё. Права проверяются на
        сервере: скрытая кнопка — не единственная защита.
      </p>
      <div className="grid gap-4 xl:grid-cols-2">
        {roles.map(({ role, members }) => (
          <RoleEditor
            key={role.id}
            role={{
              id: role.id,
              name: role.name,
              scope: role.scope,
              permissions: (role.key === "owner" ? allPermissions : role.permissions) as Permission[],
              system: !!role.key,
              locked: role.key === "owner",
              members,
            }}
            isOwnRole={staff.user.crmRoleId === role.id}
          />
        ))}
        <RoleEditor role={null} isOwnRole={false} />
      </div>
    </div>
  );
}
