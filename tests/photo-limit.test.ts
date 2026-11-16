import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/modules/workspace", () => ({ getSettings: async () => ({}) }));

describe("предел фото в книге (CRM → «Сайт» → «Фото в книге»)", () => {
  it("берёт целое 1…1000, иначе — 140", async () => {
    const { parsePhotoLimit } = await import("@/server/photoLimit");
    expect(parsePhotoLimit("200")).toBe(200);
    expect(parsePhotoLimit(" 1 ")).toBe(1);
    expect(parsePhotoLimit("1000")).toBe(1000);
    for (const bad of ["", null, undefined, "0", "1001", "12.5", "-3", "сто"]) expect(parsePhotoLimit(bad)).toBe(140);
  });
});
