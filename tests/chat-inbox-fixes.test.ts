import { describe, expect, it } from "vitest";
import { inbound, setup } from "./doubles/botHarness";
import { extOf } from "@/modules/messaging/infrastructure/chatFiles";
import { readableOn } from "@/components/admin/chat/Inbox";

describe("повтор вебхука после сбоя на середине обработки", () => {
  it("сообщение принято, а заявка упала — повтор заводит заявку, «непрочитано» не удваивается", async () => {
    const t = setup();
    const create = t.deps.sales.createDeal;
    let fail = true;
    t.deps.sales.createDeal = async (i) => {
      if (fail) {
        fail = false;
        throw new Error("база недоступна");
      }
      return create(i);
    };
    const m = inbound({ text: "Здравствуйте, хочу книгу" });
    await expect(t.service.ingest(m)).rejects.toThrow("база недоступна");
    expect(t.conv()).toMatchObject({ unread: 1, dealId: null });
    await t.service.ingest(m);
    expect(t.conv().unread).toBe(1);
    expect(t.conv().dealId).toBeTruthy();
    expect(t.deals).toHaveLength(1);
    expect(t.msgs.filter((x) => x.dir === "in")).toHaveLength(1);
  });

  it("повтор уже обработанного сообщения ничего не делает второй раз", async () => {
    const t = setup();
    const m = inbound({ text: "Здравствуйте" });
    await t.service.ingest(m);
    const notified = t.notified.length;
    await t.service.ingest(m);
    expect(t.conv().unread).toBe(1);
    expect(t.deals).toHaveLength(1);
    expect(t.notified.length).toBe(notified);
  });
});

describe("«Написать» из карточки клиента", () => {
  it("новый диалог — сразу у сотрудника, а не ничей", async () => {
    const t = setup();
    const conv = await t.service.conversationForPhone("+7 701 999 88 77", "ch", null, "Айгерим", "m2");
    expect(conv).toMatchObject({ chatId: "77019998877", assigneeId: "m2" });
  });

  it("сделка привязывается к ничьему диалогу — диалог переходит к ответственному сделки; свой ответственный остаётся", async () => {
    const t = setup();
    t.deps.sales.deal = async (id) => ({ id, clientId: null, assigneeId: "m3", title: "Сделка", contactName: "", customFields: {} });
    const free = await t.service.conversationForPhone("77019998877", "ch", null, "", null);
    await t.service.attachDeal(free.id, "d9");
    expect(t.convs.get(free.id)).toMatchObject({ dealId: "d9", assigneeId: "m3" });
    const own = await t.service.conversationForPhone("77015554433", "ch", null, "", "m2");
    await t.service.attachDeal(own.id, "d10");
    expect(t.convs.get(own.id)).toMatchObject({ dealId: "d10", assigneeId: "m2" });
  });
});

describe("пересылка вложения", () => {
  it("расширение файла — по таблице файлов чата, а не хвост MIME", () => {
    expect(extOf("", "video/quicktime")).toBe("mov");
    expect(extOf("", "image/jpeg")).toBe("jpg");
    expect(extOf("", "audio/ogg; codecs=opus")).toBe("ogg");
    expect(extOf("", "application/x-unknown")).toBe("bin");
    expect(extOf("Договор.PDF", "")).toBe("pdf");
  });
});

describe("плашка этапа сделки", () => {
  it("текст тёмный на светлом цвете этапа и белый на тёмном", () => {
    expect(readableOn("#fde68a")).toBe("#17130f");
    expect(readableOn("#fff")).toBe("#17130f");
    expect(readableOn("#7a1f2b")).toBe("#fff");
    expect(readableOn("#1d4ed8")).toBe("#fff");
    expect(readableOn("var(--stage)")).toBe("#fff");
  });
});
