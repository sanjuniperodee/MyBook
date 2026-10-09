import type { Metadata } from "next";
import { Link } from "@/i18n/client";
import { getLocale, getMessages, lredirect } from "@/i18n/server";
import { alternates } from "@/i18n/seo";
import { Gift } from "lucide-react";
import { getCurrentUser } from "@/server/auth";
import { invitedBy } from "@/server/invite";
import { RegisterForm } from "./RegisterForm";

export async function generateMetadata(): Promise<Metadata> {
  const [locale, m] = await Promise.all([getLocale(), getMessages()]);
  // ?theme=… и ?ref=… — те же страницы: каноническим остаётся адрес без параметров
  return { title: m.auth.register.meta, alternates: alternates("/register", locale) };
}

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ theme?: string }> }) {
  const { theme } = await searchParams;
  if (await getCurrentUser()) return lredirect(theme ? `/books/new?theme=${encodeURIComponent(theme)}` : "/books");
  const [m, invited] = await Promise.all([getMessages(), invitedBy()]);
  const t = m.auth.register;
  return (
    <>
      <h1 className="font-serif text-4xl font-medium">{t.title}</h1>
      <p className="mt-2 mb-8 text-muted">{t.text}</p>
      {invited ? (
        <p className="-mt-3 mb-7 flex items-start gap-2.5 rounded-2xl bg-rose/50 px-4 py-3 text-sm">
          <Gift className="mt-0.5 size-4 shrink-0 text-wine" />
          <span>
            <b className="font-semibold text-wine">{m.invite.welcome(invited.from, invited.percent)}</b> — {m.invite.welcomeNote.toLowerCase()}
          </span>
        </p>
      ) : null}
      <RegisterForm theme={theme} />
      <p className="mt-8 text-center text-sm text-muted">
        {t.hasAccount} <Link href="/login" className="font-medium text-wine hover:underline">{t.toLogin}</Link>
      </p>
    </>
  );
}
