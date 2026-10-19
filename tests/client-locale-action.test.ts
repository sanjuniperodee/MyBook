import { beforeEach, describe, expect, it, vi } from "vitest";

/** Смена языка кабинета и писем клиента из карточки CRM (setClientLocaleAction). */
const w = vi.hoisted(() => ({ locale: [] as [string, string][], audits: [] as unknown[], visible: true, client: { id: "0b0b0b0b-0000-4000-8000-000000000001", managerId: "m1" } as { id: string; managerId: string | null } | null }));

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/server/access", () => ({
  assertStaff: async () => ({ user: { id: "boss" } }),
  assertVisible: () => {
    if (!w.visible) throw new Error("forbidden");
  },
  audit: async (_s: unknown, ...rest: unknown[]) => void w.audits.push(rest),
  canAssignOthers: () => true,
  ForbiddenError: class extends Error {},
}));
vi.mock("@/server/container", () => ({
  container: () => ({
    clients: { clients: { find: async (id: string) => (w.client && w.client.id === id ? w.client : null) } },
    identity: { accounts: { setLocale: async (id: string, l: string) => void w.locale.push([id, l]) } },
  }),
}));

const { setClientLocaleAction } = await import("@/app/admin/crm-actions");
const ID = "0b0b0b0b-0000-4000-8000-000000000001";

beforeEach(() => {
  w.locale = [];
  w.audits = [];
  w.visible = true;
});

describe("setClientLocaleAction", () => {
  it("меняет язык и пишет в журнал", async () => {
    expect(await setClientLocaleAction(ID, "kk")).toEqual({ ok: true, message: "Язык: казахский" });
    expect(w.locale).toEqual([[ID, "kk"]]);
    expect(w.audits).toEqual([["client.locale", "client", ID, { to: "kk" }]]);
  });

  it("не тот язык или чужой клиент — без изменений; мусор вместо id — ошибка", async () => {
    expect(await setClientLocaleAction(ID, "en")).toEqual({ ok: false, message: "Выберите язык" });
    expect(await setClientLocaleAction("0b0b0b0b-0000-4000-8000-000000000002", "kk")).toEqual({ ok: false, message: "Клиент не найден" });
    w.visible = false;
    await expect(setClientLocaleAction(ID, "kk")).rejects.toThrow("forbidden");
    await expect(setClientLocaleAction("1 or 1=1", "kk")).rejects.toThrow();
    expect(w.locale).toEqual([]);
  });
});
