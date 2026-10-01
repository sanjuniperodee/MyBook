import { describe, expect, it } from "vitest";
import { base32Decode, base32Encode, hashBackupCode, hotp, isBackupCodeShape, otpauthUrl, totp, verifyTotp, generateBackupCodes, generateSecret } from "@/modules/identity/domain/totp";
import { ipAllowed, normalizeIp, parseAllowlist } from "@/modules/access/domain/ip";
import { signValue, verifySigned } from "@/shared/crypto";
import { htmlToText, parseAddress, parseInboundWebhook, replySubject, stripQuoted } from "@/lib/crm/email-logic";
import { businessContext, cleanReply, extractSchema, normalizeExtracted, parseSummary, transcript, type AiField } from "@/lib/crm/ai-logic";

const fields: AiField[] = [
  { key: "occasion", label: "Повод", type: "select", options: ["День рождения", "Годовщина", "Юбилей"] },
  { key: "event_date", label: "Дата события", type: "date", options: [] },
  { key: "recipient", label: "Для кого", type: "text", options: [] },
  { key: "budget", label: "Бюджет", type: "number", options: [] },
  { key: "vip", label: "VIP", type: "checkbox", options: [] },
];

describe("AI-помощник: промпты и разбор ответов", () => {
  it("переписка: роли, заметки и лимит — берём последние сообщения", () => {
    const msgs = [
      { direction: "in" as const, text: "Здравствуйте, хочу книгу маме", at: "2026-09-01T10:00:00Z" },
      { direction: "out" as const, text: "Добрый день!", author: "Айгерим", at: "2026-09-01T10:01:00Z" },
      { direction: "out" as const, text: "клиент горячий", internal: true, author: "Айгерим", at: "2026-09-01T10:02:00Z" },
      { direction: "in" as const, text: "  ", at: "2026-09-01T10:03:00Z" },
    ];
    const t = transcript(msgs);
    expect(t.split("\n")).toHaveLength(3);
    expect(t).toContain("Клиент: Здравствуйте, хочу книгу маме");
    expect(t).toContain("Менеджер (Айгерим): Добрый день!");
    expect(t).toContain("Заметка сотрудника (Айгерим): клиент горячий");
    const long = Array.from({ length: 50 }, (_, i) => ({ direction: "in" as const, text: `сообщение номер ${i} `.repeat(10), at: new Date(2026, 0, 1, 0, i) }));
    const cut = transcript(long, 1000);
    expect(cut.length).toBeLessThanOrEqual(1100);
    expect(cut).toContain("сообщение номер 49");
    expect(cut).not.toContain("сообщение номер 0 ");
  });

  it("контекст бизнеса берёт цены из конфига и базу знаний владельца", () => {
    const c = businessContext("Печать 5–7 дней");
    expect(c).toContain("24 900 ₸".replace(/ /g, " ").length ? "Твёрдая обложка" : "");
    expect(c).toMatch(/24\s900/);
    expect(c).toContain("Печать 5–7 дней");
    expect(businessContext("")).not.toContain("Правила");
  });

  it("схема извлечения: флажки пропускаем, списки — enum с пустым значением", () => {
    const s = extractSchema(fields) as { properties: Record<string, { enum?: string[] }>; required: string[]; additionalProperties: boolean };
    expect(Object.keys(s.properties)).toEqual(["occasion", "event_date", "recipient", "budget"]);
    expect(s.properties.occasion.enum).toEqual(["День рождения", "Годовщина", "Юбилей", ""]);
    expect(s.required).toHaveLength(4);
    expect(s.additionalProperties).toBe(false);
  });

  it("нормализация ответа модели отбрасывает мусор", () => {
    const v = normalizeExtracted(fields, { occasion: "годовщина", event_date: "2027-02-14", recipient: " бабушка Роза ", budget: "25 000 ₸", vip: "true", extra: "x" });
    expect(v).toEqual({ occasion: "Годовщина", event_date: "2027-02-14", recipient: "бабушка Роза", budget: 25000 });
    expect(normalizeExtracted(fields, { occasion: "Свадьба", event_date: "14.02.2027", recipient: "", budget: "много" })).toEqual({});
    expect(normalizeExtracted(fields, null)).toEqual({});
  });

  it("резюме: ограничения и значения по умолчанию", () => {
    expect(parseSummary({ summary: "Клиент выбирает тариф", next_step: "Позвонить", due_days: 99, temperature: "boiling", risks: "" })).toEqual({ summary: "Клиент выбирает тариф", nextStep: "Позвонить", dueDays: 30, temperature: "warm", risks: "" });
    expect(parseSummary({ summary: "", next_step: "" })).toBeNull();
    expect(parseSummary("nope")).toBeNull();
    expect(parseSummary({ summary: "a", next_step: "b", due_days: -3, temperature: "hot" })?.dueDays).toBe(0);
  });

  it("ответ без обрамляющих кавычек", () => {
    expect(cleanReply(" «Здравствуйте!» ")).toBe("Здравствуйте!");
    expect(cleanReply('"Добрый день"')).toBe("Добрый день");
    expect(cleanReply("Цена — «Премиум»")).toBe("Цена — «Премиум»");
    expect(cleanReply("«Премиум» или «Твёрдая»")).toBe("«Премиум» или «Твёрдая»");
  });
});

describe("2FA: TOTP по RFC 6238", () => {
  const key = Buffer.from("12345678901234567890");
  it("векторы RFC 6238 (SHA-1, 8 знаков)", () => {
    for (const [t, code] of [
      [59, "94287082"],
      [1111111109, "07081804"],
      [1111111111, "14050471"],
      [1234567890, "89005924"],
      [2000000000, "69279037"],
    ] as const)
      expect(hotp(key, Math.floor(t / 30), 8)).toBe(code);
  });
  it("векторы RFC 4226 (HOTP, 6 знаков)", () => {
    expect([0, 1, 2, 9].map((c) => hotp(key, c))).toEqual(["755224", "287082", "359152", "520489"]);
  });
  it("base32 туда и обратно, секрет 160 бит", () => {
    expect(base32Encode(key)).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    expect(base32Decode("gezd gnbv gy3t qojq gezd gnbv gy3t qojq")).toEqual(key);
    expect(base32Decode(generateSecret())).toHaveLength(20);
    expect(() => base32Decode("1!")).toThrow();
  });
  it("проверка кода с допуском ±30 секунд", () => {
    const secret = base32Encode(key);
    const now = 1_700_000_000_000;
    const code = totp(secret, now);
    expect(verifyTotp(secret, code, now)).toBe(Math.floor(now / 30_000));
    expect(verifyTotp(secret, code, now + 30_000)).not.toBeNull();
    expect(verifyTotp(secret, code, now + 90_000)).toBeNull();
    expect(verifyTotp(secret, "12345", now)).toBeNull();
    expect(verifyTotp(secret, `${code.slice(0, 3)} ${code.slice(3)}`, now)).not.toBeNull();
  });
  it("otpauth-ссылка и резервные коды", () => {
    expect(otpauthUrl("ABC", "a@b.kz")).toBe("otpauth://totp/MyBooks%20CRM%3Aa%40b.kz?secret=ABC&issuer=MyBooks%20CRM&algorithm=SHA1&digits=6&period=30");
    const codes = generateBackupCodes();
    expect(codes).toHaveLength(10);
    expect(codes.every(isBackupCodeShape)).toBe(true);
    expect(isBackupCodeShape("123456")).toBe(false);
    expect(hashBackupCode("1234-5678")).toBe(hashBackupCode("12345678"));
  });
  it("подписанный билет нельзя подделать", () => {
    const v = signValue("user.123");
    expect(verifySigned(v)).toBe("user.123");
    expect(verifySigned(v.replace("user", "admin"))).toBeNull();
    expect(verifySigned("user.123.bad")).toBeNull();
  });
});

describe("список разрешённых IP", () => {
  it("адреса и подсети IPv4/IPv6, ошибки отдельно", () => {
    const { rules, invalid } = parseAllowlist("95.56.10.20 # офис\n10.0.0.0/8, 2a02:6b8::/32\nнепонятно\n1.2.3.4/33");
    expect(rules.map((r) => r.raw)).toEqual(["95.56.10.20", "10.0.0.0/8", "2a02:6b8::/32"]);
    expect(invalid).toEqual(["непонятно", "1.2.3.4/33"]);
    expect(ipAllowed("95.56.10.20", rules)).toBe(true);
    expect(ipAllowed("95.56.10.21", rules)).toBe(false);
    expect(ipAllowed("10.200.1.1", rules)).toBe(true);
    expect(ipAllowed("::ffff:10.1.1.1", rules)).toBe(true);
    expect(ipAllowed("2a02:6b8:0:1::5", rules)).toBe(true);
    expect(ipAllowed("2a02:6b9::1", rules)).toBe(false);
    expect(ipAllowed("local", rules)).toBe(false);
    expect(ipAllowed("anything", [])).toBe(true);
    expect(normalizeIp("[::ffff:1.2.3.4]")).toBe("1.2.3.4");
  });
});

describe("почта как канал", () => {
  it("тема ответа без накопления Re:", () => {
    expect(replySubject("Заказ книги")).toBe("Re: Заказ книги");
    expect(replySubject("Re: RE: Fwd: Заказ книги")).toBe("Re: Заказ книги");
    expect(replySubject("Ответ: вопрос")).toBe("Re: вопрос");
    expect(replySubject("")).toBe("Ответ от MyBooks");
  });
  it("цитаты и подпись отрезаются", () => {
    expect(stripQuoted("Спасибо, беру Премиум!\n\nOn Mon, 1 Sep 2026 at 10:00, MyBooks <hello@mybook.kz> wrote:\n> Здравствуйте")).toBe("Спасибо, беру Премиум!");
    expect(stripQuoted("Да\r\n\r\n1 сент. 2026 г., в 10:00, MyBooks <a@b.kz> пишет:\r\n> текст")).toBe("Да");
    expect(stripQuoted("Хорошо\n-- \nАйгерим, тел. 8700")).toBe("Хорошо");
    expect(stripQuoted("> цитата\nответ")).toBe("ответ");
  });
  it("адрес отправителя", () => {
    expect(parseAddress("Айгерим <Aigerim@Mail.KZ>")).toEqual({ email: "aigerim@mail.kz", name: "Айгерим" });
    expect(parseAddress('"Иванов, Иван" <ivan@x.kz>')).toEqual({ email: "ivan@x.kz", name: "Иванов, Иван" });
    expect(parseAddress("a@b.kz")).toEqual({ email: "a@b.kz", name: "" });
    expect(parseAddress("не адрес")).toBeNull();
  });
  it("HTML в текст", () => {
    expect(htmlToText("<p>Привет&nbsp;мир</p><style>p{}</style><div>Вторая&amp;строка</div>")).toBe("Привет мир\nВторая&строка");
  });
  it("вебхук: свой JSON, Mailgun и автоответы", () => {
    const own = parseInboundWebhook({ from: "Айгерим <a@b.kz>", subject: "Вопрос", text: "Сколько печать?\n> старое", messageId: "<m1@b.kz>" })!;
    expect(own).toMatchObject({ from: "a@b.kz", fromName: "Айгерим", subject: "Вопрос", text: "Сколько печать?", messageId: "<m1@b.kz>", auto: false });
    const mg = parseInboundWebhook({ sender: "x@y.kz", subject: "Hi", "body-plain": "Текст", "Message-Id": "<z@y>" })!;
    expect(mg).toMatchObject({ from: "x@y.kz", text: "Текст", messageId: "<z@y>" });
    expect(parseInboundWebhook({ from: "x@y.kz", html: "<b>Жирный</b>" })!.text).toBe("Жирный");
    expect(parseInboundWebhook({ from: "x@y.kz", text: "out of office", "Auto-Submitted": "auto-replied" })!.auto).toBe(true);
    expect(parseInboundWebhook({ text: "без отправителя" })).toBeNull();
  });
});
