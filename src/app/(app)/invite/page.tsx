import type { Metadata } from "next";
import { Gift } from "lucide-react";
import { requireUser } from "@/server/auth";
import { container } from "@/server/container";
import { inviteUrl, REFERRAL } from "@/modules/referrals";
import { getLocale, getMessages } from "@/i18n/server";
import { cn, formatDate } from "@/lib/utils";
import { InviteShare } from "./InviteShare";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).invite.meta };
}

/** Приглашения: своя ссылка для друзей, кто уже заказал и какие промокоды за это получены. */
export default async function InvitePage() {
  const user = await requireUser("/invite");
  const referrals = container().referrals.service;
  const code = await referrals.invite(user.id);
  const [summary, locale, m] = await Promise.all([referrals.summary(user.id), getLocale(), getMessages()]);
  const t = m.invite;
  const link = inviteUrl(code, locale);
  const now = new Date();

  return (
    <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
      <div className="eyebrow">{t.eyebrow}</div>
      <h1 className="mt-3 font-serif text-4xl leading-tight font-medium text-balance sm:text-5xl">{t.title}</h1>
      <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-soft">{t.lead(REFERRAL.friendPercent, REFERRAL.rewardPercent)}</p>

      <section className="card mt-10 overflow-hidden">
        <div className="flex flex-col gap-6 bg-[linear-gradient(120deg,#fbf3ef,#fff)] p-6 sm:p-8">
          <InviteShare link={link} code={code} message={t.message(link, REFERRAL.friendPercent)} />
        </div>
      </section>

      <div className="mt-6 grid gap-6 md:grid-cols-[1.2fr_1fr]">
        <section className="card p-6 sm:p-8">
          <h2 className="text-lg font-semibold">{t.stepsTitle}</h2>
          <ol className="mt-5 space-y-4">
            {t.steps(REFERRAL.friendPercent, REFERRAL.rewardPercent).map((s, i) => (
              <li key={i} className="flex gap-3.5">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-rose text-sm font-semibold text-wine">{i + 1}</span>
                <span className="leading-relaxed text-ink-soft">{s}</span>
              </li>
            ))}
          </ol>
          <p className="mt-6 text-xs text-muted">{t.rules}</p>
        </section>

        <section className="card p-6 sm:p-8">
          <h2 className="text-lg font-semibold">{t.statsTitle}</h2>
          <p className="mt-3 text-ink-soft">{t.friends(summary.friends)}</p>
          {summary.rewards.length ? (
            <>
              <h3 className="mt-6 text-sm font-medium text-muted">{t.rewards}</h3>
              <ul className="mt-3 space-y-2.5">
                {summary.rewards.map((r) => {
                  const expired = !r.used && !!r.expiresAt && r.expiresAt < now;
                  return (
                    <li key={r.code} className={cn("flex items-center gap-3 rounded-xl border border-line px-3.5 py-2.5", (r.used || expired) && "opacity-60")}>
                      <Gift className="size-4 shrink-0 text-wine" />
                      <div className="min-w-0 flex-1">
                        <code className="font-mono text-sm tracking-wider">{r.code}</code>
                        <div className="text-xs text-muted">
                          {t.rewardFor(r.orderNumber)} · {r.used ? t.used : expired ? t.expired : r.expiresAt ? t.until(formatDate(r.expiresAt, false, locale)) : ""}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : null}
        </section>
      </div>
    </main>
  );
}
