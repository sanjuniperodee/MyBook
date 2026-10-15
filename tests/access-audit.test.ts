import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { drizzleAuditLog } from "@/modules/access/infrastructure/persistence";
import { requestOrigin } from "@/server/rateLimit";

/** Строки, которые журнал вставил в crm_audit; insert можно заставить упасть. */
const db = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[], fail: false }));
/** Текущий запрос: null — вне запроса (планировщик, скрипт), next/headers там бросает. */
const req = vi.hoisted(() => ({ headers: null as Headers | null }));

vi.mock("next/headers", () => ({
  headers: async () => {
    if (!req.headers) throw new Error("headers() вызван вне запроса");
    return req.headers;
  },
}));
vi.mock("@/shared/infrastructure/database", () => ({
  executor: () => ({
    insert: () => ({
      values: async (row: Record<string, unknown>) => {
        if (db.fail) throw new Error("база недоступна");
        db.rows.push(row);
      },
    }),
  }),
}));

const entry = { actorId: "u1", action: "role.update", entity: "role", entityId: "r1", details: { name: "Менеджер" } };

beforeEach(() => {
  db.rows = [];
  db.fail = false;
  req.headers = null;
});
afterEach(() => vi.restoreAllMocks());

describe("журнал действий: адрес запроса (RequestOrigin)", () => {
  it("в запросе пишет адрес клиента вместе с записью", async () => {
    req.headers = new Headers({ "x-forwarded-for": "1.1.1.1, 10.0.0.1" });
    await drizzleAuditLog(requestOrigin).record(entry);
    expect(db.rows).toEqual([{ actorId: "u1", action: "role.update", entity: "role", entityId: "r1", details: { name: "Менеджер" }, ip: "1.1.1.1" }]);
  });

  it("вне запроса адреса нет (null), но запись делается и исключения нет", async () => {
    await expect(requestOrigin.ip()).resolves.toBeNull();
    await expect(drizzleAuditLog(requestOrigin).record({ actorId: null, action: "cron", entity: "job" })).resolves.toBeUndefined();
    expect(db.rows).toEqual([{ actorId: null, action: "cron", entity: "job", entityId: null, details: null, ip: null }]);
  });

  it("ошибка записи не ломает основное действие: уходит в консоль", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    db.fail = true;
    await expect(drizzleAuditLog({ ip: async () => null }).record(entry)).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith("[audit]", expect.any(Error));
  });
});
