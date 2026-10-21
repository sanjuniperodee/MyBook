import Link from "next/link";
import { Lock, Plus } from "lucide-react";
import { container } from "@/server/container";
import { requireStaff } from "@/server/access";
import { allPermissions, type Permission } from "@/shared/domain/permissions";
import { Intro } from "@/components/admin/Intro";
import { cn } from "@/lib/class-names";
import { RoleEditor } from "./RoleEditor";

export const metadata = { title: "Роли и права" };

/** Роли списком слева, выбранная — одним редактором справа: четыре карточки по два десятка галочек подряд не сравнить и не пролистать. */
export default async function RolesPage({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  const staff = await requireStaff("team.manage");
  const { role: want } = await searchParams;
  const roles = await container().access.queries.rolesWithMembers();
  const creating = want === "new";
  const current = creating ? null : (roles.find((r) => r.role.id === want) ?? roles.find((r) => r.role.id === staff.user.crmRoleId) ?? roles[0]);
  const item = (href: string, active: boolean, children: React.ReactNode) => (
    <Link href={href} aria-current={active ? "page" : undefined} className={cn("flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition-colors", active ? "bg-rose/40 font-medium text-wine" : "text-ink-soft hover:bg-cream/70")}>
      {children}
    </Link>
  );
  return (
    <div className="space-y-5">
      <Intro>
        Роль — это набор прав и видимость. «Только свои» — сотрудник видит сделки, чаты и клиентов, где он ответственный, плюс неразобранные. Руководитель всегда видит всё. Права проверяются на сервере: скрытая
        кнопка — не единственная защита.
      </Intro>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-[15rem_minmax(0,1fr)]">
        <nav aria-label="Роли" className="space-y-0.5">
          {roles.map(({ role, members }) =>
            item(
              `/admin/team/roles?role=${role.id}`,
              current?.role.id === role.id,
              <>
                <span className="min-w-0 flex-1 truncate">{role.name}</span>
                {role.key ? <Lock className="size-3 shrink-0 text-muted" aria-label="системная" /> : null}
                <span className="shrink-0 text-xs text-muted tabular-nums">{members}</span>
              </>,
            ),
          )}
          {item(
            "/admin/team/roles?role=new",
            creating,
            <>
              <Plus className="size-4" /> Новая роль
            </>,
          )}
        </nav>
        <div className="min-w-0">
          {current ? (
            <RoleEditor
              key={current.role.id}
              role={{
                id: current.role.id,
                name: current.role.name,
                scope: current.role.scope,
                permissions: (current.role.key === "owner" ? allPermissions : current.role.permissions) as Permission[],
                system: !!current.role.key,
                locked: current.role.key === "owner",
                members: current.members,
              }}
              isOwnRole={staff.user.crmRoleId === current.role.id}
            />
          ) : (
            <RoleEditor key="new" role={null} isOwnRole={false} />
          )}
        </div>
      </div>
    </div>
  );
}
