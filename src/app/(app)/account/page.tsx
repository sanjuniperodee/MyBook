import type { Metadata } from "next";
import { requireUser } from "@/server/auth";
import { site } from "@/config/site";
import { PasswordForm, ProfileForm } from "./AccountForms";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { getMessages } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).orders.account.meta };
}

export default async function AccountPage() {
  const user = await requireUser("/account");
  const t = (await getMessages()).orders.account;
  return (
    <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="font-serif text-4xl font-medium sm:text-5xl">{t.title}</h1>
      <div className="mt-10 grid gap-6 md:grid-cols-2">
        <section className="card p-6">
          <h2 className="mb-5 text-lg font-semibold">{t.personal}</h2>
          <ProfileForm name={user.name} phone={user.phone ?? ""} email={user.email} />
        </section>
        <section className="card p-6">
          <h2 className="mb-5 text-lg font-semibold">{t.password}</h2>
          <PasswordForm />
        </section>
        <section className="card p-6 md:col-span-2">
          <h2 className="text-lg font-semibold">{t.language}</h2>
          <p className="mt-1 mb-4 text-sm text-muted">{t.languageText}</p>
          <LanguageSwitch />
        </section>
      </div>
      <p className="mt-8 text-sm text-muted">
        {t.contact} <a className="text-wine underline" href={`mailto:${site.contacts.email}`}>{site.contacts.email}</a>.
      </p>
    </main>
  );
}
