import type { Metadata } from "next";
import { requireUser } from "@/server/auth";
import { site } from "@/config/site";
import { PasswordForm, ProfileForm } from "./AccountForms";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { Facts } from "@/components/ui/Facts";
import { Badge } from "@/components/ui/Badge";
import { getMessages } from "@/i18n/server";
import { PageHead } from "../_components/PageHead";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).orders.account.meta };
}

/** Одна группа настроек: слева название и пояснение (на широком экране липкие), справа лист с содержимым. */
function Group({ id, title, text, children }: { id: string; title: string; text: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="grid scroll-mt-20 gap-4 py-8 first:pt-0 last:pb-0 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-10">
      <div className="lg:sticky lg:top-24 lg:self-start">
        <h2 id={`${id}-title`} className="text-[17px] font-semibold">
          {title}
        </h2>
        <p className="mt-1 max-w-xs text-sm leading-relaxed text-muted">{text}</p>
      </div>
      <div className="panel panel-body min-w-0">{children}</div>
    </section>
  );
}

/** Аккаунт: настройки по группам — профиль, пароль, уведомления, язык, данные. Слева что за группа, справа — сама настройка. */
export default async function AccountPage() {
  const user = await requireUser("/account");
  const t = (await getMessages()).orders.account;
  const g = t.groups;
  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
      <PageHead title={t.title} lead={t.lead} />
      <div className="mt-8 divide-y divide-line sm:mt-10">
        <Group id="profile" title={g.profile.title} text={g.profile.text}>
          <ProfileForm name={user.name} phone={user.phone ?? ""} email={user.email} />
        </Group>
        <Group id="password" title={g.password.title} text={g.password.text}>
          <PasswordForm email={user.email} />
        </Group>
        <Group id="notifications" title={g.notifications.title} text={g.notifications.text}>
          <Facts
            items={[
              { label: t.notifications.orderMail, value: t.notifications.orderMailValue },
              { label: t.notifications.reminders, value: <Badge tone={user.emailOptOut ? "neutral" : "success"}>{user.emailOptOut ? t.notifications.off : t.notifications.on}</Badge> },
            ]}
          />
          <p className="mt-4 text-sm text-muted">{user.emailOptOut ? t.notifications.offHint : t.notifications.onHint}</p>
        </Group>
        <Group id="language" title={g.language.title} text={g.language.text}>
          <LanguageSwitch />
          <p className="mt-3 text-sm text-muted">{t.languageText}</p>
        </Group>
        <Group id="data" title={g.data.title} text={g.data.text}>
          <p className="text-sm leading-relaxed text-ink-soft">{t.contact}</p>
          <a className="btn btn-outline mt-4 max-sm:w-full" href={`mailto:${site.contacts.email}`}>
            {t.write}: {site.contacts.email}
          </a>
        </Group>
      </div>
    </main>
  );
}
