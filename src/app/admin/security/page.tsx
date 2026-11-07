import Link from "next/link";
import { PageHeader } from "@/components/admin/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/class-names";
import { container } from "@/server/container";
import { can, requireStaffShell } from "@/server/access";
import { getSetting } from "@/modules/workspace";
import { staffLabel } from "@/shared/domain/staff";
import { trustedClientIp } from "@/server/rateLimit";
import { formatDate } from "@/lib/dates";
import { SettingsFrame } from "../settings/frame";
import { Section } from "../settings/ui";
import { IpAllowlistForm, RecoveryNote, ResetStaffButton, TwoFactorCard } from "./SecurityControls";

export const metadata = { title: "Безопасность" };

export default async function SecurityPage() {
  const { staff, gate } = await requireStaffShell();
  const manage = can(staff, "settings.manage", "team.manage") && gate !== "2fa";
  const [require2fa, allowlist, ip, team] = await Promise.all([getSetting("security.require2fa"), getSetting("security.ipAllowlist"), trustedClientIp(), manage ? container().access.queries.twoFactorStatus() : Promise.resolve([])]);
  const has2fa = !!staff.user.totpEnabledAt;
  const restricted = !!allowlist.trim();
  const covered = team.filter((u) => u.totpEnabledAt).length;
  const everyone = team.every((u) => u.totpEnabledAt || u.staffDisabled);
  const anchors = [
    { id: "my-2fa", label: "Ваш вход" },
    ...(manage
      ? [
          { id: "team-rules", label: "Правила команды" },
          { id: "team-2fa", label: "2FA сотрудников" },
        ]
      : []),
  ];
  /** Строка обзора защиты: состояние точкой и подписью, пояснение и действие. */
  const row = (title: string, tone: "success" | "warning" | "neutral", state: string, text: React.ReactNode, action?: React.ReactNode) => (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-5">
      <div className="min-w-0 flex-1 basis-64">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className="text-sm font-semibold">{title}</span>
          <Badge tone={tone}>{state}</Badge>
        </div>
        <p className="mt-0.5 text-xs text-muted">{text}</p>
      </div>
      {action}
    </li>
  );
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <PageHeader title="Безопасность">Двухфакторный вход защищает CRM, даже если пароль утёк: кроме пароля нужен код из приложения на телефоне.</PageHeader>
      {gate === "2fa" ? (
        <Alert kind="warning">
          <span data-testid="require-2fa">Руководитель сделал двухфакторный вход обязательным. Настройте его ниже — после этого откроется вся CRM.</span>
        </Alert>
      ) : null}

      <section aria-label="Состояние защиты" className="panel">
        <ul className="divide-y divide-line">
          {row("Пароль", "neutral", "вход по паролю", "Пароль меняется в личном кабинете аккаунта.", (
            <Link href="/account" className="btn btn-outline btn-sm">
              Сменить пароль
            </Link>
          ))}
          {row(
            "Двухфакторный вход",
            has2fa ? "success" : "warning",
            has2fa ? "включён" : "выключен",
            has2fa ? "При входе кроме пароля нужен код из приложения." : "Без него доступ к CRM защищает только пароль.",
            <a href="#my-2fa" className={cn("btn btn-sm", has2fa ? "btn-outline" : "btn-dark")}>
              {has2fa ? "Управлять" : "Включить 2FA"}
            </a>,
          )}
          {manage
            ? row(
                "Вход с адресов",
                restricted ? "success" : "neutral",
                restricted ? "только из разрешённых сетей" : "без ограничений",
                <>
                  Ваш текущий адрес: <b className="font-mono">{ip}</b>
                </>,
                <a href="#team-rules" className="btn btn-outline btn-sm">
                  Настроить
                </a>,
              )
            : row("Ваш адрес", "neutral", ip, "С него вы сейчас в CRM.")}
        </ul>
      </section>

      <SettingsFrame anchors={anchors}>
        <TwoFactorCard enabled={has2fa} since={staff.user.totpEnabledAt ? formatDate(staff.user.totpEnabledAt) : null} backupLeft={staff.user.totpBackup.length} canDisable={require2fa !== "on" || staff.isOwner} />
        {manage ? (
          <>
            <IpAllowlistForm require2fa={require2fa === "on"} allowlist={allowlist} currentIp={ip} ownerHas2fa={has2fa} />
            <Section id="team-2fa" title="2FA у сотрудников" description="У кого включён двухфакторный вход" status={everyone ? { tone: "ok", label: `${covered} из ${team.length}` } : { tone: "warn", label: `${covered} из ${team.length}` }}>
              <ul className="-my-1 divide-y divide-line text-sm" data-testid="team-2fa">
                {team.map((u) => (
                  <li key={u.id} className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 py-2">
                    <span className={cn("min-w-0 flex-1 truncate", u.staffDisabled && "text-muted line-through")}>{staffLabel({ name: u.name, email: u.email })}</span>
                    <Badge tone={u.totpEnabledAt ? "success" : "neutral"}>{u.totpEnabledAt ? `включена с ${formatDate(u.totpEnabledAt)}` : "не настроена"}</Badge>
                    {u.totpEnabledAt && u.id !== staff.user.id ? <ResetStaffButton userId={u.id} name={staffLabel({ name: u.name, email: u.email })} /> : null}
                  </li>
                ))}
              </ul>
              <div className="mt-4 border-t border-line pt-4">
                <RecoveryNote />
              </div>
            </Section>
          </>
        ) : null}
      </SettingsFrame>
    </div>
  );
}
