import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { OpsHealth, v1 } from "@mybook/contracts";
import { StaffContext } from "@/modules/access/domain/StaffContext";
import { isPhoneEmail } from "@/modules/identity";
import { evaluate } from "@/modules/monitoring/domain/health";
import { OPS_JOBS } from "@/shared/domain/opsHealth";
import { allPermissions, type Permission } from "@/shared/domain/permissions";
import { STAFF_ACCESS, type StaffAccessPort } from "../src/core/auth/staff";
import { OPS_PORTS, type OpsPorts } from "../src/modules/ops/ops.tokens";
import { bootTestApp, sessionOf, testUser } from "./app";

/** «Фон и очереди» (crmOpsHealth): права settings.manage, ответ по контракту из настоящей оценки фона. */
const OWNER = testUser("11111111-1111-4111-8111-111111111111", { name: "Руководитель", email: "owner@mybooks.kz", role: "admin" });
const ADMIN = testUser("22222222-2222-4222-8222-222222222222", { name: "Настройки", email: "settings@mybooks.kz", role: "admin" });
const MANAGER = testUser("33333333-3333-4333-8333-333333333333", { name: "Менеджер", email: "manager@mybooks.kz", role: "admin" });
const CLIENT = testUser("44444444-4444-4444-8444-444444444444", { name: "Клиент", email: "client@mybooks.kz", role: "user" });

const ctx = (id: string, perms: readonly Permission[], owner = false) => new StaffContext(id, owner ? "Руководитель" : "Сотрудник", owner ? "owner" : null, "all", new Set(perms), owner, { isPhoneEmail });

const staffAccess: StaffAccessPort = {
  async resolve(user) {
    if (user.role !== "admin") return null;
    if (user.id === OWNER.id) return { context: ctx(user.id, allPermissions, true), gate: null };
    if (user.id === ADMIN.id) return { context: ctx(user.id, ["settings.manage"]), gate: null };
    return { context: ctx(user.id, ["deals.view", "chats.view", "team.manage"]), gate: null };
  },
};

const NOW = new Date("2026-11-26T10:00:00Z");
const ago = (sec: number) => new Date(NOW.getTime() - sec * 1000);

/** Настоящая сводка: воркер прошёл минуту назад, шаг ИИ падает три раза подряд, в outbox одно событие в разборе. */
const snapshot = evaluate(
  {
    pulses: Object.keys(OPS_JOBS).map((job) => ({
      job,
      everySec: null,
      startedAt: ago(60),
      finishedAt: ago(59),
      outcome: job === "kaspi.fast" ? ("off" as const) : job === "ai stages" ? ("error" as const) : ("ok" as const),
      durationMs: 800,
      okAt: job === "ai stages" ? null : ago(59),
      error: job === "ai stages" ? "model timeout" : null,
      errorAt: job === "ai stages" ? ago(59) : null,
      fails: job === "ai stages" ? 3 : 0,
      runs: 100,
      failures: job === "ai stages" ? 3 : 0,
      note: null,
    })),
    outbox: { pending: 1, dueOldestAt: null, retrying: 0, retryError: null, dead: 1, deadLastAt: ago(7200), deadLastType: "ordering.order_paid", deadLastError: "mail: smtp down", deliveredHour: 40 },
    messages: { errorsHour: 0, errorsDay: 2, lastErrorAt: ago(5000), lastError: "gateway 502", pendingStuck: 0 },
    voices: { waiting: 2, oldestAt: ago(120) },
    media: { queued: 0, oldestAt: null, failedDay: 0, lastFailedError: null },
    mail: { sentDay: 3, lastSentAt: ago(3600), autoOn: false },
    cashier: { ok: true, since: ago(86_400), reason: null, alerted: false },
  },
  NOW,
);

const ports = { health: vi.fn<OpsPorts["health"]>(async () => snapshot) } satisfies OpsPorts;
const auth = (u: typeof OWNER) => ({ cookie: `mb_session=${sessionOf(u)}`, origin: "http://localhost:3000" });

let app: NestFastifyApplication;

beforeAll(async () => {
  ({ app } = await bootTestApp({
    users: [OWNER, ADMIN, MANAGER, CLIENT],
    env: { NODE_ENV: "test" },
    overrides: [
      [STAFF_ACCESS, staffAccess],
      [OPS_PORTS, ports],
    ],
  }));
});

afterAll(() => app.close());

describe("crmOpsHealth — «Фон и очереди»", () => {
  it("маршрут в контракте: GET, сотрудник", () => {
    expect(v1.crmOpsHealth).toMatchObject({ method: "GET", path: "/api/v1/crm/ops/health", auth: "staff" });
  });

  it("сводка из оценки фона проходит схему контракта", () => {
    expect(OpsHealth.safeParse(snapshot).success).toBe(true);
    expect(snapshot.level).toBe("down");
  });

  it("руководитель и сотрудник с settings.manage — 200, ответ по контракту", async () => {
    for (const u of [OWNER, ADMIN]) {
      const res = await app.inject({ method: "GET", url: "/api/v1/crm/ops/health", headers: auth(u) });
      expect(res.statusCode, u.email).toBe(200);
      const body = OpsHealth.parse(res.json());
      expect(body.streams.map((s) => s.key)).toEqual(["worker", "outbox", "kaspi", "whatsapp", "ai", "media", "mail", "print"]);
      const ai = body.streams.find((s) => s.key === "ai")!;
      expect(ai.level).toBe("down");
      expect(ai.signals[0]).toMatchObject({ level: "down", alert: true });
      expect(ai.errors[0]).toMatchObject({ job: "ИИ ведёт этапы", text: "model timeout" });
      expect(body.streams.find((s) => s.key === "outbox")!.metrics.find((m) => m.key === "outboxDead")).toMatchObject({ value: 1, level: "warn" });
      expect(body.streams.find((s) => s.key === "mail")!.notes).toHaveLength(1);
    }
  });

  it("без settings.manage и клиент — 403, без входа — 401", async () => {
    ports.health.mockClear();
    expect((await app.inject({ method: "GET", url: "/api/v1/crm/ops/health", headers: auth(MANAGER) })).statusCode).toBe(403);
    expect((await app.inject({ method: "GET", url: "/api/v1/crm/ops/health", headers: auth(CLIENT) })).statusCode).toBe(403);
    expect((await app.inject({ method: "GET", url: "/api/v1/crm/ops/health" })).statusCode).toBe(401);
    expect(ports.health).not.toHaveBeenCalled();
  });
});
