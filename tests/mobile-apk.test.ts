import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { looksLikeApk } from "@/server/mobile-apk";

describe("APK upload check", () => {
  it("принимает zip-архив (APK начинается с PK)", () => {
    expect(looksLikeApk(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]))).toBe(true);
  });

  it("отсекает файл не того формата и обрывок", () => {
    expect(looksLikeApk(new TextEncoder().encode("<html>"))).toBe(false);
    expect(looksLikeApk(new Uint8Array([0x50, 0x4b]))).toBe(false);
    expect(looksLikeApk(new Uint8Array())).toBe(false);
  });
});
