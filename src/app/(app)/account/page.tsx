import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { site } from "@/config/site";
import { PasswordForm, ProfileForm } from "./AccountForms";

export const metadata: Metadata = { title: "Профиль" };

export default async function AccountPage() {
  const user = await requireUser("/account");
  return (
    <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="font-serif text-4xl font-medium sm:text-5xl">Профиль</h1>
      <div className="mt-10 grid gap-6 md:grid-cols-2">
        <section className="card p-6">
          <h2 className="mb-5 text-lg font-semibold">Личные данные</h2>
          <ProfileForm name={user.name} phone={user.phone ?? ""} email={user.email} />
        </section>
        <section className="card p-6">
          <h2 className="mb-5 text-lg font-semibold">Пароль</h2>
          <PasswordForm />
        </section>
      </div>
      <p className="mt-8 text-sm text-muted">
        Чтобы изменить e-mail или удалить аккаунт со всеми данными, напишите нам: <a className="text-wine underline" href={`mailto:${site.contacts.email}`}>{site.contacts.email}</a>.
      </p>
    </main>
  );
}
