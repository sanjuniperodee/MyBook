import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Фоновые проходы (src/server/scheduler.ts): ошибка одного шага не обрывает проход — следующие шаги выполняются,
 * в логе имя упавшего шага. База и контейнер — заглушки: проверяем порядок и изоляцию шагов, а не сами шаги.
 */
const calls: string[] = [];
const failing = new Set<string>();
const stepFn = <T>(name: string, value: T) => async () => {
  calls.push(name);
  if (failing.has(name)) throw new Error(`${name} упал`);
  return value;
};

const fake = {
  automation: { engine: { runScheduled: stepFn("automations", 0) } },
  clients: { tasks: { remindDue: stepFn("reminders", 0) } },
  sales: { routing: { run: stepFn("routing", 0) } },
  messaging: { bot: { sweep: stepFn("bot", 0) }, email: { pollImap: stepFn("imap", 0) }, syncGowaHistory: stepFn("history", 0), coach: { run: stepFn("coach", null) }, purgeBotTraces: stepFn("traces", 0) },
  invoiceAccess: { run: stepFn("access", { processed: 0, failed: 0 }), expire: stepFn("expire", 0) },
  ordering: { deliverDueGifts: stepFn("gifts", 0), kaspiWatch: { check: stepFn("kaspi watch", null) } },
  notifications: { lifecycle: { run: stepFn("lifecycle", 0) } },
  outbox: { purge: stepFn("purge", undefined) },
};

vi.mock("@/server/container", () => ({ container: () => fake }));
vi.mock("@/shared/infrastructure/db", () => ({
  pool: { connect: async () => ({ query: async (q: string) => ({ rows: q.includes("try_advisory") ? [{ locked: true }] : [] }), release: () => {} }) },
}));

const { crmTick, tick } = await import("@/server/scheduler");

describe("scheduler: шаг упал — проход идёт дальше", () => {
  let errors: unknown[][];
  beforeEach(() => {
    calls.length = 0;
    failing.clear();
    errors = [];
    vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => void errors.push(a));
    vi.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("минутный проход: правила CRM и круг заявок упали — напоминания, бот, почта, доступ по счетам и проверка кассира Kaspi всё равно выполняются", async () => {
    failing.add("automations").add("routing");
    await crmTick();
    expect(calls).toEqual(["automations", "reminders", "routing", "bot", "imap", "access", "expire", "kaspi watch"]);
    expect(errors.map((e) => e[0])).toEqual(['[scheduler] step "crm automations" failed', '[scheduler] step "lead routing" failed']);
  });

  it("минутный проход: проверка кассира Kaspi упала (kaspi-pos завис) — в логе её имя, остальные шаги уже выполнены", async () => {
    failing.add("kaspi watch");
    await crmTick();
    expect(calls.at(-1)).toBe("kaspi watch");
    expect(calls).toHaveLength(8);
    expect(errors.map((e) => e[0])).toEqual(['[scheduler] step "kaspi watch" failed']);
  });

  it("медленный проход: сертификаты упали — автописьма, чистка outbox, история WhatsApp, разбор бота и чистка его следов выполняются", async () => {
    failing.add("gifts").add("purge");
    await tick();
    expect(calls).toEqual(["gifts", "lifecycle", "purge", "history", "coach", "traces"]);
    expect(errors.map((e) => e[0])).toEqual(['[scheduler] step "gifts" failed', '[scheduler] step "outbox purge" failed']);
  });

  it("медленный проход: разбор бота упал — следы бота старше 90 дней всё равно чистятся", async () => {
    failing.add("coach");
    await tick();
    expect(calls.at(-1)).toBe("traces");
    expect(errors.map((e) => e[0])).toEqual(['[scheduler] step "bot coach" failed']);
  });
});
