import { Logo } from "@/components/Logo";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { site } from "@/config/site";
import { Link } from "@/i18n/client";
import { getLocale, getMessages } from "@/i18n/server";
import { landings } from "@/lib/content/landings";

export async function Footer() {
  const [locale, m] = await Promise.all([getLocale(), getMessages()]);
  const f = m.common.footer;
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-line bg-cream/50">
      <div className="container-x grid gap-10 py-14 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="max-w-xs">
          <Logo variant="full" />
          <p className="mt-4 text-sm leading-relaxed text-muted">{m.common.meta.description}</p>
          <LanguageSwitch className="mt-5" />
        </div>
        <div>
          <div className="mb-3 text-sm font-semibold">{f.ideas}</div>
          <ul className="space-y-2 text-sm text-muted">
            {landings.map((l) => (
              <li key={l.slug}>
                <Link href={`/kniga/${l.slug}`} className="hover:text-ink">
                  {l.content[locale].label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="mb-3 text-sm font-semibold">{f.customers}</div>
          <ul className="space-y-2 text-sm text-muted">
            <li><Link href="/#pricing" className="hover:text-ink">{f.pricing}</Link></li>
            <li><Link href="/gift" className="hover:text-ink">{f.gift}</Link></li>
            <li><Link href="/redeem" className="hover:text-ink">{f.redeem}</Link></li>
            <li><Link href="/#faq" className="hover:text-ink">{f.faq}</Link></li>
            <li><Link href="/offer" className="hover:text-ink">{f.offer}</Link></li>
            <li><Link href="/privacy" className="hover:text-ink">{f.privacy}</Link></li>
          </ul>
        </div>
        <div>
          <div className="mb-3 text-sm font-semibold">{f.contact}</div>
          <ul className="space-y-2 text-sm text-muted">
            <li><a href={`mailto:${site.contacts.email}`} className="hover:text-ink">{site.contacts.email}</a></li>
            <li><a href={`tel:${site.contacts.phone.replace(/\s/g, "")}`} className="hover:text-ink">{site.contacts.phone}</a></li>
            <li><a href={site.contacts.whatsapp} target="_blank" rel="noopener noreferrer" className="hover:text-ink">WhatsApp</a></li>
            <li><a href={site.contacts.telegram} target="_blank" rel="noopener noreferrer" className="hover:text-ink">Telegram</a></li>
            <li><a href={site.contacts.instagram} target="_blank" rel="noopener noreferrer" className="hover:text-ink">Instagram</a></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-line/70">
        <div className="container-x flex flex-col gap-2 py-6 text-xs text-muted sm:flex-row sm:justify-between">
          <span>
            © {year} {site.company.legalName}. {f.bin} {site.company.bin}
          </span>
          <span>{f.address}</span>
        </div>
      </div>
    </footer>
  );
}
