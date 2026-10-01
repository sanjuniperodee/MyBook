import { container } from "@/server/container";
import { can, requireStaffShell } from "@/server/access";
import { getSetting } from "@/modules/workspace";
import { adminLabel } from "@/modules/access/ui";
import { trustedClientIp } from "@/server/rateLimit";
import { formatDate } from "@/lib/utils";
import { IpAllowlistForm, ResetStaffButton, TwoFactorCard } from "./SecurityControls";

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
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Безопасность</h1>
        <p className="mt-1 text-sm text-muted">Двухфакторный вход защищает CRM, даже если пароль утёк: кроме пароля нужен код из приложения на телефоне.</p>
      </div>
      {gate === "2fa" ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" data-testid="require-2fa">
          Руководитель сделал двухфакторный вход обязательным. Настройте его ниже — после этого откроется вся CRM.
        </p>
      ) : null}

      <TwoFactorCard enabled={!!staff.user.totpEnabledAt} since={staff.user.totpEnabledAt ? formatDate(staff.user.totpEnabledAt) : null} backupLeft={staff.user.totpBackup.length} canDisable={require2fa !== "on" || staff.isOwner} />

      {manage && gate !== "2fa" ? (
        <>
          <IpAllowlistForm require2fa={require2fa === "on"} allowlist={allowlist} currentIp={ip} ownerHas2fa={!!staff.user.totpEnabledAt} />
          <section className="rounded-2xl border border-line bg-white p-5">
            <h2 className="mb-3 font-semibold">2FA у сотрудников</h2>
            <ul className="divide-y divide-line text-sm" data-testid="team-2fa">
              {team.map((u) => (
                <li key={u.id} className="flex items-center gap-3 py-2.5">
                  <span className={u.staffDisabled ? "text-muted line-through" : ""}>{adminLabel({ name: u.name, email: u.email })}</span>
                  <span className={u.totpEnabledAt ? "rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800" : "rounded-full bg-cream px-2 py-0.5 text-xs text-muted"}>{u.totpEnabledAt ? `включена с ${formatDate(u.totpEnabledAt)}` : "не настроена"}</span>
                  {u.totpEnabledAt && u.id !== staff.user.id ? <ResetStaffButton userId={u.id} name={adminLabel({ name: u.name, email: u.email })} /> : null}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted">
              Потеряли доступ ко всем аккаунтам руководителя? На сервере: <code className="rounded bg-cream px-1">node scripts/crm-security-reset.mjs</code> — снимет ограничения по IP и обязательную 2FA, а с <code className="rounded bg-cream px-1">--email адрес</code> ещё и сбросит 2FA этому сотруднику.
            </p>
          </section>
        </>
      ) : null}
    </div>
  );
}
