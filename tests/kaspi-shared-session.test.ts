import { afterEach, describe, expect, it, vi } from "vitest";

/** Общая сессия кассира задаётся теми же переменными, что у my-test.kz (KASPI_TOKEN_SN и др.), и важнее сохранённой в «Интеграциях». */
const stored: Record<string, string> = {};
vi.mock("@/modules/workspace", () => ({
  getSettings: async (keys: string[]) => Object.fromEntries(keys.map((k) => [k, stored[k] ?? ""])),
  saveSettings: async () => {},
  ensureToken: async () => "t",
}));

const { kaspiConfig } = await import("@/server/integration-settings");

afterEach(() => {
  for (const k of ["KASPI_TOKEN_SN", "KASPI_VTOKEN_SECRET", "KASPI_PROFILE_ID", "KASPI_ORGANIZATION_ID"]) delete process.env[k];
});

describe("kaspiConfig: сессия кассира", () => {
  it("без переменных — сохранённая в настройках, shared: false", async () => {
    stored["kaspi.session"] = JSON.stringify({ tokenSn: "own", vtokenSecret: "v", profileId: 1, organizationId: 0, orgName: "", phone: "" });
    expect(await kaspiConfig.config()).toMatchObject({ shared: false, session: { tokenSn: "own" } });
  });

  it("с KASPI_TOKEN_SN и KASPI_VTOKEN_SECRET — общая с сервера, shared: true", async () => {
    Object.assign(process.env, { KASPI_TOKEN_SN: " TSN ", KASPI_VTOKEN_SECRET: "VSEC", KASPI_PROFILE_ID: "3764672" });
    expect(await kaspiConfig.config()).toMatchObject({ shared: true, session: { tokenSn: "TSN", vtokenSecret: "VSEC", profileId: 3764672, organizationId: 0 } });
  });
});
