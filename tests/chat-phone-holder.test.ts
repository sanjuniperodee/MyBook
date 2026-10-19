import { describe, expect, it } from "vitest";
import { inbound, setup } from "./doubles/botHarness";

const holder = { id: "m2", name: "Салауат" };

describe("Телефон WhatsApp у сотрудника: ответ с телефона забирает новую заявку", () => {
  it("ответили с телефона магазина — новая заявка и чат переходят к тому, у кого телефон; прежний ответственный узнаёт", async () => {
    const t = setup({ phoneHolder: holder, claimNewLead: () => ({ claimed: true, previous: "m1" }) });
    await t.service.ingest(inbound({ text: "Здравствуйте, сколько стоит?" }));
    const conv = t.conv();
    conv.assigneeId = "m1";
    await t.service.ingest(inbound({ isEcho: true, text: "Здравствуйте! Сейчас подскажу" }));
    expect(t.claims).toEqual([{ dealId: conv.dealId, userId: "m2" }]);
    expect(t.notified.some((n) => n.title.includes("Заявку взял(а) Салауат"))).toBe(true);
  });

  it("заявка уже в работе у коллеги — не перехватывается", async () => {
    const t = setup({ phoneHolder: holder, claimNewLead: () => ({ claimed: false, previous: null }) });
    await t.service.ingest(inbound({ text: "Здравствуйте" }));
    const conv = t.conv();
    conv.assigneeId = "m1";
    await t.service.ingest(inbound({ isEcho: true, text: "Добрый день" }));
    expect(t.claims).toHaveLength(1);
    expect(t.notified.some((n) => n.title.includes("Заявку взял"))).toBe(false);
  });

  it("телефон ни у кого не указан или сообщение ушло из CRM — ничего не меняется", async () => {
    const t = setup();
    await t.service.ingest(inbound({ text: "Здравствуйте" }));
    await t.service.ingest(inbound({ isEcho: true, text: "Добрый день" }));
    expect(t.claims).toEqual([]);
    const t2 = setup({ phoneHolder: holder });
    await t2.service.ingest(inbound({ chatId: "77019998877", text: "Здравствуйте" }));
    await t2.service.send(t2.conv().id, "Ответ из CRM", "m1");
    await t2.service.ingest(inbound({ chatId: "77019998877", isEcho: true, externalId: "wz-1", text: "Ответ из CRM" }));
    expect(t2.claims).toEqual([]);
  });
});
