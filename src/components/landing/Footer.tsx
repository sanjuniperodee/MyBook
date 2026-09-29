import Link from "next/link";
import { Logo } from "@/components/Logo";
import { site } from "@/config/site";

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-line bg-cream/50">
      <div className="container-x grid gap-10 py-14 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="max-w-xs">
          <Logo variant="full" />
          <p className="mt-4 text-sm leading-relaxed text-muted">{site.description}</p>
        </div>
        <div>
          <div className="mb-3 text-sm font-semibold">Книги</div>
          <ul className="space-y-2 text-sm text-muted">
            <li><Link href="/register?theme=love" className="hover:text-ink">Любимому человеку</Link></li>
            <li><Link href="/register?theme=mom" className="hover:text-ink">Маме</Link></li>
            <li><Link href="/register?theme=dad" className="hover:text-ink">Папе</Link></li>
            <li><Link href="/register?theme=friend" className="hover:text-ink">Другу</Link></li>
          </ul>
        </div>
        <div>
          <div className="mb-3 text-sm font-semibold">Покупателям</div>
          <ul className="space-y-2 text-sm text-muted">
            <li><Link href="/#pricing" className="hover:text-ink">Цены и доставка</Link></li>
            <li><Link href="/#faq" className="hover:text-ink">Частые вопросы</Link></li>
            <li><Link href="/offer" className="hover:text-ink">Публичная оферта</Link></li>
            <li><Link href="/privacy" className="hover:text-ink">Конфиденциальность</Link></li>
          </ul>
        </div>
        <div>
          <div className="mb-3 text-sm font-semibold">Связаться</div>
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
          <span>© {year} {site.company.legalName}. БИН {site.company.bin}</span>
          <span>{site.company.address}</span>
        </div>
      </div>
    </footer>
  );
}
