import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", disallow: ["/books", "/orders", "/account", "/kk/books", "/kk/orders", "/kk/account", "/admin", "/api"], allow: ["/", "/api/og"] }],
    sitemap: `${env.appUrl}/sitemap.xml`,
  };
}
