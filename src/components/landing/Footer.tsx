import { Logo } from "@/components/Logo";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { site } from "@/config/site";
import { Link } from "@/i18n/client";
import { getLocale, getMessages } from "@/i18n/server";
import { landings } from "@/lib/content/landings";
import { container } from "@/server/container";
import { SiteWidget } from "@/components/SiteWidget";

/** Подвал витрины: идеи подарков (перелинковка посадочных), покупателям, связь; внизу — реквизиты. */
export async function Footer() {
  const [locale, m, widget] = await Promise.all([getLocale(), getMessages(), container().messaging.widgetConfig().catch(() => null)]);
  const f = m.common.footer;
  const year = new Date().getFullYear();
  const link = "inline-flex min-h-7 items-center text-ink-soft transition hover:text-wine";
  return (
    <footer className="border-t border-line bg-cream/50">
      {widget?.enabled ? <SiteWidget whatsapp={widget.whatsapp} chat={widget.chat} /> : null}
      <div className="container-x grid grid-cols-2 gap-x-6 gap-y-12 py-16 sm:gap-x-10 lg:grid-cols-[1.3fr_1fr_1fr_0.8fr]">
        <div className="col-span-2 max-w-xs lg:col-span-1">
          <Logo />
          <p className="mt-5 text-sm leading-relaxed text-muted">{m.common.meta.description}</p>
          <LanguageSwitch className="mt-6" />
        </div>
        <nav aria-label={f.ideas} className="col-span-2 sm:col-span-1">
          <h2 className="text-sm font-semibold">{f.ideas}</h2>
          <ul className="mt-3 space-y-0.5 text-sm">
            {landings.slice(0, 8).map((l) => (
              <li key={l.slug}>
                <Link href={`/kniga/${l.slug}`} className={link}>
                  {l.content[locale].label}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/kniga" className="inline-flex min-h-7 items-center font-medium text-wine hover:underline">
                {f.allIdeas}
              </Link>
            </li>
          </ul>
        </nav>
        <nav aria-label={f.customers}>
          <h2 className="text-sm font-semibold">{f.customers}</h2>
          <ul className="mt-3 space-y-0.5 text-sm">
            <li><Link href="/#pricing" className={link}>{f.pricing}</Link></li>
            <li><Link href="/gift" className={link}>{f.gift}</Link></li>
            <li><Link href="/redeem" className={link}>{f.redeem}</Link></li>
            <li><Link href="/#faq" className={link}>{f.faq}</Link></li>
            <li><Link href="/instrumenty" className={link}>{f.tools}</Link></li>
            <li><Link href="/blog" className={link}>{f.blog}</Link></li>
            <li><Link href="/offer" className={link}>{f.offer}</Link></li>
            <li><Link href="/privacy" className={link}>{f.privacy}</Link></li>
          </ul>
        </nav>
        <div>
          <h2 className="text-sm font-semibold">{f.contact}</h2>
          <ul className="mt-3 space-y-0.5 text-sm">
            <li><a href={`mailto:${site.contacts.email}`} className={link}>{site.contacts.email}</a></li>
            <li><a href={`tel:${site.contacts.phone.replace(/\s/g, "")}`} className={link}>{site.contacts.phone}</a></li>
            <li><a href={site.contacts.whatsapp} target="_blank" rel="noopener noreferrer" className={link}>WhatsApp</a></li>
            <li><a href={site.contacts.telegram} target="_blank" rel="noopener noreferrer" className={link}>Telegram</a></li>
            <li><a href={site.contacts.instagram} target="_blank" rel="noopener noreferrer" className={link}>Instagram</a></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-line">
        <div className="container-x flex flex-col gap-1 py-6 text-xs text-muted sm:flex-row sm:justify-between">
          <span>
            © {year} {site.company.legalName}. {f.bin} {site.company.bin}
          </span>
          <span>{f.address}</span>
        </div>
      </div>
    </footer>
  );
}
