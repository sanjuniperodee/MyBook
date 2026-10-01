import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { allPermissions, isPermission, maskEmail, maskPhone, permissionGroups, systemRoles } from "@/modules/access/domain/permissions";
import { formatPhone, isPhoneLike, normalizePhone, phoneKey } from "@/lib/crm/phone";
import { parseGenericEvent, parseZadarmaEvent, zadarmaRequestAuth, zadarmaSign, zadarmaSignedString } from "@/lib/crm/telephony-protocol";
import { mapStatus, parseWazzupWebhook, statusRank } from "@/lib/crm/wazzup-protocol";
import { automationActions, automationTriggers, fillTemplate, isTrigger } from "@/lib/crm/automation-meta";
import { isWorkTime, parseWorkHours, workMinutesBetween } from "@/lib/crm/schedule";
import { findMentions } from "@/lib/crm/mentions";
import { milestoneOrder, stageMilestones } from "@/lib/crm/deal-meta";
import { buildSiteUrl, channelOf, linkCodeFromText, normalizeSlug, toAttribution } from "@/lib/crm/channels";
import { defaultBotConfig, matchOption, parseBotConfig, parseDateAnswer, questionText } from "@/lib/crm/bot-logic";
import { decryptSecret, encryptSecret, safeEqual } from "@/shared/crypto";
import { matches } from "@/lib/crm/automations";

const migration = readFileSync(path.resolve(import.meta.dirname, "../drizzle/0013_crm_pro.sql"), "utf8");
const later = readFileSync(path.resolve(import.meta.dirname, "../drizzle/0014_crm_sales.sql"), "utf8");

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
      // Права, добавленные следующими миграциями.
      for (const m of later.matchAll(/array_append\("permissions", '([\w.]+)'\) WHERE "key" IN \(([^)]*)\)/g)) if (m[2].includes(`'${key}'`)) list.push(m[1]);
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
    const rows = [...(migration + later).matchAll(/INSERT INTO "crm_automations" \("name","trigger","conditions","actions"(?:,"active")?\) VALUES \('[^']+','([\w.]+)','([^']*)'::jsonb,'([^']*)'::jsonb/g)];
    expect(rows.length).toBe(6);
    for (const [, trigger, , actions] of rows) {
      expect(isTrigger(trigger)).toBe(true);
      for (const a of JSON.parse(actions)) expect(Object.keys(automationActions)).toContain(a.type);
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

describe("рабочее время", () => {
  const hours = parseWorkHours('{"days":[1,2,3,4,5],"from":"09:00","to":"18:00"}');
  // Алматы — UTC+5: 09:00 местного = 04:00 UTC.
  const at = (iso: string) => new Date(iso);

  it("разбирает настройку и подставляет значения по умолчанию", () => {
    expect(hours).toEqual({ days: [1, 2, 3, 4, 5], from: "09:00", to: "18:00" });
    expect(parseWorkHours("мусор")).toEqual({ days: [1, 2, 3, 4, 5, 6, 7], from: "09:00", to: "21:00" });
    expect(parseWorkHours('{"days":[9,1],"from":"25:00"}')).toEqual({ days: [1], from: "09:00", to: "21:00" });
  });

  it("определяет рабочее время в часовом поясе магазина", () => {
    expect(isWorkTime(at("2026-09-30T05:00:00Z"), hours)).toBe(true); // среда 10:00
    expect(isWorkTime(at("2026-09-30T13:30:00Z"), hours)).toBe(false); // среда 18:30
    expect(isWorkTime(at("2026-10-03T06:00:00Z"), hours)).toBe(false); // суббота
    const night = parseWorkHours('{"days":[1,2,3,4,5,6,7],"from":"20:00","to":"02:00"}');
    expect(isWorkTime(at("2026-09-30T20:00:00Z"), night)).toBe(true); // 01:00 ночи
    expect(isWorkTime(at("2026-09-30T22:00:00Z"), night)).toBe(false); // 03:00
  });

  it("норматив ответа считает только рабочие минуты", () => {
    // среда 17:50 → четверг 09:10: 10 минут вечером + 10 утром
    expect(workMinutesBetween(at("2026-09-30T12:50:00Z"), at("2026-10-01T04:10:00Z"), hours)).toBe(20);
    // пятница 17:00 → понедельник 10:00: 60 + 60
    expect(workMinutesBetween(at("2026-10-02T12:00:00Z"), at("2026-10-05T05:00:00Z"), hours)).toBe(120);
    // внутри одного рабочего дня
    expect(workMinutesBetween(at("2026-09-30T05:00:00Z"), at("2026-09-30T05:15:00Z"), hours)).toBe(15);
    expect(workMinutesBetween(at("2026-09-30T05:15:00Z"), at("2026-09-30T05:00:00Z"), hours)).toBe(0);
  });
});

describe("упоминания и воронка по действиям", () => {
  const staff = [
    { id: "1", label: "Айгерим" },
    { id: "2", label: "Айгерим Сапарова" },
    { id: "3", label: "manager" },
  ];
  it("находит упомянутых по имени, длинное имя не задевает короткое", () => {
    expect(findMentions("@Айгерим Сапарова проверь адрес", staff)).toEqual(["2"]);
    expect(findMentions("@айгерим и @MANAGER, гляньте", staff).sort()).toEqual(["1", "3"]);
    expect(findMentions("без упоминаний, e-mail a@b.kz", staff)).toEqual([]);
  });

  it("события воронки идут по порядку и все описаны", () => {
    expect(milestoneOrder).toEqual(Object.keys(stageMilestones));
    expect(milestoneOrder.indexOf("book_started")).toBeLessThan(milestoneOrder.indexOf("book_ready"));
  });

  it("условие «рабочее время» в правилах", () => {
    expect(matches({ conditions: { hours: "off" } }, { subject: "s", workTime: false })).toBe(true);
    expect(matches({ conditions: { hours: "off" } }, { subject: "s", workTime: true })).toBe(false);
    expect(matches({ conditions: { hours: "work" } }, { subject: "s", workTime: true })).toBe(true);
    expect(matches({ conditions: { hours: "work" } }, { subject: "s", workTime: false })).toBe(false);
  });

  it("переменные повода и даты в шаблонах", () => {
    expect(fillTemplate("Годовщина: {повод}, {дата}", { occasion: "Свадьба", date: "12 ноября" })).toBe("Годовщина: Свадьба, 12 ноября");
  });
});

describe("каналы привлечения и UTM-ссылки", () => {
  it("определяет канал по меткам, рефереру и источнику сделки", () => {
    expect(channelOf({ source: "instagram", medium: "social" })).toBe("instagram");
    expect(channelOf({ source: "IG" })).toBe("instagram");
    expect(channelOf({ source: "instagram", medium: "influencer" })).toBe("bloggers");
    expect(channelOf({ source: "google", medium: "cpc" })).toBe("google_ads");
    expect(channelOf({ source: "google", medium: "organic" })).toBe("google");
    expect(channelOf({ source: "yandex", medium: "cpc" })).toBe("yandex_ads");
    expect(channelOf({ referrer: "www.google.com" })).toBe("google");
    expect(channelOf({ referrer: "l.instagram.com" })).toBe("instagram");
    expect(channelOf({ referrer: "some-blog.kz" })).toBe("referral");
    expect(channelOf(null, "whatsapp")).toBe("whatsapp");
    expect(channelOf(null, "call")).toBe("call");
    expect(channelOf(null)).toBe("direct");
    expect(channelOf({ source: "partner-shop" })).toBe("other");
  });

  it("находит код ссылки в первом сообщении WhatsApp", () => {
    expect(linkCodeFromText("Здравствуйте! Хочу книгу (код: insta-bio)")).toBe("insta-bio");
    expect(linkCodeFromText("Привет #TikTok-NY")).toBe("tiktok-ny");
    expect(linkCodeFromText("Сколько стоит?")).toBeNull();
    expect(linkCodeFromText("мой номер #1")).toBeNull();
  });

  it("собирает ссылку с UTM и нормализует короткий код", () => {
    expect(buildSiteUrl("https://mybook.kz", "/kniga/kniga-mame", { source: "instagram", medium: "social", campaign: "8march" }, "ig-8m")).toBe(
      "https://mybook.kz/kniga/kniga-mame?utm_source=instagram&utm_medium=social&utm_campaign=8march&lnk=ig-8m",
    );
    expect(normalizeSlug("Instagram — Шапка профиля")).toBe("instagram-shapka-profilya");
    expect(normalizeSlug("Қазақ блогер!")).toBe("qazaq-bloger");
    expect(toAttribution({ source: "ig", evil: 1, medium: "" })).toEqual({ source: "ig" });
    expect(toAttribution(null)).toBeNull();
  });
});

describe("бот-квалификатор", () => {
  const now = new Date("2026-09-30T10:00:00Z");
  it("разбирает дату из ответа клиента в ближайшую будущую", () => {
    expect(parseDateAnswer("15.11", now)).toBe("2026-11-15");
    expect(parseDateAnswer("к 3.02", now)).toBe("2027-02-03");
    expect(parseDateAnswer("15.11.2027", now)).toBe("2027-11-15");
    expect(parseDateAnswer("12 ноября", now)).toBe("2026-11-12");
    expect(parseDateAnswer("1 мая", now)).toBe("2027-05-01");
    expect(parseDateAnswer("8 марта", now)).toBe("2027-03-08");
    expect(parseDateAnswer("31.02", now)).toBeNull();
    expect(parseDateAnswer("скоро", now)).toBeNull();
  });

  it("понимает вариант по номеру и по тексту", () => {
    const opts = ["День рождения", "Годовщина", "Свадьба"];
    expect(matchOption("2", opts)).toBe("Годовщина");
    expect(matchOption("свадьба", opts)).toBe("Свадьба");
    expect(matchOption("на день рождения мамы", opts)).toBe("День рождения");
    expect(matchOption("9", opts)).toBeNull();
    expect(matchOption("просто так", opts)).toBeNull();
  });

  it("показывает варианты списка с номерами и терпит испорченную настройку", () => {
    expect(questionText({ text: "Повод?", field: "occasion" }, ["А", "Б"])).toBe("Повод?\n1 — А\n2 — Б");
    expect(parseBotConfig("{bad")).toEqual(defaultBotConfig);
    expect(parseBotConfig(JSON.stringify({ greeting: "Привет", questions: [{ text: "", field: "x" }, { text: "Кому?", field: "recipient" }], finish: "" })).questions).toEqual([{ text: "Кому?", field: "recipient" }]);
  });
});
