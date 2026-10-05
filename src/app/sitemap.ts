import type { MetadataRoute } from "next";
import { articles } from "@/lib/content/articles";
import { landings } from "@/lib/content/landings";
import { absoluteUrl } from "@/lib/seo";

type Entry = { path: string; changeFrequency: "weekly" | "monthly" | "yearly"; priority: number; lastModified?: string };

/** Публичные страницы. Вход и кабинет сюда не попадают: там нечего индексировать. */
const pages: Entry[] = [
  { path: "/", changeFrequency: "weekly", priority: 1 },
  { path: "/kniga", changeFrequency: "weekly", priority: 0.8 },
  ...landings.map((l): Entry => ({ path: `/kniga/${l.slug}`, changeFrequency: "monthly", priority: 0.8 })),
  { path: "/blog", changeFrequency: "weekly", priority: 0.7 },
  ...articles.map((a): Entry => ({ path: `/blog/${a.slug}`, changeFrequency: "monthly", priority: 0.6, lastModified: a.updated ?? a.published })),
  { path: "/gift", changeFrequency: "monthly", priority: 0.7 },
  { path: "/register", changeFrequency: "yearly", priority: 0.4 },
  { path: "/offer", changeFrequency: "yearly", priority: 0.2 },
  { path: "/privacy", changeFrequency: "yearly", priority: 0.2 },
];

/** Обе языковые версии каждой публичной страницы, связанные через hreflang. */
export default function sitemap(): MetadataRoute.Sitemap {
  return pages.flatMap((p) =>
    (["ru", "kk"] as const).map((locale) => ({
      url: absoluteUrl(p.path, locale),
      changeFrequency: p.changeFrequency,
      priority: p.priority,
      ...(p.lastModified ? { lastModified: p.lastModified } : {}),
      alternates: { languages: { ru: absoluteUrl(p.path, "ru"), kk: absoluteUrl(p.path, "kk"), "x-default": absoluteUrl(p.path, "ru") } },
    })),
  );
}
