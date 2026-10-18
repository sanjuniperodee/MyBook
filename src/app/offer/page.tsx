import type { Metadata } from "next";
import { LegalPage, legalFacts } from "@/components/LegalPage";
import { getLocale, getMessages } from "@/i18n/server";
import { alternates } from "@/i18n/seo";
import { socialMeta } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const [locale, m] = await Promise.all([getLocale(), getMessages()]);
  const { meta: title, metaDescription: description } = m.legal.offer;
  return { title, description, alternates: alternates("/offer", locale), ...socialMeta({ path: "/offer", locale, title, description }) };
}

export default async function OfferPage() {
  const { legal, common } = await getMessages();
  return <LegalPage title={legal.offer.title} updated={legal.updated} blocks={legal.offer.blocks(legalFacts(common.footer.address))} />;
}
