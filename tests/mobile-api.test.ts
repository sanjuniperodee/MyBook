import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/container", () => ({ container: () => ({}) }));
vi.mock("@/server/access", () => ({ getStaff: async () => null, can: () => false, ForbiddenError: class extends Error { static is = () => false } }));
vi.mock("@/i18n/server", () => ({ getMessages: async () => ({ api: {} }), getLocale: async () => "ru" }));

const { issueTicket, readTicket } = await import("@/server/mobile-auth");
const { mobile } = await import("@/server/mobile-api");

afterEach(() => vi.useRealTimers());

describe("мобильное приложение: вход и ошибки", () => {
  it("билет второго шага: читается 5 минут, подделка и мусор — нет", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-21T10:00:00Z"));
    const ticket = issueTicket("user-1");
    expect(readTicket(ticket)).toBe("user-1");
    expect(readTicket(`${ticket}x`)).toBeNull();
    expect(readTicket(ticket.replace("user-1", "user-2"))).toBeNull();
    expect(readTicket("мусор")).toBeNull();
    vi.setSystemTime(new Date("2026-10-21T10:05:01Z"));
    expect(readTicket(ticket)).toBeNull();
  });

  it("русское сообщение действия CRM уходит в приложение текстом с кодом 400", async () => {
    const res = await mobile(async () => {
      throw new Error("Укажите причину отказа");
    })(new Request("http://x/api/mobile/deals"), undefined as never);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Укажите причину отказа" });
  });

  it("техническая ошибка — 500 без подробностей", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await mobile(async () => {
      throw new Error("connection refused 10.0.0.5:5432");
    })(new Request("http://x/api/mobile/deals"), undefined as never);
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("10.0.0.5");
    log.mockRestore();
  });
});
