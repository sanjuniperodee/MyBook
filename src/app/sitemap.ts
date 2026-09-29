import type { MetadataRoute } from "next";
import { env } from "@/lib/env";
import { landings } from "@/lib/content/landings";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["", "/gift", ...landings.map((l) => `/kniga/${l.slug}`), "/register", "/login", "/offer", "/privacy"].map((p) => ({
    url: `${env.appUrl}${p}`,
    changeFrequency: p ? "monthly" : "weekly",
    priority: p ? 0.5 : 1,
  }));
}
