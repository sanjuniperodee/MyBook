import { describe, expect, it } from "vitest";
import { Call, TelephonyError, type CallProps } from "@/modules/telephony/domain";
import { CallsService, WhatsappCallsService, type CallRepository, type LiveCallRepository, type SalesGateway, type WhatsappCallGateway } from "@/modules/telephony/application";
import { endedCallId } from "@/server/whatsapp-call-watcher";
import { whatsappCallError } from "@/server/whatsapp-calls";
import { GowaError } from "@/modules/messaging/infrastructure/gowa";

/** Звонки WhatsApp из CRM (WhatsappCallsService): журнал в памяти, шлюз — заглушка, часы двигаем вручную. */
function setup(opts: { answerFails?: boolean; openDeal?: string; duringAnswer?: () => Promise<unknown> } = {}) {
  let t = new Date("2026-10-22T06:00:00Z").getTime();
  const clock = { now: () => new Date(t) };
  const tick = (sec: number) => void (t += sec * 1000);
  const rows = new Map<string, CallProps & { id: string }>();
  const beats = new Map<string, Date>();
  const log: string[] = [];
  const restore = (r: CallProps & { id: string }) => Call.restore(r.id, { ...r });
  const repo: CallRepository & LiveCallRepository = {
    nextId: () => `c${rows.size + 1}`,
    findByExternal: async (p, ext) => {
      const r = [...rows.values()].find((x) => x.provider === p && x.externalId === ext);
      return r ? restore(r) : null;
    },
    findById: async (id) => (rows.has(id) ? restore(rows.get(id)!) : null),
    add: async (c) => !!rows.set(c.id, { ...c.snapshot() }),
    save: async (c) => void rows.set(c.id, { ...c.snapshot() }),
    update: async (c) => {
      if (rows.get(c.id)?.endedAt) return false;
      rows.set(c.id, { ...c.snapshot() });
      return true;
    },
    finish: async (c) => {
      if (rows.get(c.id)?.endedAt) return false;
      rows.set(c.id, { ...c.snapshot() });
      log.push(`finished:${c.id}:${c.snapshot().status}:${c.snapshot().durationSec}`);
      return true;
    },
    markMissedHandled: async () => {},
    markHandled: async () => {},
    claimAnswer: async (id, staffId, at) => {
      const r = rows.get(id);
      if (!r || r.status !== "ringing" || r.endedAt || r.answeredAt || (r.staffId && r.staffId !== staffId)) return false;
      r.staffId = staffId;
      beats.set(id, at);
      return true;
    },
    releaseClaim: async (id, staffId) => {
      const r = rows.get(id)!;
      if (r.staffId !== staffId || r.answeredAt || r.endedAt) return;
      r.staffId = null;
      beats.delete(id);
    },
    heartbeat: async (id, staffId, at) => {
      const r = rows.get(id);
      if (!r || r.endedAt || r.staffId !== staffId) return false;
      beats.set(id, at);
      return true;
    },
    stale: async (now, o) =>
      [...rows.values()]
        .filter(
          (r) =>
            !r.endedAt &&
            (r.answeredAt
              ? (beats.get(r.id) ?? r.answeredAt).getTime() < now.getTime() - o.silentMs
              : r.startedAt.getTime() < now.getTime() - o.ringMs && (beats.get(r.id) ?? r.startedAt).getTime() < now.getTime() - o.silentMs),
        )
        .map((r) => ({ call: restore(r), lastSeen: beats.get(r.id) ?? null })),
  };
  const sales: SalesGateway = {
    findClientByPhone: async () => null,
    findOpenDealId: async () => opts.openDeal ?? null,
    createCallDeal: async (i) => (log.push(`deal:${i.title}`), { id: "d1", clientId: null }),
    dealOwner: async () => ({ assigneeId: "m9", contactName: "" }),
    acceptDeal: async (dealId, staffId, how) => void log.push(`accept:${dealId}:${staffId}:${how}`),
  };
  const calls = new CallsService(
    repo,
    { byExtension: async () => null, byId: async () => ({ name: "Айгерим", email: "a@mybook.kz" }) },
    sales,
    { record: async (e) => void log.push(`note:${e.text}`) },
    { isBlocked: async () => false, notifyMissed: async (to, n) => void log.push(`notify:${to}:${n.title}`), callChanged: () => {}, missedRules: async () => {} },
    clock,
  );
  let enabled = true;
  const gateway: WhatsappCallGateway = {
    enabled: async () => enabled,
    start: async (phone) => (log.push(`gw:start:${phone}`), "WA1"),
    answer: async (id) => {
      log.push(`gw:answer:${id}`);
      await opts.duringAnswer?.();
      if (opts.answerFails) throw new TelephonyError("notFound", "Звонок уже завершён");
    },
    hangup: async (id) => void log.push(`gw:hangup:${id}`),
  };
  const service = new WhatsappCallsService(calls, repo, gateway, clock);
  const ring = (externalId = "IN1") => service.incoming({ provider: "whatsapp", externalId, stage: "start", direction: "in", clientPhone: "77011234567", extension: null, at: clock.now() });
  return { service, log, rows, tick, ring, disable: () => (enabled = false) };
}

describe("WhatsappCallsService: исходящий", () => {
  it("набрал → собеседник ответил → положил трубку: разговор с длительностью от ответа, заявка принята, запись в ленте", async () => {
    const { service, log, rows, tick } = setup({ openDeal: "d5" });
    const { id, callId } = await service.dial({ staffId: "m1", phone: "77011234567" });
    expect(callId).toBe("WA1");
    expect(rows.get(id)).toMatchObject({ provider: "whatsapp", direction: "out", status: "ringing", staffId: "m1" });
    tick(8);
    await service.connected(id, "m1");
    expect(rows.get(id)?.status).toBe("answered");
    tick(95);
    await service.hangup(id, "m1");
    expect(log).toEqual(["gw:start:77011234567", "gw:hangup:WA1", `finished:${id}:answered:95`, "accept:d5:m1:исходящий звонок клиенту"]);
    // Повторное «положить трубку» и конец от шлюза ничего не меняют.
    await service.hangup(id, "m1");
    await service.endedByGateway("WA1");
    expect(log.filter((l) => l.startsWith("finished"))).toHaveLength(1);
  });

  it("не взял трубку (шлюз сообщил о конце) — недозвон, а не пропущенный: без уведомлений", async () => {
    const { service, log } = setup();
    const { id } = await service.dial({ staffId: "m1", phone: "77011234567" });
    await service.endedByGateway("WA1");
    expect(log).toContain(`finished:${id}:failed:0`);
    expect(log.some((l) => l.startsWith("notify"))).toBe(false);
  });

  it("чужой сотрудник не может завершить или отметить чужой звонок; звонки выключены — набрать нельзя", async () => {
    const t = setup();
    const { id } = await t.service.dial({ staffId: "m1", phone: "77011234567" });
    await expect(t.service.hangup(id, "m2")).rejects.toThrow("Это звонок другого сотрудника");
    await expect(t.service.connected(id, "m2")).rejects.toThrow("Звонок не найден");
    expect(await t.service.heartbeat(id, "m2")).toBe(false);
    t.disable();
    await expect(t.service.dial({ staffId: "m1", phone: "77011234567" })).rejects.toThrow("Звонки WhatsApp выключены");
  });
});

describe("WhatsappCallsService: входящий", () => {
  it("звонит всем → первый ответивший забирает звонок, второму — отказ; разговор закрывается с длительностью", async () => {
    const { service, log, rows, tick, ring } = setup();
    const call = (await ring())!;
    expect(rows.get(call.id)).toMatchObject({ status: "ringing", staffId: null, direction: "in" });
    tick(5);
    expect(await service.answer(call.id, "m1")).toEqual({ callId: "IN1" });
    await expect(service.answer(call.id, "m2")).rejects.toThrow("На звонок уже ответил другой сотрудник");
    expect(rows.get(call.id)).toMatchObject({ status: "answered", staffId: "m1" });
    tick(42);
    await service.endedByGateway("IN1");
    expect(log).toEqual(["gw:answer:IN1", `finished:${call.id}:answered:42`, "deal:Звонок: …4567", "accept:d1:m1:входящий звонок принят"]);
  });

  it("звонящий успел положить трубку до ответа — звонок пропущенный, трубка в шлюзе, сотруднику понятная ошибка", async () => {
    const { service, log, rows, ring } = setup({ answerFails: true });
    const call = (await ring())!;
    await expect(service.answer(call.id, "m1")).rejects.toThrow("Звонок уже завершён");
    expect(rows.get(call.id)).toMatchObject({ status: "missed", answeredAt: null });
    expect(log).toContain("gw:hangup:IN1");
    expect(log).toContain(`finished:${call.id}:missed:0`);
    expect(log.some((l) => l.startsWith("notify:m9:Пропущенный звонок"))).toBe(true);
    await expect(service.answer(call.id, "m2")).rejects.toThrow("Звонок уже завершён");
  });

  it("шлюз сообщил о конце, пока ответ ещё в пути, — пропущенный, а не разговор 0:00; поздний «ответ» не оживляет звонок", async () => {
    const ref: { service?: WhatsappCallsService } = {};
    const t = setup({ answerFails: true, duringAnswer: () => ref.service!.endedByGateway("IN1") });
    const service = (ref.service = t.service);
    const call = (await t.ring())!;
    await expect(service.answer(call.id, "m1")).rejects.toThrow();
    expect(t.rows.get(call.id)).toMatchObject({ status: "missed", answeredAt: null });
    expect(t.log.filter((l) => l.startsWith("finished"))).toEqual([`finished:${call.id}:missed:0`]);
    expect(t.log.some((l) => l.startsWith("accept"))).toBe(false);
  });

  it("звонок завершился сразу после ответа шлюза — отметка ответа его не трогает", async () => {
    const ref: { service?: WhatsappCallsService } = {};
    const t = setup({ duringAnswer: () => ref.service!.endedByGateway("IN1") });
    const service = (ref.service = t.service);
    const call = (await t.ring())!;
    await service.answer(call.id, "m1");
    expect(t.rows.get(call.id)).toMatchObject({ status: "missed" });
    expect(t.rows.get(call.id)?.endedAt).toBeTruthy();
    expect(t.log.filter((l) => l.startsWith("finished"))).toHaveLength(1);
  });

  it("отклонить звонящий входящий может любой сотрудник: трубка в шлюзе, звонок пропущенный", async () => {
    const { service, log, ring } = setup();
    const call = (await ring())!;
    await service.hangup(call.id, "m3");
    expect(log.slice(0, 2)).toEqual(["gw:hangup:IN1", `finished:${call.id}:missed:0`]);
  });
});

describe("WhatsappCallsService: зависшие звонки (планировщик)", () => {
  it("исходящий: отметка «собеседник ответил» потерялась — её доносит отметка «на связи» с разговором; живая вкладка не даёт оборвать звонок", async () => {
    const { service, rows, tick } = setup();
    const { id } = await service.dial({ staffId: "m1", phone: "77011234567" });
    for (let i = 0; i < 6; i++) {
      tick(15);
      await service.heartbeat(id, "m1");
    }
    // 90 с без ответа, но вкладка на связи — планировщик звонок не трогает (гудки ограничивает сама вкладка).
    expect(await service.sweep()).toBe(0);
    tick(15);
    await service.heartbeat(id, "m1", true);
    expect(rows.get(id)).toMatchObject({ status: "answered" });
    expect(await service.sweep()).toBe(0);
  });

  it("никто не ответил за полторы минуты — пропущенный; разговор без вкладки — закрыт по последнему признаку жизни, трубка в шлюзе", async () => {
    const { service, log, tick, ring } = setup();
    const lost = (await ring("IN1"))!;
    const talk = (await ring("IN2"))!;
    await service.answer(talk.id, "m1");
    for (let i = 0; i < 2; i++) {
      tick(40);
      expect(await service.heartbeat(talk.id, "m1")).toBe(true);
    }
    tick(15);
    expect(await service.sweep()).toBe(1);
    expect(log).toContain(`finished:${lost.id}:missed:0`);
    tick(50);
    // Вкладка молчит больше 45 с — разговор закрыт: 80 с до последнего признака жизни.
    expect(await service.sweep()).toBe(1);
    expect(log).toContain("gw:hangup:IN2");
    expect(log).toContain(`finished:${talk.id}:answered:80`);
    expect(await service.heartbeat(talk.id, "m1")).toBe(false);
    expect(await service.sweep()).toBe(0);
  });

  it("пропуск к аудиопотоку: идущий звонок и его сотрудник; завершённый — нет", async () => {
    const { service } = setup();
    const { id } = await service.dial({ staffId: "m1", phone: "77011234567" });
    expect(await service.liveCall("WA1")).toEqual({ id, staffId: "m1" });
    await service.hangup(id, "m1");
    expect(await service.liveCall("WA1")).toBeNull();
    expect(await service.liveCall("NOPE")).toBeNull();
  });
});

describe("Звонки WhatsApp: сообщения шлюза", () => {
  it("служебный сокет: CALL_ENDED → id звонка, остальное — мимо", () => {
    expect(endedCallId(JSON.stringify({ code: "CALL_ENDED", message: "Incoming call", result: { event: "ended", call_id: "3A5F00", device_id: "mybooks" } }))).toBe("3A5F00");
    expect(endedCallId(JSON.stringify({ code: "CALL_INCOMING", result: { call_id: "3A5F00" } }))).toBeNull();
    expect(endedCallId(JSON.stringify({ code: "CALL_ENDED", result: { call_id: "a b" } }))).toBeNull();
    expect(endedCallId("не json")).toBeNull();
  });

  it("ошибки шлюза — по-русски", () => {
    const text = (e: GowaError) => whatsappCallError(e).message;
    expect(text(new GowaError("WhatsApp: your WhatsApp CLI is invalid or empty", "INVALID_WA_CLI", 500))).toMatch(/не привязан/);
    expect(text(new GowaError("WhatsApp: Cannot POST /call/start", null, 404))).toMatch(/не умеет звонки/);
    expect(text(new GowaError("Шлюз WhatsApp (GOWA) недоступен", "UNREACHABLE"))).toMatch(/недоступен/);
    expect(text(new GowaError('WhatsApp: call not found: "X"', null, 500))).toBe("Звонок уже завершён");
    expect(text(new GowaError("WhatsApp: failed to place call: timeout", null, 500))).toBe("Звонок WhatsApp не удался: failed to place call: timeout");
    expect(() => whatsappCallError(new Error("boom"))).toThrow("boom");
  });
});
