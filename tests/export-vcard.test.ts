import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as exportVcard } from "@/server/site-handlers/admin/export-vcard";
import { fake, nadia, owner, resetContainer, resetRequest, signIn } from "./doubles/web";

vi.mock("@/shared/infrastructure/http/request", async (real) => ({ ...(await real<object>()), ...(await import("./doubles/web")).nextHeaders, ...(await import("./doubles/web")).nextNavigation }));
vi.mock("@/server/container", async () => (await import("./doubles/web")).containerModule);
vi.mock("@/shared/infrastructure/database", () => ({ rootDb: {}, executor: () => ({}) }));

// Контакты для телефона магазина (contacts-10): vCard, «только свои» — свои, since — только изменённые.
let asked: { since: Date | null; scopeManagerId: string | null }[];

beforeEach(() => {
  resetRequest();
  resetContainer();
  asked = [];
  fake.reporting = {
    vcardClients: async (q: { since: Date | null; scopeManagerId: string | null }) => {
      asked.push(q);
      return [{ id: "u1", name: "Айгерим", phone: "8 701 123 45 67", extra_phones: ["77029998877"], deal_number: 12, occasion: "birthday" }];
    },
  };
});

const download = (qs = "") => exportVcard(new Request(`http://localhost/api/admin/export/vcard${qs}`), undefined as never);

describe("выгрузка контактов vCard", () => {
  it("файл .vcf: подпись с номером сделки и поводом по-русски, номера в международном виде", async () => {
    signIn(owner);
    const res = await download();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/vcard");
    const body = await res.text();
    expect(body).toContain("FN:Айгерим · MB12 · День рождения");
    expect(body).toContain("TEL;TYPE=CELL,PREF:+77011234567");
    expect(body).toContain("TEL;TYPE=CELL:+77029998877");
    expect(asked.at(-1)).toEqual({ since: null, scopeManagerId: null });
  });

  it("since — с начала дня по Алматы; «только свои» — свои клиенты", async () => {
    signIn(nadia);
    await download("?since=2026-10-20");
    expect(asked.at(-1)?.scopeManagerId).toBe(nadia.id);
    expect(asked.at(-1)?.since?.toISOString()).toBe("2026-10-19T19:00:00.000Z");
  });
});
