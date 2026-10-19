import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as sendFiles } from "@/app/api/admin/chats/[id]/files/route";
import { editMessageAction, forwardMessageAction } from "@/app/admin/chats/actions";
import { sendEmailAction } from "@/app/admin/crm-actions";
import { MessageActionError } from "@/modules/messaging";
import { fake, lena, resetContainer, resetRequest, signIn } from "./doubles/web";

vi.mock("next/headers", async () => (await import("./doubles/web")).nextHeaders);
vi.mock("next/navigation", async () => (await import("./doubles/web")).nextNavigation);
vi.mock("next/cache", async () => (await import("./doubles/web")).nextCache);
vi.mock("@/server/container", async () => (await import("./doubles/web")).containerModule);

// Реквизиты во всех путях отправки сотрудника (chats-d4): подпись к файлу, правка, пересылка, письмо из карточки. Чужой
// номер, карта, IBAN или ссылка на перевод Kaspi не уходят; номер клиента (чат, номера сделки) и магазина — можно.

const CONV = "0d0d0d0d-0000-4000-8000-000000000002";
const OTHER = "0d0d0d0d-0000-4000-8000-000000000003";
const MSG = "0d0d0d0d-0000-4000-8000-000000000009";
const SHOP = "77005556677";

let uploads: { caption: string }[];
let edits: string[];
let emails: string[];

beforeEach(() => {
  resetRequest();
  resetContainer();
  signIn(lena);
  uploads = [];
  edits = [];
  emails = [];
  const conv = (id: string, chatId: string) => ({ id, chatId, meta: {}, dealId: "deal-1", clientId: null, assigneeId: "lena", contactName: "Айгерим", channel: "whatsapp" });
  fake.sales = { deals: { findById: async () => ({ id: "deal-1", contactPhone: "77011234567", extraPhones: ["77071112233"] }) } };
  fake.marketing = { service: { shopWhatsapp: async () => SHOP } };
  fake.messaging = {
    queries: {
      conversation: async (id: string) => (id === CONV ? conv(CONV, "77011234567") : id === OTHER ? conv(OTHER, "77029998877") : null),
      messageConversation: async () => CONV,
    },
    sendUpload: async (_c: string, _f: unknown, caption: string) => (uploads.push({ caption }), { id: "m1", status: "sent" }),
    chats: { editMessage: async (_c: string, _m: string, text: string) => void edits.push(text) },
    forward: async () => Promise.reject(new MessageActionError("В сообщении номер телефона — переслать его нельзя. Оплата — только через счёт или ссылку из CRM, контакты клиента — через CRM.")),
    email: { sendToContact: async (input: { text: string }) => (emails.push(input.text), { ok: true, conversationId: CONV }) },
  };
  fake.clients = { contact: async () => ({ email: "a@b.kz", phone: "77011234567", assigneeId: "lena", dealId: "deal-1", clientId: null, name: "Айгерим" }) };
});

const upload = (caption: string) => {
  const f = new FormData();
  f.append("files", new File([Uint8Array.from([1, 2, 3])], "primer.jpg", { type: "image/jpeg" }));
  f.append("files", new File([Uint8Array.from([4, 5, 6])], "primer2.jpg", { type: "image/jpeg" }));
  f.set("caption", caption);
  return sendFiles(new Request(`http://localhost/api/admin/chats/${CONV}/files`, { method: "POST", body: f }), { params: Promise.resolve({ id: CONV }) }).then(async (res) => ({ status: res.status, body: (await res.json()) as { error?: string; code?: string } }));
};

describe("подпись к файлу", () => {
  it("карта или чужой номер в подписи — 400 с объяснением, не уходит ни один файл", async () => {
    const r = await upload("Оплата на карту 4111 1111 1111 1111");
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ code: "sensitiveCaption", error: expect.stringContaining("В подписи номер карты. Оплата — только через счёт или ссылку из CRM") });
    expect((await upload("Звоните курьеру +7 702 999 88 77")).status).toBe(400);
    expect(uploads).toEqual([]);
  });

  it("номер клиента, его второй номер из сделки и номер магазина — можно; подпись — к первому файлу", async () => {
    const r = await upload("Ваш +7 701 123 45 67 и +7 707 111 22 33, наш WhatsApp +7 700 555 66 77");
    expect(r.status).toBe(200);
    expect(uploads.map((u) => u.caption)).toEqual(["Ваш +7 701 123 45 67 и +7 707 111 22 33, наш WhatsApp +7 700 555 66 77", ""]);
  });
});

describe("правка, пересылка и письмо", () => {
  it("правка: номер магазина и сделки — можно (раньше проверка ругалась), чужая карта — нельзя", async () => {
    expect(await editMessageAction(CONV, MSG, "Наш WhatsApp +7 700 555 66 77, ваш второй +7 707 111 22 33")).toEqual({ ok: true });
    expect(await editMessageAction(CONV, MSG, "Карта 4111 1111 1111 1111")).toEqual({ error: "В тексте номер, карта или реквизиты — так менять нельзя" });
    expect(edits).toHaveLength(1);
  });

  it("пересылка: отказ сервиса (реквизиты для получателя) — текстом, без отправки", async () => {
    expect(await forwardMessageAction(CONV, MSG, [OTHER])).toEqual({ error: expect.stringContaining("переслать его нельзя") });
  });

  it("письмо из карточки: IBAN или ссылка на перевод Kaspi — не уходит; номер клиента и магазина — уходит", async () => {
    expect(await sendEmailAction({ dealId: "0d0d0d0d-0000-4000-8000-000000000001" }, "Оплата", "Реквизиты: KZ12 3456 7890 1234 5678")).toEqual({ ok: false, message: "В письме IBAN. Оплата — только через счёт или ссылку из CRM, контакты клиента — через CRM." });
    expect((await sendEmailAction({ dealId: "0d0d0d0d-0000-4000-8000-000000000001" }, "https://kaspi.kz/pay/x", "Оплата по ссылке")).ok).toBe(false);
    expect(await sendEmailAction({ dealId: "0d0d0d0d-0000-4000-8000-000000000001" }, "Книга", "Перезвоним на +7 701 123 45 67, наш +7 700 555 66 77")).toMatchObject({ ok: true });
    expect(emails).toEqual(["Перезвоним на +7 701 123 45 67, наш +7 700 555 66 77"]);
  });
});
