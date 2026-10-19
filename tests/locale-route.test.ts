import { beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "@/config/env";
import { POST } from "@/app/api/locale/route";
import { resetRequest } from "./doubles/web";

vi.mock("next/headers", async () => (await import("./doubles/web")).nextHeaders);
vi.mock("next/navigation", async () => (await import("./doubles/web")).nextNavigation);
vi.mock("@/server/container", async () => (await import("./doubles/web")).containerModule);

const app = new URL(env.appUrl);
const post = (body: unknown, origin = app.origin) =>
  POST(new Request(`${app.origin}/api/locale`, { method: "POST", headers: { "Content-Type": "application/json", origin, host: app.host }, body: JSON.stringify(body) }), {});

beforeEach(() => resetRequest());

describe("POST /api/locale (V-minor)", () => {
  it("свой сайт: язык запоминается в cookie", async () => {
    const res = await post({ locale: "kk" });
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toMatch(/mb_locale=kk/);
  });

  it("чужой Origin — 403: сменить язык чужого пользователя с другого сайта нельзя", async () => {
    expect((await post({ locale: "kk" }, "https://evil.example")).status).toBe(403);
  });

  it("неизвестный язык или мусор — 400 с текстом", async () => {
    const res = await post({ locale: "en" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBeTruthy();
    expect((await post("мусор")).status).toBe(400);
  });
});
