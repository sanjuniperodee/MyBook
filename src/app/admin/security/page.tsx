import { PageHeader } from "@/components/admin/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Panel } from "@/components/ui/Panel";
import { cn } from "@/lib/class-names";
import { container } from "@/server/container";
import { can, requireStaffShell } from "@/server/access";
import { getSetting } from "@/modules/workspace";
import { staffLabel } from "@/shared/domain/staff";
import { trustedClientIp } from "@/server/rateLimit";
import { formatDate } from "@/lib/dates";
import {
  IpAllowlistForm,
  ResetStaffButton,
  TwoFactorCard,
} from "./SecurityControls";

export const metadata = { title: "Безопасность" };

export default async function SecurityPage() {
  const { staff, gate } = await requireStaffShell();
  const manage = can(staff, "settings.manage", "team.manage");
  const [require2fa, allowlist, ip, team] = await Promise.all([
    getSetting("security.require2fa"),
    getSetting("security.ipAllowlist"),
    trustedClientIp(),
    manage && gate !== "2fa"
      ? container().access.queries.twoFactorStatus()
      : Promise.resolve([]),
  ]);
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <PageHeader title="Безопасность">
        Двухфакторный вход защищает CRM, даже если пароль утёк: кроме пароля
        нужен код из приложения на телефоне.
      </PageHeader>
      {gate === "2fa" ? (
        <Alert kind="warning">
          <span data-testid="require-2fa">
            Руководитель сделал двухфакторный вход обязательным. Настройте его
            ниже — после этого откроется вся CRM.
          </span>
        </Alert>
      ) : null}

      <TwoFactorCard
        enabled={!!staff.user.totpEnabledAt}
        since={
          staff.user.totpEnabledAt ? formatDate(staff.user.totpEnabledAt) : null
        }
        backupLeft={staff.user.totpBackup.length}
        canDisable={require2fa !== "on" || staff.isOwner}
      />

      {manage && gate !== "2fa" ? (
        <>
          <IpAllowlistForm
            require2fa={require2fa === "on"}
            allowlist={allowlist}
            currentIp={ip}
            ownerHas2fa={!!staff.user.totpEnabledAt}
          />
          <Panel
            flush
            title="2FA у сотрудников"
            actions={
              <Badge
                tone={
                  team.every((u) => u.totpEnabledAt || u.staffDisabled)
                    ? "success"
                    : "neutral"
                }
              >
                {team.filter((u) => u.totpEnabledAt).length} из {team.length}
              </Badge>
            }
          >
            <ul className="divide-y divide-line text-sm" data-testid="team-2fa">
              {team.map((u) => (
                <li
                  key={u.id}
                  className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 sm:px-5"
                >
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate",
                      u.staffDisabled && "text-muted line-through",
                    )}
                  >
                    {staffLabel({ name: u.name, email: u.email })}
                  </span>
                  <Badge tone={u.totpEnabledAt ? "success" : "neutral"}>
                    {u.totpEnabledAt
                      ? `включена с ${formatDate(u.totpEnabledAt)}`
                      : "не настроена"}
                  </Badge>
                  {u.totpEnabledAt && u.id !== staff.user.id ? (
                    <ResetStaffButton
                      userId={u.id}
                      name={staffLabel({ name: u.name, email: u.email })}
                    />
                  ) : null}
                </li>
              ))}
            </ul>
            <p className="border-t border-line px-4 py-3 text-xs text-muted sm:px-5">
              Потеряли доступ ко всем аккаунтам руководителя? На сервере:{" "}
              <code className="rounded-md bg-sunken px-1">
                node scripts/crm-security-reset.mjs
              </code>{" "}
              — снимет ограничения по IP и обязательную 2FA, а с{" "}
              <code className="rounded-md bg-sunken px-1">--email адрес</code>{" "}
              ещё и сбросит 2FA этому сотруднику.
            </p>
          </Panel>
        </>
      ) : null}
    </div>
  );
}
