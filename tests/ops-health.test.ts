import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { OPS_JOBS, OPS_STREAMS, OPS_THRESHOLDS, isOpsJob, opsAge, opsStaleAfter, worstLevel } from "@/shared/domain/opsHealth";
import { alertStep, evaluate, evaluateJob, staleness, type OpsFacts, type PulseRow } from "@/modules/monitoring/domain/health";
import { PulseRecorder } from "@/modules/monitoring/application/PulseRecorder";
import { OpsAlertsService, OpsHealthService, cashierFromJson } from "@/modules/monitoring/application/OpsHealthService";
import type { OpsAlertStore, OpsFactsReader, PulseRecord, PulseStore } from "@/modules/monitoring/application/ports";

const NOW = new Date("2026-11-27T10:00:00Z");
const ago = (sec: number) => new Date(NOW.getTime() - sec * 1000);

const pulse = (job: string, extra: Partial<PulseRow> = {}): PulseRow => ({
  job,
  everySec: null,
  startedAt: ago(10),
  finishedAt: ago(9),
  outcome: "ok",
  durationMs: 1000,
  okAt: ago(9),
  error: null,
  errorAt: null,
  fails: 0,
  runs: 10,
  failures: 0,
  note: null,
  ...extra,
});

/** Все задания прошли только что — фон в норме. */
const fresh = () => (Object.keys(OPS_JOBS) as (keyof typeof OPS_JOBS)[]).map((j) => pulse(j));

const facts = (over: Partial<OpsFacts> = {}): OpsFacts => ({
  pulses: fresh(),
  outbox: { pending: 0, dueOldestAt: null, retrying: 0, retryError: null, dead: 0, deadLastAt: null, deadLastType: null, deadLastError: null, deliveredHour: 12 },
  messages: { errorsHour: 0, errorsDay: 0, lastErrorAt: null, lastError: null, pendingStuck: 0 },
  voices: { waiting: 0, oldestAt: null },
  media: { queued: 0, oldestAt: null, failedDay: 0, lastFailedError: null },
  mail: { sentDay: 3, lastSentAt: ago(600), autoOn: true },
  cashier: { ok: true, since: ago(86_400), reason: null, alerted: false },
  ...over,
});

const stream = (f: OpsFacts, key: string) => evaluate(f, NOW).streams.find((s) => s.key === key)!;

describe("opsHealth: словарь и пороги", () => {
  it("каждое задание — в известном потоке, у шага — проход с тем же интервалом", () => {
    for (const [key, def] of Object.entries(OPS_JOBS)) {
      expect(OPS_STREAMS, key).toContain(def.stream);
      if ("pass" in def) expect(def.every, key).toBe(OPS_JOBS[def.pass].every);
    }
  });

  it("все шаги и проходы планировщика есть в словаре (имена — как в scheduler.ts)", () => {
    const src = readFileSync(path.join(__dirname, "../src/server/scheduler.ts"), "utf8");
    const steps = [...src.matchAll(/step\(p, "([^"]+)"/g)].map((m) => m[1]);
    const passes = [...src.matchAll(/pulse\("([^"]+)"\)/g)].map((m) => m[1]);
    expect(steps.length).toBeGreaterThan(30);
    expect(steps.filter((s) => !isOpsJob(s))).toEqual([]);
    expect(passes.filter((s) => !isOpsJob(s))).toEqual([]);
    // Шаг медленного прохода помечен медленным, минутного — минутным.
    const slowBody = src.slice(src.indexOf("export async function tick()"), src.indexOf("export async function crmTick()"));
    for (const s of steps) expect(OPS_JOBS[s as keyof typeof OPS_JOBS], s).toMatchObject({ pass: slowBody.includes(`"${s}"`) ? "scheduler.slow" : "scheduler.crm" });
  });

  it("«давно не было прохода»: выкатка (2 минуты) у минутного прохода — внимание, не сбой", () => {
    expect(opsStaleAfter(60)).toEqual({ warn: 120, down: 300 });
    expect(opsStaleAfter(5)).toEqual({ warn: 65, down: 185 });
    expect(opsStaleAfter(900)).toEqual({ warn: 1800, down: 4500 });
    expect(staleness({ every: 60 }, pulse("scheduler.crm", { startedAt: ago(130), finishedAt: ago(125) }), NOW).level).toBe("warn");
    expect(staleness({ every: 60 }, pulse("scheduler.crm", { startedAt: ago(301), finishedAt: ago(301) }), NOW).level).toBe("down");
    // Долгий проход, начатый только что, — не «давно не было».
    expect(staleness({ every: 60 }, pulse("scheduler.crm", { startedAt: ago(5), finishedAt: ago(400) }), NOW).level).toBe("ok");
    expect(staleness({ every: null }, undefined, NOW).level).toBe("ok");
  });

  it("худший уровень и длительности", () => {
    expect(worstLevel(["ok", "off", "warn"])).toBe("warn");
    expect(worstLevel(["off", "down", "warn"])).toBe("down");
    expect(worstLevel([])).toBe("ok");
    expect([opsAge(40), opsAge(420), opsAge(7500), opsAge(3 * 86_400)]).toEqual(["40 с", "7 мин", "2 ч 5 мин", "3 дн"]);
  });
});

describe("оценка заданий", () => {
  it("ошибка — внимание, три подряд — сбой; давняя ошибка при удачном проходе не тревожит", () => {
    expect(evaluateJob("ai stages", pulse("ai stages", { fails: 1, error: "timeout" }), NOW).view.level).toBe("warn");
    const three = evaluateJob("ai stages", pulse("ai stages", { fails: 3, error: "timeout" }), NOW);
    expect(three.view.level).toBe("down");
    expect(three.signals[0]).toMatchObject({ level: "down", alert: true });
    expect(three.signals[0].text).toContain("timeout");
    expect(evaluateJob("ai stages", pulse("ai stages", { error: "old", errorAt: ago(1800) }), NOW).view.level).toBe("warn");
    expect(evaluateJob("ai stages", pulse("ai stages", { error: "old", errorAt: ago(7200) }), NOW).view.level).toBe("ok");
  });

  it("Kaspi не подключён — выключено; идёт ли проход", () => {
    expect(evaluateJob("kaspi.fast", pulse("kaspi.fast", { outcome: "off" }), NOW).view.level).toBe("off");
    expect(evaluateJob("scheduler.slow", pulse("scheduler.slow", { startedAt: ago(3), finishedAt: ago(900) }), NOW).view.running).toBe(true);
  });

  it("проход планировщика, которого ещё не было, — внимание; сборка по событию — в норме", () => {
    expect(evaluateJob("scheduler.crm", undefined, NOW).view.level).toBe("warn");
    expect(evaluateJob("print.warmup", undefined, NOW).view.level).toBe("ok");
  });
});

describe("оценка потоков", () => {
  it("всё прошло только что — всё в норме", () => {
    const s = evaluate(facts(), NOW);
    expect(s.level).toBe("ok");
    expect(s.refreshSec).toBe(OPS_THRESHOLDS.refreshSec);
    expect(s.streams.map((x) => x.key)).toEqual([...OPS_STREAMS]);
    expect(s.streams.every((x) => x.level === "ok" && !x.signals.length)).toBe(true);
  });

  it("воркер остановлен: «Планировщик» в сбое с тревогой, у шагов в других потоках — без повторной тревоги", () => {
    const pulses = fresh().map((p) => ({ ...p, startedAt: ago(3600), finishedAt: ago(3600) }));
    const s = evaluate(facts({ pulses }), NOW);
    const worker = s.streams.find((x) => x.key === "worker")!;
    expect(worker.level).toBe("down");
    expect(worker.signals.some((x) => x.alert && x.level === "down")).toBe(true);
    const ai = s.streams.find((x) => x.key === "ai")!;
    expect(ai.level).toBe("down");
    expect(ai.signals.every((x) => !x.alert)).toBe(true);
    // По одной строке на стоящий проход (у ИИ шаги и медленного, и минутного).
    expect(ai.signals).toHaveLength(2);
  });

  it("outbox: событие ждёт 6 минут — сбой; в разборе за час — сбой, давнее — внимание", () => {
    expect(stream(facts({ outbox: { ...facts().outbox, pending: 4, dueOldestAt: ago(360) } }), "outbox").level).toBe("down");
    expect(stream(facts({ outbox: { ...facts().outbox, pending: 4, dueOldestAt: ago(90) } }), "outbox").level).toBe("warn");
    const dead = stream(facts({ outbox: { ...facts().outbox, dead: 2, deadLastAt: ago(600), deadLastType: "ordering.order_paid", deadLastError: "mail: smtp down" } }), "outbox");
    expect(dead.level).toBe("down");
    expect(dead.signals[0].text).toContain("ordering.order_paid: mail: smtp down");
    expect(stream(facts({ outbox: { ...facts().outbox, dead: 2, deadLastAt: ago(7200) } }), "outbox").level).toBe("warn");
  });

  it("Kaspi: кассир отключён — сбой без своей тревоги (у кассира своё уведомление)", () => {
    const k = stream(facts({ cashier: { ok: false, since: ago(900), reason: "rejected", alerted: true } }), "kaspi");
    expect(k.level).toBe("down");
    expect(k.signals.every((x) => !x.alert)).toBe(true);
    expect(k.metrics.find((m) => m.key === "kaspiCashier")).toMatchObject({ value: "не работает", level: "down" });
  });

  it("WhatsApp: 5 ошибок отправки за час — сбой; висящие «отправляется» — внимание", () => {
    expect(stream(facts({ messages: { errorsHour: 5, errorsDay: 9, lastErrorAt: ago(60), lastError: "gateway 502", pendingStuck: 0 } }), "whatsapp").level).toBe("down");
    expect(stream(facts({ messages: { errorsHour: 0, errorsDay: 0, lastErrorAt: null, lastError: null, pendingStuck: 1 } }), "whatsapp").level).toBe("warn");
  });

  it("ИИ: голосовое ждёт 40 минут — сбой; расшифровка выключена — цифр голосовых нет", () => {
    expect(stream(facts({ voices: { waiting: 3, oldestAt: ago(2400) } }), "ai").level).toBe("down");
    expect(stream(facts({ voices: null }), "ai").metrics).toEqual([]);
  });

  it("видео: в очереди 15 минут — внимание; не обработано за сутки — внимание без тревоги", () => {
    expect(stream(facts({ media: { queued: 1, oldestAt: ago(900), failedDay: 0, lastFailedError: null } }), "media").level).toBe("warn");
    const failed = stream(facts({ media: { queued: 0, oldestAt: null, failedDay: 1, lastFailedError: "probe" } }), "media");
    expect(failed.level).toBe("warn");
    expect(failed.signals[0].alert).toBe(false);
  });

  it("письма: автописьма выключены — пояснение, не тревога", () => {
    const m = stream(facts({ mail: { sentDay: 0, lastSentAt: null, autoOn: false } }), "mail");
    expect(m.level).toBe("ok");
    expect(m.notes).toHaveLength(1);
  });

  it("последние ошибки потока — новые сверху", () => {
    const pulses = fresh().map((p) =>
      p.job === "ai stages" ? { ...p, error: "first", errorAt: ago(7200) } : p.job === "ai transcribe" ? { ...p, error: "second", errorAt: ago(7000) } : p,
    );
    expect(stream(facts({ pulses }), "ai").errors.map((e) => e.text)).toEqual(["second", "first"]);
  });
});

describe("оповещение руководителей", () => {
  it("сбой дольше 10 минут — сообщить; повтор не чаще раза в час; норма после сообщения — «снова в норме»", () => {
    const t = (min: number) => new Date(NOW.getTime() + min * 60_000);
    let s = alertStep(null, true, t(0));
    expect(s.send).toBeNull();
    s = alertStep(s.next, true, t(9));
    expect(s.send).toBeNull();
    s = alertStep(s.next, true, t(10));
    expect(s.send).toBe("down");
    s = alertStep(s.next, true, t(40));
    expect(s.send).toBeNull();
    s = alertStep(s.next, true, t(70));
    expect(s.send).toBe("down");
    s = alertStep(s.next, false, t(71));
    expect(s).toEqual({ next: { downSince: null, notifiedAt: null }, send: "up" });
    // Короткий сбой без сообщения — тишина и при восстановлении.
    expect(alertStep({ downSince: t(0), notifiedAt: null }, false, t(5)).send).toBeNull();
  });

  it("OpsAlertsService: сообщает руководителям о потоке в сбое один раз и пишет состояние", async () => {
    const pulses = fresh().map((p) => (p.job === "outbox" ? { ...p, startedAt: ago(600), finishedAt: ago(600) } : p));
    const reader: OpsFactsReader = {
      facts: async () => {
        const f = facts();
        return { outbox: f.outbox, messages: f.messages, voices: f.voices, media: f.media, mail: { sentDay: f.mail.sentDay, lastSentAt: f.mail.lastSentAt } };
      },
    };
    const pulseStore: PulseStore = { start: async () => {}, finish: async () => {}, all: async () => pulses };
    const settings = { get: async () => "", getMany: async () => ({ "crm.aiTranscribe": "on", "notify.auto": "on", "kaspi.watch": "" }) } as never;
    let now = NOW;
    const clock = { now: () => now };
    const state = new Map<string, { downSince: Date | null; notifiedAt: Date | null }>();
    const store: OpsAlertStore = { all: async () => new Map(state), save: async (k, v) => void state.set(k, v) };
    const notifyAllWith = vi.fn(async () => {});
    const notifier = { notify: vi.fn(), notifyOwnerOr: vi.fn(), notifyAllWith };
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const alerts = new OpsAlertsService(new OpsHealthService(pulseStore, reader, settings, clock), store, notifier, clock, logger);

    expect(await alerts.run()).toBe(0);
    expect(state.get("outbox")?.downSince).toEqual(NOW);
    now = new Date(NOW.getTime() + 11 * 60_000);
    expect(await alerts.run()).toBe(1);
    expect(notifyAllWith).toHaveBeenCalledWith("settings.manage", expect.objectContaining({ kind: "system", link: "/admin/system", title: "Сбой фона: Очередь событий" }));
    now = new Date(NOW.getTime() + 20 * 60_000);
    expect(await alerts.run()).toBe(0);
    expect(notifyAllWith).toHaveBeenCalledTimes(1);
    expect(state.get("outbox")?.notifiedAt).toEqual(new Date(NOW.getTime() + 11 * 60_000));
  });

  it("состояние кассира из настройки kaspi.watch", () => {
    expect(cashierFromJson('{"ok":false,"since":"2026-11-27T09:00:00.000Z","reason":"rejected","alerted":true}')).toEqual({ ok: false, since: new Date("2026-11-27T09:00:00.000Z"), reason: "rejected", alerted: true });
    expect(cashierFromJson("")).toBeNull();
    expect(cashierFromJson("{bad")).toBeNull();
  });
});

describe("пульс заданий", () => {
  const setup = () => {
    const written: PulseRecord[][] = [];
    const started: string[] = [];
    const store: PulseStore = { start: async (job) => void started.push(job), finish: async (r) => void written.push(r), all: async () => [] };
    let t = NOW.getTime();
    const clock = { now: () => new Date((t += 1000)) };
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    return { written, started, recorder: new PulseRecorder(store, clock, logger), logger, store };
  };

  it("проход: шаги с ошибкой не обрывают проход, всё пишется одним запросом", async () => {
    const { written, started, recorder } = setup();
    const p = recorder.pass("scheduler.crm");
    await p.begin();
    const onError = vi.fn();
    expect(await p.step("crm automations", async () => 3, 0, onError)).toBe(3);
    expect(await p.step("ai stages", async () => { throw new Error("model\n timeout"); }, null, onError)).toBeNull();
    await p.done();
    expect(started).toEqual(["scheduler.crm"]);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(written).toHaveLength(1);
    expect(written[0].map((r) => [r.job, r.outcome, r.error, r.everySec])).toEqual([
      ["scheduler.crm", "ok", null, 60],
      ["crm automations", "ok", null, 60],
      ["ai stages", "error", "model timeout", 60],
    ]);
  });

  it("выключено и ошибка прохода; сборка по событию с итогом «не собралось»", async () => {
    const { written, recorder } = setup();
    await recorder.pass("kaspi.fast").off().done();
    await recorder.pass("outbox").fail(new Error("db down")).done();
    const r = await recorder.track("print.warmup", async () => ({ status: "failed" }), (x) => (x.status === "failed" ? "Заказ №7" : null));
    expect(r).toEqual({ status: "failed" });
    await expect(recorder.track("print.warmup", async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    expect(written.map((w) => [w[0].job, w[0].outcome, w[0].error])).toEqual([
      ["kaspi.fast", "off", null],
      ["outbox", "error", "db down"],
      ["print.warmup", "error", "Заказ №7"],
      ["print.warmup", "error", "boom"],
    ]);
  });

  it("сбой записи пульса — только в лог", async () => {
    const { recorder, logger, store } = setup();
    store.finish = async () => {
      throw new Error("no table");
    };
    await expect(recorder.pass("outbox").done()).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalled();
  });
});
