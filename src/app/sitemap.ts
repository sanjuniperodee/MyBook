import type { MetadataRoute } from "next";
import { env } from "@/lib/env";
import { landings } from "@/lib/content/landings";
import { localizePath } from "@/i18n/config";

/** Обе языковые версии каждой публичной страницы, связанные через hreflang. */
export default function sitemap(): MetadataRoute.Sitemap {
  const paths = ["/", "/gift", ...landings.map((l) => `/kniga/${l.slug}`), "/register", "/login", "/offer", "/privacy"];
  const abs = (p: string) => `${env.appUrl}${p === "/" ? "" : p}`;
  return paths.flatMap((p) =>
    (["ru", "kk"] as const).map((locale) => ({
      url: abs(localizePath(p, locale)),
      changeFrequency: p === "/" ? ("weekly" as const) : ("monthly" as const),
      priority: p === "/" ? 1 : 0.5,
      alternates: { languages: { ru: abs(p), kk: abs(localizePath(p, "kk")), "x-default": abs(p) } },
    })),
  );
}
