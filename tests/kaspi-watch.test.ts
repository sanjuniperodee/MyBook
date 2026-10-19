import { describe, expect, it } from "vitest";
import { kaspiWatchFromJson, kaspiWatchStep, kaspiWatchToJson, OrderingError, type KaspiProbe, type KaspiWatchSignal, type KaspiWatchState } from "@/modules/ordering/domain";
import { KaspiWatchService, type KaspiWatchSettingKey } from "@/modules/ordering/application/KaspiWatchService";
import type { KaspiConfigStore, KaspiSession } from "@/modules/ordering/application/ports";
import { MemSettings, SpyStaffNotifier } from "./doubles/workspace";
import { storeTimeZoneIs } from "./doubles/time";

// Сигнал «кассир Kaspi отключён» (план P0-2, chats-23): детектор переходов и проверка в проходе планировщика.

storeTimeZoneIs("Asia/Almaty");

const MIN = 60_000;
const start = new Date("2026-10-19T09:00:00Z"); // 14:00 по Алматы
const down: KaspiProbe = { ok: false, reason: "rejected" };
const up: KaspiProbe = { ok: true };

/** Прогон детектора по проверкам раз в stepMin минут: сигналы с минутой, на которой они случились. */
function run(probes: KaspiProbe[], stepMin: number, alertAfterMin: number) {
  let state: KaspiWatchState | null = null;
  const signals: { at: number; signal: KaspiWatchSignal }[] = [];
  probes.forEach((probe, i) => {
    const r = kaspiWatchStep(state, probe, new Date(start.getTime() + i * stepMin * MIN), alertAfterMin * MIN);
    state = r.next;
    if (r.signal) signals.push({ at: i * stepMin, signal: r.signal });
  });
  return { state: state as KaspiWatchState | null, signals };
}

describe("Kaspi: детектор переходов", () => {
  it("сбой на два часа — одна тревога после порога, а не каждые 15 минут; восстановление — один «снова подключён»", () => {
    const outage = Array.from({ length: 40 }, () => down); // 40 проверок раз в 3 минуты = 2 часа
    const { signals, state } = run([up, ...outage, up, up, up], 3, 5);
    expect(signals).toEqual([
      { at: 9, signal: "down" }, // первая неудачная — на 3-й минуте, порог 5 минут — тревога на третьей проверке подряд
      { at: 123, signal: "up" },
    ]);
    expect(state).toMatchObject({ ok: true, reason: null, alerted: false });
  });

  it("сбой короче порога (перезапуск kaspi-pos) — ни тревоги, ни «снова подключён»", () => {
    expect(run([up, down, up, down, up], 3, 5).signals).toEqual([]);
  });

  it("порог 0 — тревога на первой неудачной проверке; первая проверка после включения без сбоя молчит", () => {
    expect(run([down, down, up], 3, 0).signals).toEqual([
      { at: 0, signal: "down" },
      { at: 6, signal: "up" },
    ]);
    expect(run([up, up], 3, 0).signals).toEqual([]);
  });

  it("причина сменилась посреди сбоя — новой тревоги нет, причина и начало сбоя помнятся", () => {
    let r = kaspiWatchStep(null, down, start, 0);
    expect(r.signal).toBe("down");
    r = kaspiWatchStep(r.next, { ok: false, reason: "unreachable" }, new Date(start.getTime() + 3 * MIN), 0);
    expect(r.signal).toBeNull();
    expect(r.next).toEqual({ ok: false, since: start, reason: "unreachable", alerted: true });
  });

  it("состояние переживает перезапуск (JSON в настройках); испорченное — как будто проверок не было", () => {
    const s: KaspiWatchState = { ok: false, since: start, reason: "rejected", alerted: true };
    expect(kaspiWatchFromJson(kaspiWatchToJson(s))).toEqual(s);
    expect(kaspiWatchFromJson("")).toBeNull();
    expect(kaspiWatchFromJson("{не json")).toBeNull();
    expect(kaspiWatchFromJson(JSON.stringify({ ok: "да", since: start.toISOString() }))).toBeNull();
    expect(kaspiWatchFromJson(JSON.stringify({ ok: false, since: start.toISOString(), reason: "что-то", alerted: true }))).toMatchObject({ reason: "unreachable", alerted: true });
  });
});

const session: KaspiSession = { tokenSn: "TSN", vtokenSecret: "VSEC", profileId: 1, organizationId: 2, orgName: "ИП Тест", phone: "77010000000" };

function harness(opts: { enabled?: boolean; shared?: boolean; session?: KaspiSession | null; alertAfter?: string } = {}) {
  const cfg = { enabled: opts.enabled ?? true, apiUrl: "http://kaspi-pos:3000", session: opts.session === undefined ? session : opts.session, shared: opts.shared ?? false };
  const config: Pick<KaspiConfigStore, "config"> = { config: async () => cfg };
  /** kaspi-pos /api/session/check: true — сессия принята, false — нет, ошибка — бросить её. */
  const kaspi = {
    answer: true as boolean | Error,
    calls: 0,
    async sessionActive() {
      this.calls++;
      if (this.answer instanceof Error) throw this.answer;
      return this.answer;
    },
  };
  const settings = new MemSettings<KaspiWatchSettingKey>(opts.alertAfter === undefined ? {} : { "kaspi.alertAfterMinutes": opts.alertAfter });
  const notifier = new SpyStaffNotifier({ "settings.manage": ["owner-1", "admin-2"] });
  let now = start;
  const clock = { now: () => now, set: (d: Date) => void (now = d) };
  const make = () => new KaspiWatchService(config, kaspi, settings, notifier, clock);
  const h = {
    cfg,
    kaspi,
    clock,
    settings,
    notifier,
    service: make(),
    /** Перезапуск процесса: новый сервис на тех же настройках. */
    restart: () => (h.service = make()),
    /** Проход планировщика раз в минуту, minutes раз. */
    async tick(minutes = 1) {
      const signals: KaspiWatchSignal[] = [];
      for (let i = 0; i < minutes; i++) {
        const s = await h.service.check();
        if (s) signals.push(s);
        now = new Date(now.getTime() + MIN);
      }
      return signals;
    },
  };
  return h;
}

describe("Kaspi: тревога руководителям из прохода планировщика", () => {
  it("сессию вытеснили на 3 часа: Kaspi спрашиваем раз в 3 минуты, тревога одна — в CRM и push руководителям; потом «снова подключён»", async () => {
    const h = harness();
    expect(await h.tick(10)).toEqual([]);
    h.kaspi.answer = false;
    h.kaspi.calls = 0;
    expect(await h.tick(180)).toEqual(["down"]);
    expect(h.kaspi.calls).toBe(60);
    expect(h.notifier.sent).toHaveLength(1);
    expect(h.notifier.sent[0].to).toEqual(["owner-1", "admin-2"]);
    expect(h.notifier.sent[0].n).toMatchObject({ kind: "system", title: "Кассир Kaspi отключён", link: "/admin/settings?tab=payments" });
    expect(h.notifier.sent[0].n.body).toContain("Kaspi не принимает сессию кассира");
    expect(h.notifier.sent[0].n.body).toContain("Подключите кассира заново");
    h.kaspi.answer = true;
    expect(await h.tick(30)).toEqual(["up"]);
    expect(h.notifier.sent).toHaveLength(2);
    expect(h.notifier.sent[1].n).toMatchObject({ kind: "system", title: "Кассир Kaspi снова подключён" });
    expect(h.notifier.sent[1].n.body).toMatch(/не работал 3 ч( \d+ мин)? \(с 14:1\d\)/);
    // В базу пишем только смену состояния: первая проверка, начало сбоя, тревога, восстановление — не каждую проверку.
    expect(h.settings.saves).toHaveLength(4);
  });

  it("плашка менеджеру — только после тревоги и пока кассир отключён; время — по часам магазина", async () => {
    const h = harness({ alertAfter: "0" });
    expect(await h.service.warning()).toBeNull();
    h.kaspi.answer = false;
    await h.tick();
    expect(await h.service.warning()).toBe("Кассир Kaspi отключён с 14:00 — оплаты Kaspi не подтверждаются сами, счёт Kaspi на номер клиента не выставится. Руководителям сообщили; оплату через Kaspi пока проверяйте вручную.");
    h.kaspi.answer = true;
    await h.tick(3);
    expect(await h.service.warning()).toBeNull();
  });

  it("сбой короче порога — никого не беспокоим и плашку не показываем", async () => {
    const h = harness();
    h.kaspi.answer = false;
    await h.tick(4); // проверки на 0-й и 3-й минуте: 3 минуты подряд — меньше порога 5
    expect(await h.service.warning()).toBeNull();
    h.kaspi.answer = true;
    await h.tick(3);
    expect(h.notifier.sent).toEqual([]);
  });

  it("проход планировщика через три минуты начался на долю секунды раньше — Kaspi всё равно спрашиваем, а не через четыре минуты", async () => {
    const h = harness();
    await h.service.check();
    expect(h.kaspi.calls).toBe(1);
    // Следующие проходы: через 59,99 с, 2 мин и 2 мин 59,99 с после первой проверки (шаги до «kaspi watch» шли чуть быстрее).
    for (const ms of [59_990, 120_000, 179_990]) {
      h.clock.set(new Date(start.getTime() + ms));
      await h.service.check();
    }
    expect(h.kaspi.calls).toBe(2);
  });

  it("перезапуск процесса посреди сбоя не повторяет тревогу; восстановление после перезапуска — «снова подключён»", async () => {
    const h = harness({ alertAfter: "0" });
    h.kaspi.answer = false;
    expect(await h.tick(5)).toEqual(["down"]);
    h.restart();
    expect(await h.tick(10)).toEqual([]);
    h.kaspi.answer = true;
    h.restart();
    expect(await h.tick()).toEqual(["up"]);
    expect(h.notifier.sent.map((s) => s.n.title)).toEqual(["Кассир Kaspi отключён", "Кассир Kaspi снова подключён"]);
  });

  it("причины: 401 от kaspi-pos — сессию не приняли; сеть — kaspi-pos не отвечает; нет сессии — без запроса к Kaspi", async () => {
    const rejected = harness({ alertAfter: "0" });
    rejected.kaspi.answer = new OrderingError("kaspiNotConnected");
    await rejected.tick();
    expect(rejected.notifier.sent[0].n.body).toContain("Kaspi не принимает сессию кассира");

    const unreachable = harness({ alertAfter: "0" });
    unreachable.kaspi.answer = new OrderingError("kaspiUnavailable", "kaspi-pos недоступен: fetch failed");
    await unreachable.tick();
    expect(unreachable.notifier.sent[0].n.body).toContain("Сервис kaspi-pos не отвечает или Kaspi ответил ошибкой");
    expect(unreachable.notifier.sent[0].n.body).toContain("Проверьте, что kaspi-pos запущен");
    expect(unreachable.notifier.sent[0].n.body).toContain("возможно, сбой у самого Kaspi");

    const none = harness({ alertAfter: "0", session: null });
    await none.tick();
    expect(none.kaspi.calls).toBe(0);
    expect(none.notifier.sent[0].n.body).toContain("Нет сессии кассира");
  });

  it("общая сессия с другим проектом: подсказка — войти там и обновить ключи на сервере, а не вход по SMS здесь", async () => {
    const h = harness({ alertAfter: "0", shared: true });
    h.kaspi.answer = false;
    await h.tick();
    expect(h.notifier.sent[0].n.body).toContain("обновите KASPI_TOKEN_SN, KASPI_VTOKEN_SECRET и KASPI_PROFILE_ID");
    // Сайт читает .env только при запуске (node --env-file): без перезапуска новые ключи не подействуют.
    expect(h.notifier.sent[0].n.body).toContain("перезапустите сайт (pm2 restart mybook)");
    expect(h.notifier.sent[0].n.body).not.toContain("Подключите кассира заново");
  });

  it("оплата через Kaspi выключена — Kaspi не спрашиваем, прежняя тревога снимается молча", async () => {
    const h = harness({ alertAfter: "0" });
    h.kaspi.answer = false;
    await h.tick();
    expect(await h.service.warning()).not.toBeNull();
    h.cfg.enabled = false;
    h.kaspi.calls = 0;
    expect(await h.tick(30)).toEqual([]);
    expect(h.kaspi.calls).toBe(0);
    expect(h.settings.values.has("kaspi.watch")).toBe(false);
    expect(await h.service.warning()).toBeNull();
    expect(h.notifier.sent).toHaveLength(1);
  });

  it("уведомление не записалось — тревога повторится в следующей проверке, а не потеряется", async () => {
    const h = harness({ alertAfter: "0" });
    h.kaspi.answer = false;
    const notify = h.notifier.notifyAllWith.bind(h.notifier);
    h.notifier.notifyAllWith = async () => {
      throw new Error("база недоступна");
    };
    await expect(h.service.check()).rejects.toThrow("база недоступна");
    expect(await h.service.warning()).toBeNull();
    h.notifier.notifyAllWith = notify;
    expect(await h.tick(4)).toEqual(["down"]);
    expect(h.notifier.sent).toHaveLength(1);
  });

  it("порог тревоги настраивается: целые минуты 0…240, испорченное значение — 5 минут", async () => {
    const h = harness({ alertAfter: "abc" });
    expect(await h.service.alertAfterMinutes()).toBe(5);
    await h.service.setAlertAfterMinutes(15, "staff-1");
    expect(await h.service.alertAfterMinutes()).toBe(15);
    expect(h.settings.saves.at(-1)).toEqual({ values: { "kaspi.alertAfterMinutes": "15" }, actorId: "staff-1" });
    await expect(h.service.setAlertAfterMinutes(-1, "staff-1")).rejects.toThrow();
    await expect(h.service.setAlertAfterMinutes(1.5, "staff-1")).rejects.toThrow();
    await expect(h.service.setAlertAfterMinutes(241, "staff-1")).rejects.toThrow();
    // Порог 15 минут: проверки раз в 3 минуты — тревога на шестой неудачной подряд (15-я минута сбоя).
    h.kaspi.answer = false;
    expect(await h.tick(15)).toEqual([]);
    expect(await h.tick(1)).toEqual(["down"]);
  });
});
