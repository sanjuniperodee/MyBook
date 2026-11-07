import type { Metadata } from "next";
import { requireUser } from "@/server/auth";
import { site } from "@/config/site";
import { PasswordForm, ProfileForm } from "./AccountForms";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { Panel } from "@/components/ui/Panel";
import { getMessages } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).orders.account.meta };
}

/** Профиль: один столбец листов — личные данные, пароль, язык; внизу — как удалить аккаунт. */
export default async function AccountPage() {
  const user = await requireUser("/account");
  const t = (await getMessages()).orders.account;
  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="font-serif text-4xl font-medium sm:text-5xl">{t.title}</h1>
      <div className="mt-8 space-y-5">
        <Panel title={t.personal}>
          <ProfileForm name={user.name} phone={user.phone ?? ""} email={user.email} />
        </Panel>
        <Panel title={t.password}>
          <PasswordForm email={user.email} />
        </Panel>
        <Panel title={t.language} description={t.languageText}>
          <LanguageSwitch />
        </Panel>
      </div>
      <p className="mt-8 text-sm leading-relaxed text-muted">
        {t.contact}{" "}
        <a className="text-wine underline underline-offset-2" href={`mailto:${site.contacts.email}`}>
          {site.contacts.email}
        </a>
        .
      </p>
    </main>
  );
}
