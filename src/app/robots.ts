import type { MetadataRoute } from "next";
import { env } from "@/config/env";

/** Закрытые от индексации разделы: кабинет, заказы, служебные страницы по ссылке с токеном и API. */
const PRIVATE = ["/books", "/orders", "/account", "/invite", "/redeem", "/review", "/letters", "/unsubscribe", "/forgot", "/reset", "/login/2fa", "/gift/", "/go/", "/r/"];

export default function robots(): MetadataRoute.Robots {
  const both = (paths: string[]) => paths.flatMap((p) => [p, `/kk${p}`]);
  return {
    rules: [
      {
        userAgent: "*",
        // /api закрыт целиком, кроме картинок для соцсетей и SVG-фонов обложек: без них робот видит страницы без картинок
        allow: ["/", "/api/og", "/api/covers/"],
        disallow: [...both(PRIVATE), "/admin", "/admin-denied", "/print", "/api"],
      },
    ],
    sitemap: `${env.appUrl}/sitemap.xml`,
  };
}
