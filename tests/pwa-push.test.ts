import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { iosNeedsInstall } from "@/components/admin/liveRules";

// Push на iPhone и установка CRM как приложения (platform-29, platform-d3, platform-d16).
const pub = (f: string) => path.join(__dirname, "..", "public", f);

describe("push на iPhone — только после «На экран „Домой“»", () => {
  const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
  const ipad = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
  it("вкладка Safari на iPhone и iPad — подсказка; установленная — кнопка; Android и Mac — кнопка", () => {
    expect(iosNeedsInstall({ userAgent: iphone, maxTouchPoints: 5, standalone: false })).toBe(true);
    expect(iosNeedsInstall({ userAgent: ipad, maxTouchPoints: 5, standalone: false })).toBe(true);
    expect(iosNeedsInstall({ userAgent: iphone, maxTouchPoints: 5, standalone: true })).toBe(false);
    expect(iosNeedsInstall({ userAgent: ipad, maxTouchPoints: 0, standalone: false })).toBe(false);
    expect(iosNeedsInstall({ userAgent: "Mozilla/5.0 (Linux; Android 14) Chrome/129.0 Mobile", maxTouchPoints: 5, standalone: false })).toBe(false);
  });
});

describe("манифест и service worker CRM", () => {
  it("иконки any и maskable — разные файлы, все на месте; значок строки уведомлений — свой", () => {
    const m = JSON.parse(readFileSync(pub("crm.webmanifest"), "utf8")) as { id: string; icons: { src: string; purpose: string }[] };
    expect(m.id).toBe("/admin");
    const maskable = m.icons.filter((i) => i.purpose === "maskable").map((i) => i.src);
    const any = m.icons.filter((i) => i.purpose === "any").map((i) => i.src);
    expect(maskable.length).toBeGreaterThan(0);
    expect(maskable.some((src) => any.includes(src))).toBe(false);
    for (const i of m.icons) expect(existsSync(pub(i.src.slice(1))), i.src).toBe(true);
    const sw = readFileSync(pub("crm-sw.js"), "utf8");
    expect(sw).toContain('badge: "/crm-badge-96.png"');
    expect(existsSync(pub("crm-badge-96.png"))).toBe(true);
    expect(sw).toContain("pushsubscriptionchange");
    expect(sw).toContain("renotify");
  });
});
