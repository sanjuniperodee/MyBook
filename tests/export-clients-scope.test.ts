import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as exportClients } from "@/app/api/admin/export/clients/route";
import { fake, nadia, owner, resetContainer, resetRequest, signIn } from "./doubles/web";

vi.mock("next/headers", async () => (await import("./doubles/web")).nextHeaders);
vi.mock("next/navigation", async () => (await import("./doubles/web")).nextNavigation);
vi.mock("@/server/container", async () => (await import("./doubles/web")).containerModule);
vi.mock("@/shared/infrastructure/database", () => ({ rootDb: {}, executor: () => ({}) }));

// Выгрузка клиентов в CSV видит тех же клиентов, что список /admin/clients: роль «только свои» — своих и неразобранных.

let asked: { scopeManagerId?: string | null }[];

beforeEach(() => {
  resetRequest();
  resetContainer();
  asked = [];
  fake.reporting = {
    clients: async (q: { scopeManagerId?: string | null }) => {
      asked.push(q);
      return { rows: [], total: 0 };
    },
  };
});

const download = () => exportClients(new Request("http://localhost/api/admin/export/clients?segment=all"), { params: Promise.resolve({}) });

describe("выгрузка клиентов CSV", () => {
  it("роль «только свои» выгружает только своих (scopeManagerId — она сама), руководитель — всех", async () => {
    signIn(nadia);
    expect((await download()).status).toBe(200);
    expect(asked.at(-1)?.scopeManagerId).toBe(nadia.id);
    signIn(owner);
    expect((await download()).status).toBe(200);
    expect(asked.at(-1)?.scopeManagerId).toBeNull();
  });
});
