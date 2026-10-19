import { beforeEach, describe, expect, it, vi } from "vitest";
import { callAction, openChatAction, sendEmailAction } from "@/app/admin/crm-actions";
import { admin } from "@/i18n/admin";
import { fake, owner, resetContainer, resetRequest, signIn, timur } from "./doubles/web";

vi.mock("next/headers", async () => (await import("./doubles/web")).nextHeaders);
vi.mock("next/navigation", async () => (await import("./doubles/web")).nextNavigation);
vi.mock("next/cache", async () => (await import("./doubles/web")).nextCache);
vi.mock("@/server/container", async () => (await import("./doubles/web")).containerModule);

// «Позвонить», «Открыть чат» и «Письмо» (crm-actions) у роли «только свои»: неразобранная или чужая сделка — отказ
// ответом { ok: false, message }, а не ForbiddenError. Кнопка в «Моём дне», карточке или «Звонках» показывает текст, а не
// экран ошибки вместо CRM (P0-7: «ничья» задача бота «Перезвонить» на неразобранной сделке).

const DEAL = "0d0d0d0d-0000-4000-8000-000000000001";

let calls: string[];
let chats: string[];
let emails: string[];
let assigneeId: string | null;

beforeEach(() => {
  resetRequest();
  resetContainer();
  calls = [];
  chats = [];
  emails = [];
  assigneeId = null;
  fake.clients = { contact: async () => ({ phone: "77011234567", email: "a@b.kz", clientId: null, assigneeId, name: "Айгерим", dealId: DEAL }) };
  fake.telephony = { phone: { clickToCall: async (_ext: string, phone: string) => void calls.push(phone) } };
  fake.marketing = { service: { shopWhatsapp: async () => "77005556677" } };
  fake.messaging = {
    whatsappProvider: async () => "gowa",
    chats: { conversationForPhone: async (phone: string) => (chats.push(phone), { id: "conv-1", dealId: DEAL }), attachDeal: async () => {} },
    email: { sendToContact: async (input: { text: string }) => (emails.push(input.text), { ok: true, conversationId: "conv-2" }) },
  };
});

describe("связаться с клиентом: отказ — ответом, а не исключением", () => {
  it("неразобранная сделка у «только свои» — текст про круг; ни звонка, ни чата, ни письма", async () => {
    signIn(timur);
    expect(await callAction({ dealId: DEAL })).toEqual({ ok: false, message: admin.recordUnsorted });
    expect(await openChatAction({ dealId: DEAL })).toEqual({ ok: false, message: admin.recordUnsorted });
    expect(await sendEmailAction({ dealId: DEAL }, "Книга", "Здравствуйте")).toEqual({ ok: false, message: admin.recordUnsorted });
    expect([calls, chats, emails]).toEqual([[], [], []]);
  });

  it("сделку ведёт другой менеджер — «недостаточно прав», без звонка и чата", async () => {
    signIn(timur);
    assigneeId = "other";
    expect(await callAction({ dealId: DEAL })).toEqual({ ok: false, message: admin.recordNotYours });
    expect(await openChatAction({ dealId: DEAL })).toEqual({ ok: false, message: admin.recordNotYours });
    expect([calls, chats]).toEqual([[], []]);
  });

  it("своя сделка — звонок и чат; руководителю — и неразобранная", async () => {
    signIn(timur);
    assigneeId = "timur";
    expect(await callAction({ dealId: DEAL })).toMatchObject({ ok: true });
    expect(await openChatAction({ dealId: DEAL })).toEqual({ ok: true, id: "conv-1" });
    signIn(owner);
    assigneeId = null;
    expect(await openChatAction({ dealId: DEAL })).toEqual({ ok: true, id: "conv-1" });
    expect(await sendEmailAction({ dealId: DEAL }, "Книга", "Здравствуйте")).toMatchObject({ ok: true });
    expect(calls).toEqual(["77011234567"]);
    expect(chats).toHaveLength(2);
    expect(emails).toEqual(["Здравствуйте"]);
  });
});
