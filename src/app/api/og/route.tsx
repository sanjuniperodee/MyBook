import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { site } from "@/config/site";
import { isLocale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";

const OG_SIZE = { width: 1200, height: 630 };

/** Картинка для соцсетей на языке страницы: /api/og?l=kk. */
export async function GET(req: Request) {
  const l = new URL(req.url).searchParams.get("l");
  const m = messagesFor(isLocale(l) ? l : "ru");
  const font = await readFile(path.join(process.cwd(), "assets/fonts/Cormorant-500.ttf"));
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#2a1a1f", color: "#f4dcd6", fontFamily: "Cormorant", padding: 80, alignItems: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ fontSize: 40, color: "#e8b4b8" }}>{site.name}</div>
          <div style={{ fontSize: 80, lineHeight: 1.05, marginTop: 24, color: "#fff" }}>{m.common.meta.tagline}</div>
          <div style={{ fontSize: 34, marginTop: 28, color: "#e8b4b8" }}>{m.landing.og.subtitle}</div>
        </div>
        <div style={{ display: "flex", width: 300, height: 420, background: "#efe9df", borderRadius: 6, marginLeft: 40, alignItems: "center", justifyContent: "center", boxShadow: "0 30px 60px rgba(0,0,0,.5)", border: "18px solid #b5545c" }}>
          <div style={{ fontSize: 44, color: "#3b2a2c", textAlign: "center", padding: 20 }}>{m.landing.og.cover}</div>
        </div>
      </div>
    ),
    { ...OG_SIZE, fonts: [{ name: "Cormorant", data: font, weight: 500 }], headers: { "Cache-Control": "public, max-age=86400" } },
  );
}
