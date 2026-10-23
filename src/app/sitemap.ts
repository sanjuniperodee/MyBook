import type { MetadataRoute } from "next";
import { articles } from "@/lib/content/articles";
import { landings } from "@/lib/content/landings";
import { tools } from "@/lib/content/tools";
import { absoluteUrl, ogImage } from "@/lib/seo";

/** Адрес сайта и список страниц берутся при запросе, а не при сборке: образ Docker собирается без .env. */
export const dynamic = "force-dynamic";

type Entry = { path: string; changeFrequency: "weekly" | "monthly" | "yearly"; priority: number; lastModified?: string; image?: string };

/** Публичные страницы. Вход, регистрация и кабинет сюда не попадают: там нечего индексировать. */
const pages: Entry[] = [
  { path: "/", changeFrequency: "weekly", priority: 1 },
  { path: "/kniga", changeFrequency: "weekly", priority: 0.8 },
  ...landings.map((l): Entry => ({ path: `/kniga/${l.slug}`, changeFrequency: "monthly", priority: 0.8, image: l.slug })),
  { path: "/instrumenty", changeFrequency: "weekly", priority: 0.7 },
  ...tools.map((t): Entry => ({ path: `/instrumenty/${t.slug}`, changeFrequency: "monthly", priority: 0.7, image: t.slug })),
  { path: "/blog", changeFrequency: "weekly", priority: 0.7 },
  ...articles.map((a): Entry => ({ path: `/blog/${a.slug}`, changeFrequency: "monthly", priority: 0.6, lastModified: a.updated ?? a.published, image: a.slug })),
  { path: "/gift", changeFrequency: "monthly", priority: 0.7 },
  { path: "/offer", changeFrequency: "yearly", priority: 0.2 },
  { path: "/privacy", changeFrequency: "yearly", priority: 0.2 },
];

/** Next.js вставляет адреса в XML как есть: «&» в адресе картинки ломает весь файл. */
const xmlEscape = (s: string) => s.replace(/&/g, "&amp;");

/** Обе языковые версии каждой публичной страницы, связанные через hreflang; картинка — та же, что для соцсетей. */
export default function sitemap(): MetadataRoute.Sitemap {
  return pages.flatMap((p) =>
    (["ru", "kk"] as const).map((locale) => ({
      url: absoluteUrl(p.path, locale),
      changeFrequency: p.changeFrequency,
      priority: p.priority,
      images: [xmlEscape(absoluteUrl(ogImage(locale, p.image), "ru"))],
      ...(p.lastModified ? { lastModified: p.lastModified } : {}),
      alternates: { languages: { ru: absoluteUrl(p.path, "ru"), kk: absoluteUrl(p.path, "kk"), "x-default": absoluteUrl(p.path, "ru") } },
    })),
  );
}
