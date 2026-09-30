import type { Metadata } from "next";
import { LegalPage, legalFacts } from "@/components/LegalPage";
import { getLocale, getMessages } from "@/i18n/server";
import { alternates } from "@/i18n/seo";

export async function generateMetadata(): Promise<Metadata> {
  const [locale, m] = await Promise.all([getLocale(), getMessages()]);
  return { title: m.legal.privacy.meta, alternates: alternates("/privacy", locale) };
}

export default async function PrivacyPage() {
  const { legal, common } = await getMessages();
  return <LegalPage title={legal.privacy.title} updated={legal.updated} blocks={legal.privacy.blocks(legalFacts(common.footer.address))} />;
}
