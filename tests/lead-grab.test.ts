import { beforeEach, describe, expect, it, vi } from "vitest";
import { fake, lena, owner, resetContainer, resetRequest, signIn } from "./doubles/web";

vi.mock("next/headers", async () => (await import("./doubles/web")).nextHeaders);
vi.mock("next/navigation", async () => (await import("./doubles/web")).nextNavigation);
vi.mock("next/cache", async () => (await import("./doubles/web")).nextCache);
vi.mock("@/server/container", async () => (await import("./doubles/web")).containerModule);
vi.mock("@/shared/infrastructure/database", () => ({ rootDb: {}, executor: () => ({}) }));
vi.mock("@/modules/workspace", () => ({ notify: async () => {}, notifyMentions: async () => {}, staffNotifier: { notifyAllWith: async () => {} }, listFields: async () => [], readFieldValues: () => ({}) }));

const { sendMessageAction, assignConversationAction, markReadAction } = await import("@/app/admin/chats/actions");
const { acceptDealAction, assignDealAction, moveDealAction, rejectDealAction } = await import("@/app/admin/deals/actions");

const CONV = "0d0d0d0d-0000-4000-8000-0000000000c1";
const DEAL = "0d0d0d0d-0000-4000-8000-0000000000d1";

/** Неразобранную заявку менеджер «только свои» видит, но не берёт себе: ни ответом, ни кнопкой, ни этапом. */
describe("Заявки раздаёт круг: менеджер не берёт ничьи себе", () => {
  let assigneeId: string | null;
  let sent: number;
  let read: number;
  let assigned: (string | null)[];

  beforeEach(() => {
    resetRequest();
    resetContainer();
    assigneeId = null;
    sent = 0;
    read = 0;
    assigned = [];
    const conv = () => ({ id: CONV, assigneeId, unread: 2, contactName: "Айгерим", chatId: "77011234567", lastMessageText: "", dealId: null, meta: {} });
    const deal = () => ({ id: DEAL, number: 5, title: "Заявка", assigneeId, clientId: null, unsorted: true });
    fake.messaging = {
      queries: { conversation: async () => conv() },
      chats: {
        send: async () => (sent++, { id: "m1", status: "sent" }),
        markRead: async () => void read++,
        assign: async (_id: string, to: string | null) => void assigned.push(to),
        assignDealConversations: async () => {},
      },
    };
    fake.sales = {
      deals: {
        findById: async () => deal(),
        acceptByStaff: async () => ({ ...deal(), assigneeId: assigneeId ?? "boss" }),
        assign: async (_id: string, to: string | null) => void assigned.push(to),
        stage: async () => ({ id: "s1", kind: "open" }),
        move: async () => null,
        note: async () => {},
      },
    };
    fake.marketing = { service: { shopWhatsapp: async () => "77000000000" } };
    fake.access = { ...fake.access, queries: { activeStaff: async (id: string) => ({ id, name: id, email: `${id}@b.kz` }) } };
  });

  it("ничья заявка: ответить, назначить себе, принять, двинуть — нельзя; «прочитано» за ответственного не ставится", async () => {
    signIn(lena);
    await expect(sendMessageAction(CONV, "Здравствуйте")).rejects.toThrow("Заявку распределяет круг");
    await expect(assignConversationAction(CONV, "0d0d0d0d-0000-4000-8000-00000000aaaa")).rejects.toThrow();
    await expect(acceptDealAction(DEAL)).rejects.toThrow("Заявку распределяет круг");
    await expect(assignDealAction(DEAL, "0d0d0d0d-0000-4000-8000-00000000aaaa")).rejects.toThrow();
    await expect(moveDealAction(DEAL, "0d0d0d0d-0000-4000-8000-0000000000e1")).rejects.toThrow("Заявку распределяет круг");
    await markReadAction(CONV);
    expect([sent, read, assigned]).toEqual([0, 0, []]);
  });

  it("спам: менеджер только предлагает (сделка не удаляется, номер не блокируется), руководитель — сразу", async () => {
    const calls: string[] = [];
    Object.assign(fake.sales.deals as object, {
      requestRejection: async (_id: string, kind: string) => void calls.push(`request:${kind}`),
      reject: async () => void calls.push("reject"),
    });
    Object.assign(fake.messaging.chats as object, { blockDealContacts: async () => void calls.push("block") });
    signIn(lena);
    assigneeId = "lena";
    expect(await rejectDealAction(DEAL, true, "реклама")).toMatchObject({ requested: true });
    expect(calls).toEqual(["request:spam"]);
    signIn(owner);
    expect(await rejectDealAction(DEAL, true)).toMatchObject({ requested: false });
    expect(calls).toEqual(["request:spam", "block", "reject"]);
  });

  it("чужой номер в сообщении не уходит без причины; с причиной — уходит", async () => {
    signIn(lena);
    assigneeId = "lena";
    expect(await sendMessageAction(CONV, "пишите мне +7 707 555 12 34")).toMatchObject({ blocked: expect.stringContaining("номер телефона") });
    expect(sent).toBe(0);
    await sendMessageAction(CONV, "пишите мне +7 707 555 12 34", "номер курьера");
    expect(sent).toBe(1);
  });

  it("своя заявка — работает; руководитель — с любой", async () => {
    signIn(lena);
    assigneeId = "lena";
    await sendMessageAction(CONV, "Здравствуйте");
    await markReadAction(CONV);
    expect([sent, read]).toEqual([1, 1]);
    signIn(owner);
    assigneeId = null;
    await sendMessageAction(CONV, "Здравствуйте");
    await assignDealAction(DEAL, "0d0d0d0d-0000-4000-8000-00000000aaaa");
    expect(sent).toBe(2);
    expect(assigned).toEqual(["0d0d0d0d-0000-4000-8000-00000000aaaa"]);
  });
});
