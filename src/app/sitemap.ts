import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["", "/register", "/login", "/offer", "/privacy"].map((p) => ({
    url: `${env.appUrl}${p}`,
    changeFrequency: p ? "monthly" : "weekly",
    priority: p ? 0.5 : 1,
  }));
}
