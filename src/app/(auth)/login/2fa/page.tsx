import type { Metadata } from "next";
import { Link } from "@/i18n/client";
import { getMessages, lredirect } from "@/i18n/server";
import { getCurrentUser, safeNextPath } from "@/server/auth";
import { readTwoFactorTicket as readTicket } from "@/server/auth";
import { AuthHead } from "../../AuthHead";
import { TwoFactorForm } from "./TwoFactorForm";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).auth.twoFactor.meta, robots: { index: false } };
}

export default async function TwoFactorPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  if (await getCurrentUser()) return lredirect(safeNextPath(next));
  if (!(await readTicket())) return lredirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  const t = (await getMessages()).auth.twoFactor;
  return (
    <>
      <AuthHead title={t.title} text={t.text} />
      <TwoFactorForm next={next} />
      <p className="mt-6 border-t border-line pt-4 text-center text-sm">
        <Link href="/login" className="inline-flex min-h-11 items-center font-medium text-wine hover:underline">{t.back}</Link>
      </p>
    </>
  );
}
