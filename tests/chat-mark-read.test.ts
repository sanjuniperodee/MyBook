import { beforeEach, describe, expect, it, vi } from "vitest";
import { fake, lena, owner, resetContainer, resetRequest, signIn } from "./doubles/web";
import { withoutRead, type ChatListItem } from "@/components/admin/chat/inbox-model";

vi.mock("next/headers", async () => (await import("./doubles/web")).nextHeaders);
vi.mock("next/navigation", async () => (await import("./doubles/web")).nextNavigation);
vi.mock("next/cache", async () => (await import("./doubles/web")).nextCache);
vi.mock("@/server/container", async () => (await import("./doubles/web")).containerModule);
vi.mock("@/shared/infrastructure/database", () => ({ rootDb: {}, executor: () => ({}) }));
vi.mock("@/modules/workspace", () => ({ notify: async () => {}, notifyMentions: async () => {}, staffNotifier: { notifyAllWith: async () => {} }, listFields: async () => [], readFieldValues: () => ({}) }));

const { markReadAction } = await import("@/app/admin/chats/actions");

const CONV = "0d0d0d0d-0000-4000-8000-0000000000c1";

/**
 * Счётчик непрочитанного — у диалога, не у сотрудника: его снимает тот, кто может с диалогом работать, — ответственный или
 * роль «все записи». Ответы с телефона магазина записывают диалоги на того, у кого телефон; пока «прочитано» ставил
 * только он, у руководителя, читавшего эти чаты в CRM, непрочитанные копились (07.11.2026: 29 диалогов на одном сотруднике).
 */
describe("открытие диалога снимает «непрочитано»", () => {
  let assigneeId: string | null;
  let unread: number;
  let read: string[];

  beforeEach(() => {
    resetRequest();
    resetContainer();
    assigneeId = null;
    unread = 2;
    read = [];
    fake.messaging = {
      queries: { conversation: async () => ({ id: CONV, assigneeId, unread, contactName: "Айгерим", chatId: "77011234567", lastMessageText: "", dealId: null, meta: {} }) },
      chats: { markRead: async (id: string) => void read.push(id) },
    };
  });

  it("руководитель («все записи») открыл диалог, записанный на менеджера, — прочитано", async () => {
    signIn(owner);
    assigneeId = "margo";
    expect(await markReadAction(CONV)).toEqual({ read: true });
    expect(read).toEqual([CONV]);
  });

  it("руководитель открыл ничей диалог — прочитано", async () => {
    signIn(owner);
    await markReadAction(CONV);
    expect(read).toEqual([CONV]);
  });

  it("ответственный открыл свой — прочитано; уже прочитанный диалог сервер не трогает", async () => {
    signIn(lena);
    assigneeId = "lena";
    await markReadAction(CONV);
    expect(read).toEqual([CONV]);
    unread = 0;
    expect(await markReadAction(CONV)).toEqual({ read: true });
    expect(read).toEqual([CONV]);
  });

  it("менеджер «только свои»: ничей диалог только смотрит, чужой не видит", async () => {
    signIn(lena);
    expect(await markReadAction(CONV)).toEqual({ read: false });
    expect(read).toEqual([]);
    assigneeId = "margo";
    await expect(markReadAction(CONV)).rejects.toThrow();
    expect(read).toEqual([]);
  });
});

describe("строки списка после «прочитано»", () => {
  const row = (id: string, unread: number): ChatListItem => ({ id, title: id, avatarUrl: null, channel: "whatsapp", time: "10:00", preview: "", unread, assignee: null, waitMinutes: null, overdue: false, bot: false, pinned: false });

  it("прочитанные в этой вкладке — без счётчика, даже когда страница пришла из кэша роутера", () => {
    const items = [row("a", 2), row("b", 1), row("c", 0)];
    expect(withoutRead(items, new Set(["a", "c"])).map((c) => c.unread)).toEqual([0, 1, 0]);
    // Нечего прятать — те же строки (без лишней перерисовки).
    expect(withoutRead(items, new Set())).toBe(items);
    expect(withoutRead(items, new Set(["c"]))[2]).toBe(items[2]);
  });
});
