import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { allPermissions, isPermission, maskEmail, maskPhone, permissionGroups, systemRoles } from "@/lib/crm/permissions";
import { formatPhone, isPhoneLike, normalizePhone, phoneKey } from "@/lib/crm/phone";
import { parseGenericEvent, parseZadarmaEvent, zadarmaRequestAuth, zadarmaSign, zadarmaSignedString } from "@/lib/crm/telephony-protocol";
import { mapStatus, parseWazzupWebhook, statusRank } from "@/lib/crm/wazzup-protocol";
import { automationTriggers, fillTemplate, isTrigger } from "@/lib/crm/automation-meta";
import { decryptSecret, encryptSecret, safeEqual } from "@/lib/crm/crypto";
import { matches } from "@/lib/crm/automations";

const migration = readFileSync(path.resolve(import.meta.dirname, "../drizzle/0013_crm_pro.sql"), "utf8");

describe("права и системные роли", () => {
  it("у всех прав уникальные ключи, isPermission их узнаёт", () => {
    expect(new Set(allPermissions).size).toBe(allPermissions.length);
    expect(allPermissions.every(isPermission)).toBe(true);
    expect(isPermission("root.everything")).toBe(false);
    expect(permissionGroups.reduce((n, g) => n + g.items.length, 0)).toBe(allPermissions.length);
  });

  it("роли в миграции совпадают с описанием в коде", () => {
    const seeded = [...migration.matchAll(/INSERT INTO "crm_roles" \("key","name","scope","permissions"\) VALUES \('(\w+)','([^']+)','(\w+)',ARRAY\[([^\]]*)\]/g)];
    expect(seeded.map((m) => m[1]).sort()).toEqual(Object.keys(systemRoles).sort());
    for (const [, key, name, scope, perms] of seeded) {
      const role = systemRoles[key];
      expect(name).toBe(role.name);
      expect(scope).toBe(role.scope);
      const list = perms.split(",").map((p) => p.trim().replace(/'/g, ""));
      expect(list.every(isPermission)).toBe(true);
      expect([...list].sort()).toEqual([...role.permissions].sort());
    }
  });

  it("маскирует контакты, не раскрывая середину", () => {
    expect(maskPhone("+7 701 123 45 78")).toBe("+7 701 ••• •• 78");
    expect(maskPhone("123")).toBe("•••");
    expect(maskPhone(null)).toBe("");
    expect(maskEmail("aliya@gmail.com")).toBe("al•••@gmail.com");
    expect(maskEmail("broken")).toBe("•••");
  });
});

describe("телефоны", () => {
  it("приводит казахстанские номера к 7XXXXXXXXXX", () => {
    expect(normalizePhone("8 (701) 123-45-67")).toBe("77011234567");
    expect(normalizePhone("+7 701 123 45 67")).toBe("77011234567");
    expect(normalizePhone("7011234567")).toBe("77011234567");
    expect(normalizePhone("")).toBe("");
    expect(normalizePhone("+44 20 7946 0958")).toBe("442079460958");
  });

  it("форматирует и сравнивает номера, записанные по-разному", () => {
    expect(formatPhone("87011234567")).toBe("+7 701 123 45 67");
    expect(phoneKey("+7 701 123 45 67")).toBe(phoneKey("8-701-123-45-67"));
    expect(isPhoneLike("77011234567")).toBe(true);
    expect(isPhoneLike("aliya.shop")).toBe(false);
    expect(isPhoneLike("12345")).toBe(false);
  });
});

describe("Zadarma", () => {
  it("подписывает как PHP: base64 от hex-строки HMAC-SHA1", () => {
    expect(zadarmaSign("The quick brown fox jumps over the lazy dog", "key")).toBe("ZGU3YzliODViOGI3OGFhNmJjOGE3YTM2ZjcwYTkwNzAxYzlkYjRkOQ==");
  });

  it("подписывает запрос к API: метод + параметры + md5(параметры)", () => {
    const { query, authorization } = zadarmaRequestAuth("/v1/request/callback/", { to: "77011234567", from: "100" }, "k", "secret");
    expect(query).toBe("from=100&to=77011234567");
    expect(authorization).toBe("k:MjJiYWQ5YzdlYWY2MjM4MjU1OTUzODk0OGNhYTViOGM1OTZjOWRjNQ==");
  });

  it("знает, какие поля подписаны в каждом событии", () => {
    expect(zadarmaSignedString({ event: "NOTIFY_START", caller_id: "a", called_did: "b", call_start: "c" })).toBe("abc");
    expect(zadarmaSignedString({ event: "NOTIFY_OUT_END", internal: "100", destination: "7701", call_start: "t" })).toBe("1007701t");
    expect(zadarmaSignedString({ event: "NOTIFY_RECORD", pbx_call_id: "p", call_id_with_rec: "r" })).toBe("pr");
    expect(zadarmaSignedString({ event: "NOTIFY_UNKNOWN" })).toBeNull();
  });

  it("разбирает события звонков", () => {
    const end = parseZadarmaEvent({ event: "NOTIFY_END", pbx_call_id: "x1", caller_id: "87011234567", called_did: "7727", call_start: "2026-09-30 10:00:00", internal: "101", duration: "0", disposition: "no answer", is_recorded: "0" });
    expect(end).toMatchObject({ stage: "end", direction: "in", status: "missed", clientPhone: "77011234567", extension: "101", durationSec: 0, hasRecording: false });
    const outEnd = parseZadarmaEvent({ event: "NOTIFY_OUT_END", pbx_call_id: "x2", internal: "100", destination: "+77011234567", call_start: "2026-09-30 10:00:00", duration: "0", disposition: "cancel" });
    expect(outEnd?.status).toBe("failed"); // недозвон на исходящем — не «пропущенный»
    const rec = parseZadarmaEvent({ event: "NOTIFY_OUT_END", pbx_call_id: "x3", internal: "100", destination: "77011234567", call_start: "", duration: "95", disposition: "answered", is_recorded: "1", call_id_with_rec: "r1" });
    expect(rec).toMatchObject({ status: "answered", durationSec: 95, hasRecording: true, recordingRef: "r1" });
    expect(parseZadarmaEvent({ event: "NOTIFY_START" })).toBeNull();
  });

  it("универсальный вебхук: проверка полей и вывод итога звонка", () => {
    expect(parseGenericEvent({ event: "boom", callId: "1" })).toBeNull();
    expect(parseGenericEvent({ event: "end", phone: "1" })).toBeNull();
    expect(parseGenericEvent({ event: "end", callId: "1", direction: "in", phone: "87011234567", duration: 0 })).toMatchObject({ status: "missed", clientPhone: "77011234567", provider: "pbx" });
    expect(parseGenericEvent({ event: "end", callId: "2", direction: "out", phone: "1", duration: 30 })?.status).toBe("answered");
    expect(parseGenericEvent({ event: "end", callId: "3", phone: "1", recordingUrl: "javascript:alert(1)" })?.recordingRef).toBeNull();
  });
});

describe("Wazzup", () => {
  it("тестовый запрос и мусор не ломают разбор", () => {
    expect(parseWazzupWebhook({ test: true }).test).toBe(true);
    expect(parseWazzupWebhook(null)).toEqual({ test: false, messages: [], statuses: [] });
    expect(parseWazzupWebhook({ messages: [{ text: "без id" }], statuses: "x" }).messages).toHaveLength(0);
  });

  it("разбирает входящие, эхо и вложения", () => {
    const { messages } = parseWazzupWebhook({
      messages: [
        { messageId: "m1", dateTime: "2026-09-30T10:00:00.000Z", channelId: "c", chatType: "whatsapp", chatId: "77011234567", type: "text", text: "Привет", isEcho: false, contact: { name: "Алия", avatarUri: "https://a/1.jpg" } },
        { messageId: "m2", dateTime: "bad", chatType: "instagram", chatId: "aliya.shop", type: "image", contentUri: "https://x/1.jpg", isEcho: true },
      ],
    });
    expect(messages[0]).toMatchObject({ externalId: "m1", contactName: "Алия", avatarUrl: "https://a/1.jpg", isEcho: false, text: "Привет" });
    expect(messages[1]).toMatchObject({ isEcho: true, text: "📷 Фото", mediaUrl: "https://x/1.jpg", chatType: "instagram" });
    expect(Number.isNaN(messages[1].at.getTime())).toBe(false);
  });

  it("статусы доставки и их порядок", () => {
    const { statuses } = parseWazzupWebhook({ statuses: [{ messageId: "m1", status: "read" }, { messageId: "m2", status: "error", error: { description: "Номер не в WhatsApp" } }, { messageId: "m3", status: "inbound" }] });
    expect(statuses).toEqual([
      { externalId: "m1", status: "read", error: null },
      { externalId: "m2", status: "error", error: "Номер не в WhatsApp" },
    ]);
    expect(mapStatus("edited")).toBeNull();
    expect(statusRank.read).toBeGreaterThan(statusRank.delivered);
    expect(statusRank.delivered).toBeGreaterThan(statusRank.sent);
  });
});

describe("автоматизации и шаблоны", () => {
  it("подставляет переменные и убирает пустоты", () => {
    expect(fillTemplate("Здравствуйте, {имя}! Заказ №{заказ}", { name: "Алия", order: 42 })).toBe("Здравствуйте, Алия! Заказ №42");
    expect(fillTemplate("Здравствуйте, {имя}!", { name: "" })).toBe("Здравствуйте!");
    expect(fillTemplate("{ссылка} · {менеджер}", { link: "https://x", manager: "Айгерим" })).toBe("https://x · Айгерим");
  });

  it("условия правил: пустое — любое, заданное — точное совпадение", () => {
    expect(matches({ conditions: {} }, { subject: "s", stageId: "a" })).toBe(true);
    expect(matches({ conditions: { stageId: "a" } }, { subject: "s", stageId: "a" })).toBe(true);
    expect(matches({ conditions: { stageId: "a" } }, { subject: "s", stageId: "b" })).toBe(false);
    expect(matches({ conditions: { source: "whatsapp", minutes: 15 } }, { subject: "s", source: "call" })).toBe(false);
    expect(matches({ conditions: { channel: null } }, { subject: "s" })).toBe(true);
  });

  it("автоматизации из миграции используют известные события и действия", () => {
    const rows = [...migration.matchAll(/INSERT INTO "crm_automations" \("name","trigger","conditions","actions"\) VALUES \('[^']+','([\w.]+)','([^']*)'::jsonb,'([^']*)'::jsonb/g)];
    expect(rows.length).toBe(3);
    for (const [, trigger, , actions] of rows) {
      expect(isTrigger(trigger)).toBe(true);
      for (const a of JSON.parse(actions)) expect(["create_task", "send_message", "assign", "move_stage", "notify"]).toContain(a.type);
    }
    expect(Object.keys(automationTriggers)).toContain("message.unanswered");
  });
});

describe("шифрование секретов", () => {
  it("расшифровывает своё и отвергает подделку", () => {
    const enc = encryptSecret("wz-api-key");
    expect(enc.startsWith("v1.")).toBe(true);
    expect(enc).not.toContain("wz-api-key");
    expect(decryptSecret(enc)).toBe("wz-api-key");
    expect(encryptSecret("wz-api-key")).not.toBe(enc); // случайный IV
    const parts = enc.split(".");
    parts[3] = Buffer.from("подмена").toString("base64url");
    expect(decryptSecret(parts.join("."))).toBeNull();
    expect(decryptSecret("plain")).toBeNull();
  });

  it("сравнивает токены без утечки по времени", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});
