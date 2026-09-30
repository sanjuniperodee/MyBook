import type { Metadata } from "next";
import { LegalPage, legalFacts } from "@/components/LegalPage";
import { getLocale, getMessages } from "@/i18n/server";
import { alternates } from "@/i18n/seo";

export async function generateMetadata(): Promise<Metadata> {
  const [locale, m] = await Promise.all([getLocale(), getMessages()]);
  return { title: m.legal.offer.meta, alternates: alternates("/offer", locale) };
}

export default async function OfferPage() {
  const { legal, common } = await getMessages();
  return <LegalPage title={legal.offer.title} updated={legal.updated} blocks={legal.offer.blocks(legalFacts(common.footer.address))} />;
}
