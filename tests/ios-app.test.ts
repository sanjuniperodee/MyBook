import { describe, expect, it, vi } from "vitest";

vi.mock("@/modules/workspace", () => ({ iosDevices: { save: async () => {}, ofUser: async () => [], all: async () => [] } }));
vi.mock("@/shared/infrastructure/storage", () => ({ fileExists: async () => false, getFile: async () => Buffer.from(""), putFile: async () => {} }));

const { enrollProfile, installManifest, iosToken, parseDeviceAttributes, readIosToken } = await import("@/server/ios-app");

const USER = "0d0d0d0d-0000-4000-8000-0000000000aa";

describe("iPhone без App Store (Ad Hoc)", () => {
  it("ссылки: своё действие и срок; подделка и чужое действие — нет", () => {
    const now = Date.UTC(2026, 10, 24, 10);
    const t = iosToken(USER, "install", 3600, now);
    expect(readIosToken(t, "install", now + 1000)).toBe(USER);
    expect(readIosToken(t, "enroll", now)).toBeNull();
    expect(readIosToken(t, "install", now + 3601_000)).toBeNull();
    expect(readIosToken(`${t.split(".")[0]}.подделка`, "install", now)).toBeNull();
    expect(readIosToken(null, "install", now)).toBeNull();
  });

  it("профиль регистрации — Profile Service с адресом возврата и атрибутом UDID", () => {
    const p = enrollProfile("https://mybooks.kz", "abc&x");
    expect(p).toContain("<string>Profile Service</string>");
    expect(p).toContain("https://mybooks.kz/api/ios-app/udid?t=abc%26x");
    expect(p).toContain("<string>UDID</string>");
  });

  it("ответ телефона: plist внутри подписи — UDID, модель, версия; мусор — null", () => {
    const plist = `<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>PRODUCT</key><string>iPhone15,2</string><key>UDID</key><string>00008110-001A2B3C4D5E801E</string><key>VERSION</key><string>22A3354</string></dict></plist>`;
    const body = Buffer.concat([Buffer.from([0x30, 0x82, 0x0a, 0x01]), Buffer.from(plist), Buffer.from([0xa0, 0x00])]);
    expect(parseDeviceAttributes(body)).toEqual({ udid: "00008110-001A2B3C4D5E801E", product: "iPhone15,2", version: "22A3354" });
    expect(parseDeviceAttributes(Buffer.from(plist.replace("00008110-001A2B3C4D5E801E", "../../etc")))).toBeNull();
    expect(parseDeviceAttributes(Buffer.from("не plist"))).toBeNull();
  });

  it("манифест установки: адрес IPA экранирован, идентификатор и версия из сборки", () => {
    const m = installManifest("https://mybooks.kz/api/ios-app/ipa?t=a&b", { version: "1.3.0", build: "6", bundleId: "kz.workdesk.mobile", udids: [], builtAt: "" });
    expect(m).toContain("https://mybooks.kz/api/ios-app/ipa?t=a&amp;b");
    expect(m).toContain("<string>kz.workdesk.mobile</string>");
    expect(m).toContain("<string>1.3.0</string>");
  });
});
