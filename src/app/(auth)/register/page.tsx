import type { Metadata } from "next";
import { Link } from "@/i18n/client";
import { getMessages, lredirect } from "@/i18n/server";
import { getCurrentUser } from "@/server/auth";
import { RegisterForm } from "./RegisterForm";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).auth.register.meta };
}

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ theme?: string }> }) {
  const { theme } = await searchParams;
  if (await getCurrentUser()) return lredirect(theme ? `/books/new?theme=${encodeURIComponent(theme)}` : "/books");
  const t = (await getMessages()).auth.register;
  return (
    <>
      <h1 className="font-serif text-4xl font-medium">{t.title}</h1>
      <p className="mt-2 mb-8 text-muted">{t.text}</p>
      <RegisterForm theme={theme} />
      <p className="mt-8 text-center text-sm text-muted">
        {t.hasAccount} <Link href="/login" className="font-medium text-wine hover:underline">{t.toLogin}</Link>
      </p>
    </>
  );
}
