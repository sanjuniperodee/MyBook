import { site } from "@/config/site";
import { isLocale, localeMeta, type Locale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import { articles } from "@/lib/content/articles";
import { absoluteUrl } from "@/lib/seo";
import { rssPath } from "./feed";

export const dynamic = "force-dynamic";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const rfc822 = (day: string) => new Date(`${day}T00:00:00Z`).toUTCString();

/** RSS 2.0 блога: статьи в обратном порядке дат, на языке из ?l= (по умолчанию русский). Подписки и агрегаторы, Яндекс.Дзен. */
export function GET(req: Request) {
  const l = new URL(req.url).searchParams.get("l");
  const locale: Locale = isLocale(l) ? l : "ru";
  const m = messagesFor(locale).landing.blog.meta;
  const items = [...articles]
    .sort((a, b) => (b.updated ?? b.published).localeCompare(a.updated ?? a.published))
    .map((a) => {
      const c = a.content[locale];
      const url = absoluteUrl(`/blog/${a.slug}`, locale);
      return `<item><title>${esc(c.title)}</title><link>${url}</link><guid isPermaLink="true">${url}</guid><description>${esc(c.description)}</description><pubDate>${rfc822(a.published)}</pubDate></item>`;
    })
    .join("");
  const self = `${absoluteUrl("/", "ru")}${rssPath(locale)}`;
  const xml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>${esc(`${site.name} — ${m.title}`)}</title><link>${absoluteUrl("/blog", locale)}</link><description>${esc(m.description)}</description><language>${localeMeta[locale].intl.toLowerCase()}</language><atom:link href="${esc(self)}" rel="self" type="application/rss+xml"/>${items}</channel></rss>`;
  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
