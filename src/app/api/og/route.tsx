import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { site } from "@/config/site";
import { isLocale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import { getArticle } from "@/lib/content/articles";
import { getLanding } from "@/lib/content/landings";

const OG_SIZE = { width: 1200, height: 630 };

/**
 * Картинка для соцсетей на языке страницы: /api/og?l=kk.
 * С параметром s — своя картинка посадочной страницы или статьи (s=<slug>); неизвестный slug даёт общую.
 */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const l = params.get("l");
  const locale = isLocale(l) ? l : "ru";
  const m = messagesFor(locale);
  const slug = params.get("s") ?? "";
  const landing = getLanding(slug)?.content[locale];
  const article = getArticle(slug)?.content[locale];

  const headline = landing ? `${landing.h1} ${landing.accent}` : (article?.title ?? m.common.meta.tagline);
  const subtitle = landing || article ? m.common.meta.tagline : m.landing.og.subtitle;
  const coverText = landing?.cover.title ?? m.landing.og.cover;
  const size = headline.length > 70 ? 54 : headline.length > 40 ? 64 : 80;

  const font = await readFile(path.join(process.cwd(), "assets/fonts/Cormorant-500.ttf"));
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#2a1a1f", color: "#f4dcd6", fontFamily: "Cormorant", padding: 80, alignItems: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ fontSize: 40, color: "#e8b4b8" }}>{site.name}</div>
          <div style={{ fontSize: size, lineHeight: 1.05, marginTop: 24, color: "#fff" }}>{headline}</div>
          <div style={{ fontSize: 34, marginTop: 28, color: "#e8b4b8" }}>{subtitle}</div>
        </div>
        <div style={{ display: "flex", width: 300, height: 420, background: "#efe9df", borderRadius: 6, marginLeft: 40, alignItems: "center", justifyContent: "center", boxShadow: "0 30px 60px rgba(0,0,0,.5)", border: "18px solid #b5545c" }}>
          <div style={{ fontSize: 44, color: "#3b2a2c", textAlign: "center", padding: 20 }}>{coverText}</div>
        </div>
      </div>
    ),
    { ...OG_SIZE, fonts: [{ name: "Cormorant", data: font, weight: 500 }], headers: { "Cache-Control": "public, max-age=86400" } },
  );
}
