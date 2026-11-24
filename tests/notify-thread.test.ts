import { describe, expect, it } from "vitest";
import { sameThread, threadBody } from "@/modules/workspace/domain";

const chat = "/admin/chats?c=1";
const deal = "/admin/deals/1";

describe("Одно уведомление на объект (24.11: тысячи непрочитанных у админов)", () => {
  it("«клиент написал» и «заявку взял(а)» по одному чату — разные уведомления", () => {
    expect(sameThread({ kind: "message", title: "Айгерим · WhatsApp", link: chat }, { kind: "message", title: "Заявку взял(а) Margo: ответил(а) с телефона WhatsApp", link: chat })).toBe(false);
  });

  it("сообщения клиента одного чата — в одно уведомление, другой чат — отдельно", () => {
    expect(sameThread({ kind: "message", title: "Айгерим · WhatsApp", link: chat }, { kind: "message", title: "Айгерим · WhatsApp", link: chat })).toBe(true);
    expect(sameThread({ kind: "message", title: "Айгерим · WhatsApp", link: chat }, { kind: "message", title: "Айгерим · WhatsApp", link: "/admin/chats?c=2" })).toBe(false);
  });

  it("«никто не взял» по заявке — одно, даже если текст другой", () => {
    expect(sameThread({ kind: "sla", title: "Заявку Д1686 никто не взял", link: deal }, { kind: "sla", title: "Заявку Д1686 никто не взял", link: deal })).toBe(true);
  });

  it("разные задачи одной сделки — разные уведомления; та же задача — одно", () => {
    expect(sameThread({ kind: "task", title: "Просрочена задача: A", link: deal }, { kind: "task", title: "Просрочена задача: B", link: deal })).toBe(false);
    expect(sameThread({ kind: "task", title: "Просрочена задача: A", link: deal }, { kind: "task", title: "Просрочена задача: A", link: deal })).toBe(true);
  });

  it("без ссылки и другой вид — не сворачиваются", () => {
    expect(sameThread({ kind: "system", title: "X", link: null }, { kind: "system", title: "X", link: null })).toBe(false);
    expect(sameThread({ kind: "message", title: "X", link: chat }, { kind: "sla", title: "X", link: chat })).toBe(false);
  });

  it("текст: сколько новых сообщений и последнее", () => {
    expect(threadBody(true, 1, "Цена ?")).toBe("Цена ?");
    expect(threadBody(true, 2, "Цена ?")).toBe("2 новых сообщения · Цена ?");
    expect(threadBody(true, 5, "Нет")).toBe("5 новых сообщений · Нет");
    expect(threadBody(true, 21, "Астана")).toBe("21 новое сообщение · Астана");
    expect(threadBody(true, 12, "Да")).toBe("12 новых сообщений · Да");
    // Служебное о чате («заявку взял(а)») — без «новых сообщений».
    expect(threadBody(false, 3, "Kanat")).toBe("Kanat");
  });
});
