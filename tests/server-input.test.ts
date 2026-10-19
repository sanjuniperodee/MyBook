import { describe, expect, it, vi } from "vitest";
import { api } from "@/server/api";
import { idParams, textForm } from "@/server/input";

vi.mock("next/headers", async () => (await import("./doubles/web")).nextHeaders);
vi.mock("next/navigation", async () => (await import("./doubles/web")).nextNavigation);
vi.mock("@/server/container", async () => (await import("./doubles/web")).containerModule);

const get = () => new Request("http://localhost/api/x");

describe("вход роутов: параметры пути (решение 7)", () => {
  /** Роут, который читает [id] и [pid] и только потом ходит в базу. */
  const route = api(async (_req, { params }: { params: Promise<{ id: string; pid: string; kind: string }> }) => {
    const { id, pid } = idParams(await params, "id", "pid");
    return Response.json({ id, pid });
  });
  const call = async (params: { id: string; pid: string; kind: string }) => {
    const res = await route(get(), { params: Promise.resolve(params) });
    return { status: res.status, body: await res.json() };
  };
  const ID = "11111111-1111-4111-8111-111111111111";

  it("мусор вместо UUID — 400 «Некорректный запрос», а не 500 от базы", async () => {
    expect(await call({ id: "1 OR 1=1", pid: ID, kind: "pdf" })).toEqual({ status: 400, body: { error: "Некорректный запрос", code: "badRequest" } });
    expect(await call({ id: ID, pid: "../x", kind: "pdf" })).toMatchObject({ status: 400 });
  });

  it("UUID проходят, остальные параметры не трогаются", async () => {
    expect(await call({ id: ID, pid: ID, kind: "что-угодно" })).toEqual({ status: 200, body: { id: ID, pid: ID } });
  });
});

describe("textForm: форма только из текстовых полей", () => {
  it("файл вместо текста — ошибка, тексты — проходят", () => {
    const ok = new FormData();
    ok.set("a", "1");
    expect(textForm(ok).success).toBe(true);
    const bad = new FormData();
    bad.set("a", new File(["x"], "x.txt"));
    expect(textForm(bad).success).toBe(false);
  });
});
