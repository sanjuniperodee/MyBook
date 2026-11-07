import { Logo } from "@/components/Logo";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { site } from "@/config/site";
import { Link } from "@/i18n/client";
import { getLocale, getMessages } from "@/i18n/server";
import { landings } from "@/lib/content/landings";
import { container } from "@/server/container";
import { SiteWidget } from "@/components/SiteWidget";

/**
 * Подвал витрины — как выходные данные книги: слева знак и одна фраза, справа три колонки ссылок (идеи подарков,
 * покупателям, связь), внизу реквизиты. Телефон и WhatsApp — крупно: это самый быстрый путь к человеку.
 */
export async function Footer() {
  const [locale, m, widget] = await Promise.all([getLocale(), getMessages(), container().messaging.widgetConfig().catch(() => null)]);
  const f = m.common.footer;
  const year = new Date().getFullYear();
  const link = "inline-flex min-h-8 items-center text-ink-soft transition-colors hover:text-wine";
  const h = "text-sm font-semibold text-ink";
  return (
    <footer className="border-t border-line bg-cream/50">
      {widget?.enabled ? <SiteWidget whatsapp={widget.whatsapp} chat={widget.chat} /> : null}
      <div className="container-x grid gap-14 pt-16 pb-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,2fr)] lg:gap-20">
        <div className="max-w-sm">
          <Logo />
          <p className="mt-6 font-serif text-[26px] leading-[1.2] font-medium text-balance text-ink">{m.common.meta.tagline}</p>
          <p className="mt-4 text-sm leading-relaxed text-muted">{m.common.meta.description}</p>
          <LanguageSwitch className="mt-6" />
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-12 sm:grid-cols-3 sm:gap-x-10">
          <nav aria-label={f.ideas} className="col-span-2 sm:col-span-1">
            <h2 className={h}>{f.ideas}</h2>
            <ul className="mt-3 text-sm">
              {landings.slice(0, 8).map((l) => (
                <li key={l.slug}>
                  <Link href={`/kniga/${l.slug}`} className={link}>
                    {l.content[locale].label}
                  </Link>
                </li>
              ))}
              <li>
                <Link href="/kniga" className="inline-flex min-h-8 items-center font-medium text-wine hover:underline">
                  {f.allIdeas}
                </Link>
              </li>
            </ul>
          </nav>
          <nav aria-label={f.customers}>
            <h2 className={h}>{f.customers}</h2>
            <ul className="mt-3 text-sm">
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
            <h2 className={h}>{f.contact}</h2>
            <a href={`tel:${site.contacts.phone.replace(/\s/g, "")}`} className="mt-3 block font-serif text-[26px] leading-tight font-medium tabular-nums text-ink hover:text-wine">
              {site.contacts.phone}
            </a>
            <ul className="mt-2 text-sm">
              <li><a href={`mailto:${site.contacts.email}`} className={link}>{site.contacts.email}</a></li>
              <li><a href={site.contacts.whatsapp} target="_blank" rel="noopener noreferrer" className={link}>WhatsApp</a></li>
              <li><a href={site.contacts.telegram} target="_blank" rel="noopener noreferrer" className={link}>Telegram</a></li>
              <li><a href={site.contacts.instagram} target="_blank" rel="noopener noreferrer" className={link}>Instagram</a></li>
            </ul>
          </div>
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
