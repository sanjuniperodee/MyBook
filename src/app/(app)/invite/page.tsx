import type { Metadata } from "next";
import { requireUser } from "@/server/auth";
import { container } from "@/server/container";
import { inviteUrl, REFERRAL } from "@/modules/referrals";
import { getLocale, getMessages } from "@/i18n/server";
import { Panel } from "@/components/ui/Panel";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/class-names";
import { formatDate } from "@/lib/dates";
import { PageHead } from "../_components/PageHead";
import { InviteShare } from "./InviteShare";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).invite.meta };
}

/**
 * Приглашения: слева своя ссылка (скопировать, отправить) и как это работает по шагам, справа — итог: сколько друзей
 * заказало и какие промокоды за это получены. На телефоне итог идёт сразу после ссылки.
 */
export default async function InvitePage() {
  const user = await requireUser("/invite");
  const referrals = container().referrals.service;
  const code = await referrals.invite(user.id);
  const [summary, locale, m] = await Promise.all([referrals.summary(user.id), getLocale(), getMessages()]);
  const t = m.invite;
  const link = inviteUrl(code, locale);
  const now = new Date();
  const steps = t.steps(REFERRAL.friendPercent, REFERRAL.rewardPercent);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <PageHead title={t.title} lead={<span className="block max-w-2xl sm:text-base">{t.lead(REFERRAL.friendPercent, REFERRAL.rewardPercent)}</span>} />

      <div className="mt-8 grid gap-6 sm:mt-10 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-10">
        <Panel title={t.yourLink} className="min-w-0 lg:col-start-1 lg:row-start-1">
          <InviteShare link={link} code={code} message={t.message(link, REFERRAL.friendPercent)} />
        </Panel>

        <Panel title={t.statsTitle} className="min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start">
          <div className="flex items-baseline gap-3">
            <span className="font-serif text-5xl leading-none font-medium tabular-nums">{summary.friends}</span>
          </div>
          <p className="mt-2 text-sm text-ink-soft">{t.friends(summary.friends)}</p>
          {summary.rewards.length ? (
            <>
              <h3 className="mt-6 text-sm font-medium text-muted">{t.rewards}</h3>
              <ul className="mt-2 divide-y divide-line">
                {summary.rewards.map((r) => {
                  const expired = !r.used && !!r.expiresAt && r.expiresAt < now;
                  const status = r.used ? t.used : expired ? t.expired : r.expiresAt ? t.until(formatDate(r.expiresAt, false, locale)) : "";
                  return (
                    <li key={r.code} className={cn("py-3", (r.used || expired) && "opacity-60")}>
                      <div className="flex items-center justify-between gap-3">
                        <code className="font-mono text-sm tracking-wider">{r.code}</code>
                        {status ? <Badge tone={r.used || expired ? "neutral" : "success"}>{status}</Badge> : null}
                      </div>
                      <div className="mt-0.5 text-xs text-muted">{r.chat ? t.rewardForChat(r.orderNumber) : t.rewardFor(r.orderNumber)}</div>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : null}
        </Panel>

        <Panel title={t.stepsTitle} className="min-w-0 lg:col-start-1 lg:row-start-2">
          <ol className="space-y-5">
            {steps.map((s, i) => (
              <li key={i} className={cn("relative pl-11", i < steps.length - 1 && "before:absolute before:top-8 before:-bottom-5 before:left-[13px] before:w-px before:bg-line-strong")}>
                <span className="absolute top-0 left-0 flex size-7 items-center justify-center rounded-full bg-rose text-sm font-semibold text-wine tabular-nums">{i + 1}</span>
                <span className="block pt-0.5 leading-relaxed text-ink-soft">{s}</span>
              </li>
            ))}
          </ol>
          <p className="mt-6 text-xs leading-relaxed text-muted">{t.rules}</p>
        </Panel>
      </div>
    </main>
  );
}
