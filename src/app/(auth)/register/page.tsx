import type { Metadata } from "next";
import { Link } from "@/i18n/client";
import { getLocale, getMessages, lredirect } from "@/i18n/server";
import { alternates } from "@/i18n/seo";
import { Gift } from "lucide-react";
import { getCurrentUser } from "@/server/auth";
import { invitedBy } from "@/server/invite";
import { AuthHead } from "../AuthHead";
import { RegisterForm } from "./RegisterForm";
import { registrationOpen, site } from "@/config/site";
import { socialMeta } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const [locale, m] = await Promise.all([getLocale(), getMessages()]);
  const { meta: title, metaDescription: description } = m.auth.register;
  // ?theme=… и ?ref=… — те же страницы: каноническим остаётся адрес без параметров
  return { title, description, alternates: alternates("/register", locale), ...socialMeta({ path: "/register", locale, title, description }), ...(registrationOpen() ? {} : { robots: { index: false, follow: false } }) };
}

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ theme?: string }> }) {
  const { theme } = await searchParams;
  if (await getCurrentUser()) return lredirect(theme ? `/books/new?theme=${encodeURIComponent(theme)}` : "/books");
  const [m, invited] = await Promise.all([getMessages(), invitedBy()]);
  const t = m.auth.register;
  // Регистрация закрыта в админке: объясняем и ведём к входу или в WhatsApp.
  if (!registrationOpen())
    return (
      <div data-testid="registration-closed">
        <AuthHead title={t.closedTitle} text={t.closedText} />
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link href="/login" className="btn btn-primary">
            {t.toLogin}
          </Link>
          <a href={site.contacts.whatsapp} target="_blank" rel="noopener noreferrer" className="btn btn-outline">
            {t.closedWhatsapp}
          </a>
        </div>
      </div>
    );
  return (
    <>
      <AuthHead title={t.title} text={t.text} />
      {invited ? (
        <p className="-mt-3 mb-6 flex items-start gap-2.5 rounded-[var(--r-ctl)] bg-rose px-4 py-3 text-sm">
          <Gift className="mt-0.5 size-4 shrink-0 text-wine" aria-hidden />
          <span>
            <b className="font-semibold text-wine">{m.invite.welcome(invited.from, invited.percent)}</b> — {m.invite.welcomeNote.toLowerCase()}
          </span>
        </p>
      ) : null}
      <RegisterForm theme={theme} />
      <p className="mt-6 border-t border-line pt-4 text-center text-sm text-muted">
        {t.hasAccount} <Link href="/login" className="inline-flex min-h-11 items-center font-medium text-wine hover:underline">{t.toLogin}</Link>
      </p>
    </>
  );
}
