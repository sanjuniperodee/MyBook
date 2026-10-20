import { describe, expect, it } from "vitest";
import { afterManagerReply, autoReplyAllowed, controlAt, defaultBotConfig, readBotControl, type BotConfig } from "@/modules/messaging/domain";
import { BOT_PAUSE_MS, type BotSellerModel } from "@/modules/messaging/application";
import { botStatus } from "@/modules/messaging/application/botPreview";
import { isWorkTime, nextWorkStart, parseWorkHours } from "@/shared/domain/schedule";
import { BOT_CONFIG, inbound, setup } from "./doubles/botHarness";

// ─── режим чата: чистые правила ─────────────────────────────────────────────

const NOW = new Date("2026-10-20T06:00:00Z");
const ctl = (mode: "active" | "human" | "paused" | "disabled", until: string | null = null) => ({ mode, until, by: "u1", at: NOW.toISOString(), reason: "crm" });

describe("режим AI в чате: правила", () => {
  it("нет записи или AI возобновлён — отвечает; отключён вручную и на паузе — нет ни днём, ни ночью", () => {
    for (const workTime of [true, false]) {
      expect(autoReplyAllowed(null, NOW, { workTime, humanNight: true })).toBe(true);
      expect(autoReplyAllowed(ctl("active"), NOW, { workTime, humanNight: true })).toBe(true);
      expect(autoReplyAllowed(ctl("disabled"), NOW, { workTime, humanNight: true })).toBe(false);
      expect(autoReplyAllowed(ctl("paused", "2026-10-20T07:00:00Z"), NOW, { workTime, humanNight: true })).toBe(false);
    }
  });

  it("менеджер перехватил: днём молчит (сам не возвращается), ночью — по настройке; прежний подхват — днём тоже можно", () => {
    expect(autoReplyAllowed(ctl("human"), NOW, { workTime: true, humanNight: true })).toBe(false);
    expect(autoReplyAllowed(ctl("human"), new Date(NOW.getTime() + 7 * 86_400_000), { workTime: true, humanNight: true })).toBe(false);
    expect(autoReplyAllowed(ctl("human"), NOW, { workTime: false, humanNight: true })).toBe(true);
    expect(autoReplyAllowed(ctl("human"), NOW, { workTime: false, humanNight: false })).toBe(false);
    expect(autoReplyAllowed(ctl("human"), NOW, { workTime: true, humanNight: true, humanHold: false })).toBe(true);
  });

  it("пауза кончилась — как будто записи нет; испорченная запись — тоже", () => {
    expect(controlAt(ctl("paused", "2026-10-20T05:00:00Z"), NOW)).toBeNull();
    expect(controlAt(ctl("paused", "2026-10-20T07:00:00Z"), NOW)?.mode).toBe("paused");
    expect(readBotControl({ mode: "paused" })).toBeNull();
    expect(readBotControl({ mode: "что-то" })).toBeNull();
    expect(readBotControl("human")).toBeNull();
  });

  it("ответ менеджера: ручное отключение не превращается в автоматическую паузу; повторный ответ режим не меняет", () => {
    expect(afterManagerReply(ctl("disabled"), NOW, "u2", "crm")).toBeNull();
    expect(afterManagerReply(ctl("human"), NOW, "u2", "crm")).toBeNull();
    expect(afterManagerReply(null, NOW, "u2", "phone")).toMatchObject({ mode: "human", by: "u2", reason: "phone" });
    expect(afterManagerReply(ctl("paused", "2026-10-20T07:00:00Z"), NOW, null, "phone")?.mode).toBe("human");
  });
});

// ─── рабочее время ──────────────────────────────────────────────────────────

describe("рабочее время: пояс магазина, полночь, праздники", () => {
  const night = parseWorkHours('{"days":[1,2,3,4,5],"from":"20:00","to":"02:00","holidays":["2026-10-23","плохо"]}');
  it("смена через полночь: ночь — к дню начала смены; праздник — по дню начала смены", () => {
    expect(night.holidays).toEqual(["2026-10-23"]);
    // Чт 22.10 23:00 Алматы — работает; Пт 23.10 01:00 — ночь четверговой смены, работает.
    expect(isWorkTime(new Date("2026-10-22T18:00:00Z"), night, "Asia/Almaty")).toBe(true);
    expect(isWorkTime(new Date("2026-10-22T20:00:00Z"), night, "Asia/Almaty")).toBe(true);
    // Пт 23.10 — праздник: вечерняя смена пятницы не работает, и её ночь (Сб 01:00) тоже.
    expect(isWorkTime(new Date("2026-10-23T16:00:00Z"), night, "Asia/Almaty")).toBe(false);
    expect(isWorkTime(new Date("2026-10-23T20:00:00Z"), night, "Asia/Almaty")).toBe(false);
    // Пояс — магазина, а не процесса или браузера: 16:30 UTC — 21:30 в Алматы (смена), но 19:30 в Москве (ещё нет).
    expect(isWorkTime(new Date("2026-10-22T16:30:00Z"), night, "Asia/Almaty")).toBe(true);
    expect(isWorkTime(new Date("2026-10-22T16:30:00Z"), night, "Europe/Moscow")).toBe(false);
  });

  it("следующая смена после праздников; без настроек — 09:00–21:00 каждый день (документированное поведение)", () => {
    const h = parseWorkHours('{"days":[1,2,3,4,5,6,7],"from":"09:00","to":"21:00","holidays":["2026-12-16","2026-12-17"]}');
    expect(nextWorkStart(new Date("2026-12-15T17:00:00Z"), h, "Asia/Almaty")?.toISOString()).toBe("2026-12-18T04:00:00.000Z");
    expect(parseWorkHours(null)).toEqual({ days: [1, 2, 3, 4, 5, 6, 7], from: "09:00", to: "21:00" });
  });
});

// ─── бот в чате ─────────────────────────────────────────────────────────────

const ans = (reply: string, p: Record<string, unknown> = {}) => ({ summary: "", language: "ru", stage: "discovery", action: "reply", reply, handoff_reason: "none", fields: { recipient: "", occasion: "" }, event_date: "", plan: "unknown", asked_to_order: false, agreed: false, agreed_quote: "", ...p });
type Req = Parameters<BotSellerModel["complete"]>[0];
function model(script: (Record<string, unknown> | ((req: Req) => Promise<Record<string, unknown>> | Record<string, unknown>))[]) {
  const calls: Req[] = [];
  const m: BotSellerModel = {
    configured: async () => true,
    complete: async (req) => {
      // «Ждёт ли клиент ответа» (triage подсказки менеджеру) — отдельно: сценарий ходов бота не расходует, клиенту ничего не пишет.
      if (req.user.includes("черновик следующего сообщения менеджера")) return { text: JSON.stringify(ans("черновик менеджеру")), usage: { input: 1, output: 1 } };
      calls.push(req);
      const next = script.shift();
      if (!next) throw new Error("сценарий кончился");
      return { text: JSON.stringify(typeof next === "function" ? await next(req) : next), usage: { input: 10, output: 5 } };
    },
  };
  return { m, calls };
}
const aiConfig = (): BotConfig => ({ ...BOT_CONFIG, waitMinutes: 3, sell: { ...defaultBotConfig.sell, on: true, engine: "ai", takeover: true, hidePrices: false, speaksAs: "assistant" } });
const INTRO = /помощница менеджера/;
const said = (t: { sent: string[] }) => t.sent.filter((s) => !INTRO.test(s));
type T = ReturnType<typeof setup>;
const nowOf = (t: T) => t.deps.clock.now();
const client = (t: T, text: string, chatId = "77011234567") => t.service.ingest(inbound({ text, chatId, at: nowOf(t) }));
const run = (t: T, ms = BOT_PAUSE_MS + 1) => t.advance(ms);
const status = async (t: T, id = t.conv().id) => {
  const rec = await t.deps.store.load(id);
  return botStatus(rec, [], nowOf(t), { workTime: t.settings.workTime, humanNight: t.settings.humanNight, humanHold: t.settings.humanHold });
};

describe("перехват менеджером: бот замолкает в этом чате до «Возобновить AI»", () => {
  it("менеджер ответил из CRM — HUMAN_TAKEOVER; дальше бот молчит и через сутки, и в новый рабочий день; сообщения клиента в истории", async () => {
    const { m, calls } = model([ans("Для кого будет книга?")]);
    const t = setup({ bot: "always", config: aiConfig(), seller: m });
    await client(t, "Здравствуйте, хочу книгу маме");
    await run(t);
    expect(said(t)).toEqual(["Для кого будет книга?"]);
    await t.service.send(t.conv().id, "Айгерим, это Марат, подскажу сам 🙂", "u1");
    expect(t.conv().botControl).toMatchObject({ mode: "human", by: "u1", reason: "crm" });
    expect((await status(t)).mode).toBe("HUMAN_TAKEOVER");
    const before = calls.length;
    for (const text of ["А сколько стоит?", "Ау?", "Ответьте пожалуйста"]) {
      await client(t, text);
      await run(t, 60 * 60_000);
    }
    await run(t, 24 * 60 * 60_000);
    expect(calls.length).toBe(before);
    expect(t.sent.at(-1)).toBe("Айгерим, это Марат, подскажу сам 🙂");
    expect(t.msgs.filter((x) => x.dir === "in").map((x) => x.text)).toEqual(expect.arrayContaining(["А сколько стоит?", "Ау?", "Ответьте пожалуйста"]));
  });

  it("ответ, генерация которого началась до вмешательства менеджера, клиенту не уходит", async () => {
    let t: T;
    const { m } = model([
      async () => {
        // Пока модель думает, менеджер пишет клиенту сам.
        await t.service.send(t.conv().id, "Сейчас всё расскажу", "u1");
        return ans("Для кого будет книга?");
      },
    ]);
    t = setup({ bot: "always", config: aiConfig(), seller: m });
    await client(t, "Здравствуйте, хочу книгу маме");
    await run(t);
    expect(said(t)).toEqual(["Сейчас всё расскажу"]);
    expect(t.conv().botControl?.mode).toBe("human");
  });

  it("ответ с телефона магазина (эхо) — тоже перехват", async () => {
    const { m } = model([ans("Здравствуйте!")]);
    const t = setup({ bot: "always", config: aiConfig(), seller: m });
    await client(t, "Здравствуйте, хочу книгу маме");
    await t.service.ingest(inbound({ isEcho: true, text: "Добрый день, это Марат", at: nowOf(t) }));
    expect(t.conv().botControl).toMatchObject({ mode: "human", by: null, reason: "phone" });
  });

  it("ночью (по умолчанию) бот отвечает и в перехваченном чате — без ручного включения; утром снова молчит", async () => {
    const { m, calls } = model([ans("Для кого будет книга?"), ans("Отвечу ночью: книга делается 5–7 дней 😊"), ans("лишнее")]);
    const t = setup({ bot: "always", config: aiConfig(), seller: m });
    await client(t, "Здравствуйте, хочу книгу маме");
    await run(t);
    await t.service.send(t.conv().id, "Подскажу сам", "u1");
    t.settings.workTime = false;
    await client(t, "А сколько дней делается?");
    // Менеджер писал только что — ночью бот тоже ждёт его, как днём (не перебивает), потом подхватывает.
    await run(t, 10 * 60_000);
    expect(said(t).at(-1)).toBe("Отвечу ночью: книга делается 5–7 дней 😊");
    expect(t.conv().botControl?.mode).toBe("human");
    // Утро: рабочее время — перехваченный чат снова за менеджером, ночная беседа не продолжается.
    t.settings.workTime = true;
    const n = said(t).length;
    await client(t, "Спасибо, а доставка?");
    await run(t, 10 * 60_000);
    expect(said(t)).toHaveLength(n);
    expect(calls.some((c) => c.user.includes("Спасибо, а доставка?"))).toBe(false);
  });

  it("настройка «ночью не отвечать в таких чатах» — бот молчит и ночью", async () => {
    const { m } = model([ans("Для кого будет книга?"), ans("лишнее"), ans("лишнее")]);
    const t = setup({ bot: "always", config: aiConfig(), seller: m, humanNight: false });
    await client(t, "Здравствуйте, хочу книгу маме");
    await run(t);
    await t.service.send(t.conv().id, "Подскажу сам", "u1");
    t.settings.workTime = false;
    await client(t, "А сколько дней делается?");
    await run(t, 60 * 60_000);
    expect(said(t)).toEqual(["Для кого будет книга?", "Подскажу сам"]);
  });

  it("другие чаты работают независимо", async () => {
    const { m, calls } = model([ans("Для кого будет книга?"), ans("Подскажу 🙂 Для кого книга?")]);
    const t = setup({ bot: "always", config: aiConfig(), seller: m });
    await client(t, "Здравствуйте, хочу книгу маме");
    await run(t);
    const first = t.conv().id;
    await t.service.send(first, "Подскажу сам", "u1");
    await client(t, "Здравствуйте, хочу книгу папе", "77019999999");
    await run(t);
    expect(calls).toHaveLength(2);
    expect(said(t).at(-1)).toBe("Подскажу 🙂 Для кого книга?");
    const second = [...t.convs.values()].find((c) => c.id !== first)!;
    expect(second.botControl ?? null).toBeNull();
  });
});

describe("«Возобновить AI», пауза и ручное отключение", () => {
  async function takenOver(script: Parameters<typeof model>[0]) {
    const { m, calls } = model([ans("Для кого будет книга?"), ...script]);
    const t = setup({ bot: "always", config: aiConfig(), seller: m });
    await client(t, "Здравствуйте, хочу книгу маме");
    await run(t);
    await t.service.send(t.conv().id, "Подскажу сам", "u1");
    return { t, calls };
  }

  it("возобновить: бот сразу отвечает на накопленные сообщения — один раз и только на неотвеченные", async () => {
    const { t, calls } = await takenOver([ans("Печатная книга — подарок на всю жизнь 😊 Для кого она будет?")]);
    await client(t, "Сколько стоит печатная?");
    await client(t, "И сколько по времени?");
    await run(t, 10 * 60_000);
    expect(calls).toHaveLength(1);
    await t.bot.resume(t.conv().id, "u1");
    expect(calls).toHaveLength(2);
    // В новых сообщениях хода — только неотвеченные, уже отвеченное «хочу книгу маме» — история.
    const fresh = calls[1].user.split("\n").filter((l) => l.startsWith("▶ "));
    expect(fresh.join("\n")).toContain("Сколько стоит печатная?");
    expect(fresh.join("\n")).toContain("И сколько по времени?");
    expect(fresh.join("\n")).not.toContain("хочу книгу маме");
    expect(said(t).filter((x) => x.startsWith("Печатная книга"))).toHaveLength(1);
    expect(t.conv().botControl).toMatchObject({ mode: "active", by: "u1", reason: "resume" });
    // Повторное нажатие не дублирует ответ.
    await t.bot.resume(t.conv().id, "u1");
    await run(t);
    expect(said(t).filter((x) => x.startsWith("Печатная книга"))).toHaveLength(1);
  });

  it("возобновить без неотвеченных сообщений — бот ничего не пишет сам, ответит на следующее сообщение сразу (без ожидания менеджера)", async () => {
    const { t, calls } = await takenOver([ans("Доставка по Алматы — в день готовности 🙌")]);
    await t.bot.resume(t.conv().id, "u1");
    expect(calls).toHaveLength(1);
    await client(t, "А доставка есть?");
    await run(t);
    expect(said(t).at(-1)).toBe("Доставка по Алматы — в день готовности 🙌");
    // Менеджер снова ответил — опять перехват.
    await t.service.send(t.conv().id, "Уточню у коллег", "u1");
    expect(t.conv().botControl?.mode).toBe("human");
  });

  it("пауза: пока идёт — бот молчит; кончилась — отвечает на то, что клиент написал во время паузы", async () => {
    const { m, calls } = model([ans("Для кого будет книга?"), ans("Да, на казахском тоже можно 😊")]);
    const t = setup({ bot: "always", config: aiConfig(), seller: m });
    await client(t, "Здравствуйте, хочу книгу маме");
    await run(t);
    await t.bot.pause(t.conv().id, new Date(nowOf(t).getTime() + 60 * 60_000), "u1");
    expect((await status(t)).mode).toBe("AI_PAUSED");
    await client(t, "А на казахском можно?");
    await run(t, 30 * 60_000);
    expect(calls).toHaveLength(1);
    await run(t, 31 * 60_000);
    expect(calls).toHaveLength(2);
    expect(said(t).at(-1)).toBe("Да, на казахском тоже можно 😊");
    expect(t.conv().botControl ?? null).toBeNull();
  });

  it("отключить вручную: бот не отвечает ни днём, ни ночью; ответ менеджера не превращает это в перехват; возобновить — снова работает", async () => {
    const { m, calls } = model([ans("Для кого будет книга?"), ans("Да, конечно 😊")]);
    const t = setup({ bot: "always", config: aiConfig(), seller: m });
    await client(t, "Здравствуйте, хочу книгу маме");
    await run(t);
    await t.bot.disable(t.conv().id, "u1");
    expect(t.conv().botControl).toMatchObject({ mode: "disabled", by: "u1" });
    expect((await status(t)).mode).toBe("DISABLED");
    await t.service.send(t.conv().id, "Подскажу сам", "u1");
    expect(t.conv().botControl?.mode).toBe("disabled");
    t.settings.workTime = false;
    await client(t, "А можно на казахском?");
    await run(t, 60 * 60_000);
    expect(calls).toHaveLength(1);
    await t.bot.resume(t.conv().id, "u1");
    expect(calls).toHaveLength(2);
    expect(said(t).at(-1)).toBe("Да, конечно 😊");
  });

  it("статус в чате: AI включён → ждёт паузу перед ответом → менеджер ведёт диалог (кнопка «Возобновить AI»)", async () => {
    const { m } = model([ans("Для кого будет книга?")]);
    const t = setup({ bot: "always", config: aiConfig(), seller: m });
    await client(t, "Здравствуйте, хочу книгу маме");
    expect(await status(t)).toMatchObject({ mode: "WAITING_TO_REPLY", canStop: true });
    await run(t);
    expect((await status(t)).mode).toBe("AI_ACTIVE");
    await t.service.send(t.conv().id, "Подскажу сам", "u1");
    expect(await status(t)).toMatchObject({ mode: "HUMAN_TAKEOVER", canResume: true, label: expect.stringMatching(/Менеджер ведёт диалог/) });
  });
});
