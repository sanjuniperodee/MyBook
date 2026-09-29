import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { site } from "@/config/site";

export const alt = `${site.name} — ${site.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OgImage() {
  const font = await readFile(path.join(process.cwd(), "assets/fonts/Cormorant-500.ttf"));
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#2a1a1f", color: "#f4dcd6", fontFamily: "Cormorant", padding: 80, alignItems: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ fontSize: 40, color: "#e8b4b8" }}>{site.name}</div>
          <div style={{ fontSize: 84, lineHeight: 1.05, marginTop: 24, color: "#fff" }}>Книга о самом важном, написанная вами</div>
          <div style={{ fontSize: 34, marginTop: 28, color: "#e8b4b8" }}>Отвечайте на вопросы — мы напечатаем книгу</div>
        </div>
        <div style={{ display: "flex", width: 300, height: 420, background: "#efe9df", borderRadius: 6, marginLeft: 40, alignItems: "center", justifyContent: "center", boxShadow: "0 30px 60px rgba(0,0,0,.5)", border: "18px solid #b5545c" }}>
          <div style={{ fontSize: 44, color: "#3b2a2c", textAlign: "center", padding: 20 }}>Ты — моё всё</div>
        </div>
      </div>
    ),
    { ...size, fonts: [{ name: "Cormorant", data: font, weight: 500 }] },
  );
}
