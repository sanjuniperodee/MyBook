import type { FactoryProvider } from "@nestjs/common";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { StaffContext } from "@/modules/access/domain/StaffContext";
import { BoardsError } from "@/modules/boards";
import { isPhoneEmail } from "@/modules/identity";
import { GowaError, MediaUnavailableError, MessageActionError, type Attachment, type BotMaterial, type Conversation } from "@/modules/messaging";
import { SupportError } from "@/modules/support";
import type { LiveEvent } from "@/modules/workspace";
import { allPermissions, type Permission } from "@/shared/domain/permissions";
import { STAFF_ACCESS, type StaffAccessPort } from "../src/core/auth/staff";
import { loadConfig } from "../src/core/config/app-config";
import { CRM_SITE_PORTS, type CrmSitePorts } from "../src/modules/crm-site/crm-site.tokens";
import { bootTestApp, sessionOf, testUser } from "./app";

const ORIGIN = loadConfig().appUrl;
const FIXED_NOW = new Date("2026-11-26T10:00:00.000Z");

const OWNER = testUser("11111111-1111-4111-8111-111111111111", { name: "Айгерим", email: "owner@mybooks.kz", phone: "+77011112233", role: "admin" });
const SALES = testUser("22222222-2222-4222-8222-222222222222", { name: "Данияр", email: "sales@mybooks.kz", phone: "+77012223344", role: "admin" });
const NO_PERMS = testUser("33333333-3333-4333-8333-333333333333", { name: "Стажёр", email: "intern@mybooks.kz", role: "admin" });
const ALL_USERS = [OWNER, SALES, NO_PERMS];

const CHAT_ID = "aaaa1111-1111-4111-8111-111111111111";
const OTHER_CHAT_ID = "aaaa2222-2222-4222-8222-222222222222";
const MSG_ID = "bbbb1111-1111-4111-8111-111111111111";
const DEAL_ID = "cccc1111-1111-4111-8111-111111111111";
const TASK_ID = "dddd1111-1111-4111-8111-111111111111";
const ATT_ID = "eeee1111-1111-4111-8111-111111111111";
const TICKET_ID = "ffff1111-1111-4111-8111-111111111111";
const ORDER_ID = "99991111-1111-4111-8111-111111111111";
const BOOK_ID = "88881111-1111-4111-8111-111111111111";
const BOARD_ID = "66661111-1111-4111-8111-111111111111";
const NOTIF_ID = "77771111-1111-4111-8111-111111111111";
const MAT_ID = "mat12345";

const makeCtx = (id: string, roleName: string, scope: "all" | "own", perms: readonly Permission[], isOwner = false) =>
  new StaffContext(id, roleName, isOwner ? "owner" : null, scope, new Set(perms), isOwner, { isPhoneEmail });

function resolveStaffSync(user: typeof OWNER) {
  if (user.role !== "admin" || user.staffDisabled) return null;
  if (user.id === OWNER.id) return makeCtx(user.id, "Руководитель", "all", allPermissions, true);
  if (user.id === SALES.id) return makeCtx(user.id, "Менеджер", "own", ["chats.view", "chats.send", "analytics.view"]);
  if (user.id === NO_PERMS.id) return makeCtx(user.id, "Стажёр", "own", []);
  return null;
}

const staffAccess: StaffAccessPort = {
  async resolve(user) {
    const context = resolveStaffSync(user);
    return context ? { context, gate: null } : null;
  },
};

function makeConv(id: string, assigneeId: string | null): Conversation {
  return {
    id,
    channel: "whatsapp",
    channelId: "gowa",
    chatId: "77019998877",
    contactName: "Асель",
    avatarUrl: null,
    clientId: null,
    dealId: DEAL_ID,
    assigneeId,
    botStep: null,
    awaitingSince: FIXED_NOW,
    lastMessageAt: FIXED_NOW,
    status: "open",
    meta: { phone: "+77019998877" },
  };
}

const sampleMaterial: BotMaterial = {
  id: MAT_ID,
  kind: "image",
  key: "bot-media/mat.jpg",
  name: "пример книги.jpg",
  mime: "image/jpeg",
  size: 4,
  caption: "Пример",
  lang: "ru",
  about: "Обложка",
  on: true,
};

const shared = vi.hoisted(() => ({
  nextHeadersHits: 0,
  afterHits: 0,
  mediaMode: "ok" as "ok" | "gowa" | "unavailable",
  sensitiveBlock: false,
  convertAudioOk: true,
  boardError: false,
  supportError: false,
  liveListeners: [] as Array<(e: LiveEvent) => void>,
}));

vi.mock("@/shared/infrastructure/http/request", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/shared/infrastructure/http/request")>();
  return {
    ...real,
    headers: async () => {
      shared.nextHeadersHits++;
      return real.headers();
    },
    cookies: async () => {
      shared.nextHeadersHits++;
      return real.cookies();
    },
    after: (fn: () => unknown) => {
      shared.afterHits++;
      return real.after(fn);
    },
  };
});

vi.mock("@/server/auth", async () => {
  const shim = await import("@/shared/infrastructure/http/request");
  const { legacyRequestContext } = await import("@/server/request-context");
  return {
    getCurrentUser: async () => {
      const ctx = legacyRequestContext();
      if (ctx) return ctx.user;
      const jar = await shim.cookies();
      const hdrs = await shim.headers();
      const bearer = hdrs.get("authorization")?.match(/^Bearer ([A-Za-z0-9_-]{20,200})$/)?.[1] ?? null;
      const tok = jar.get("mb_session")?.value ?? bearer;
      return tok ? ALL_USERS.find((u) => sessionOf(u) === tok) ?? null : null;
    },
  };
});

vi.mock("@/server/access", async (orig) => {
  const actual = await orig<typeof import("@/server/access")>();
  const { legacyRequestContext } = await import("@/server/request-context");
  const auth = await import("@/server/auth");
  const getStaff = async () => {
    const ctx = legacyRequestContext();
    if (ctx) return ctx.gate ? null : ctx.staff;
    const u = await auth.getCurrentUser();
    if (!u) return null;
    const context = resolveStaffSync(u);
    if (!context) return null;
    return {
      user: u,
      roleName: context.roleName,
      roleKey: context.roleKey,
      scope: context.scope,
      permissions: context.permissions,
      isOwner: context.isOwner,
      context,
    };
  };
  return {
    ...actual,
    getStaff,
    assertStaff: async (...perms: Permission[]) => {
      const staff = await getStaff();
      if (!staff || !staff.context.can(...perms)) throw new actual.ForbiddenError();
      return staff;
    },
    canSeeOrder: async (staff: { scope: string }, orderId: string) => orderId === ORDER_ID && staff.scope === "all",
    audit: async () => {},
  };
});

vi.mock("@/server/crm-ops/registry", async () => {
  const { assertStaff } = await import("@/server/access");
  return {
    runCrmOp: async (name: string, args: unknown) => {
      await assertStaff("chats.view");
      return [{ op: name, args }];
    },
  };
});

vi.mock("@/server/audio-convert", () => ({
  convertAudio: async () => (shared.convertAudioOk ? { data: new Uint8Array([1, 2, 3]), mime: "audio/ogg" } : null),
}));

vi.mock("@/server/sensitive", async () => {
  const { sensitiveWhat } = await import("@/modules/messaging");
  return {
    sensitiveFor: async () => (shared.sensitiveBlock ? [{ kind: "card", value: "4400" }] : []),
    sensitiveWhat,
  };
});

vi.mock("@/server/range-file", () => ({
  serveStorageFile: async (key: string, mime: string, req: Request, headers: Record<string, string>) => {
    if (key.includes("missing")) return null;
    const range = req.headers.get("range");
    if (range === "bytes=0-3") {
      return new Response("PART", {
        status: 206,
        headers: { "Content-Type": mime, "Accept-Ranges": "bytes", "Content-Range": "bytes 0-3/8", ...headers },
      });
    }
    return new Response(`FILE:${key}`, { headers: { "Content-Type": mime, "Accept-Ranges": "bytes", ...headers } });
  },
}));

vi.mock("@/modules/workspace", async (orig) => {
  const actual = await orig<typeof import("@/modules/workspace")>();
  return {
    ...actual,
    subscribe: async (fn: (e: LiveEvent) => void) => {
      shared.liveListeners.push(fn);
      return () => {
        const i = shared.liveListeners.indexOf(fn);
        if (i >= 0) shared.liveListeners.splice(i, 1);
      };
    },
    syncMobileBadge: async () => {},
    vapidKeys: async () => ({ publicKey: "PARITY-VAPID-KEY" }),
    getSetting: async (key: string) => (key === "finance.fees" ? JSON.stringify({ kaspi: 0.015 }) : key === "finance.taxRate" ? "0.03" : null),
  };
});

const mockContainer = {
  messaging: {
    queries: {
      conversation: async (id: string) => {
        if (id === CHAT_ID) return makeConv(CHAT_ID, SALES.id);
        if (id === OTHER_CHAT_ID) return makeConv(OTHER_CHAT_ID, OWNER.id);
        return null;
      },
    },
    view: {
      messages: async (convId: string, limit: number, before?: Date) => [
        {
          id: MSG_ID,
          direction: "in",
          type: "text",
          text: `${convId}:${limit}:${before?.toISOString() ?? ""}`,
          mediaUrl: null,
          transcript: null,
          gateway: false,
          status: "delivered",
          error: null,
          internal: false,
          edited: false,
          deleted: false,
          author: null,
          authorId: null,
          replyTo: null,
          at: FIXED_NOW.toISOString(),
        },
      ],
    },
    sendUpload: async (_convId: string, file: { name: string }, caption: string) => {
      if (file.name === "fail.bin") throw new MessageActionError("Неподдерживаемый файл");
      return { id: MSG_ID, status: "sent", error: caption === "warn" ? "retry" : null };
    },
    media: {
      find: async (id: string): Promise<Attachment | null> =>
        id === MSG_ID
          ? {
              message: { id: MSG_ID, conversationId: OTHER_CHAT_ID, externalId: "ext-1", type: "audio", mediaUrl: "store:m1" },
              conversation: makeConv(OTHER_CHAT_ID, OWNER.id),
            }
          : null,
      open: async (_att: Attachment, range: string | null) => {
        if (shared.mediaMode === "gowa") throw new GowaError("gateway err", null, 502);
        if (shared.mediaMode === "unavailable") throw new MediaUnavailableError();
        return {
          body: new ReadableStream<Uint8Array>({
            start(c) {
              c.enqueue(new TextEncoder().encode(range ? "PART" : "MEDIA-BODY"));
              c.close();
            },
          }),
          contentType: "audio/ogg",
          size: range ? "4" : "10",
          range: range ? "bytes 0-3/10" : null,
        };
      },
    },
    addMaterial: async (file: { name: string }, meta: { caption: string; lang: "any" | "ru" | "kk"; about: string }) => {
      if (file.name.endsWith(".ogg")) throw new MessageActionError("Голосовые нельзя");
      return { ...sampleMaterial, name: file.name, caption: meta.caption, lang: meta.lang, about: meta.about };
    },
    materialFile: async (id: string) => (id === MAT_ID ? { data: new Uint8Array([1, 2, 3, 4]), material: sampleMaterial } : null),
    gowa: {
      catalogImage: async (url: string) => (url.includes("ok") ? { data: new Uint8Array([9, 8, 7]), mime: "image/jpeg" } : null),
    },
    catalog: {
      image: async (id: string) => (id === "555" ? { data: new Uint8Array([6, 5, 4]), mime: "image/webp" } : null),
    },
  },
  sales: {
    deals: {
      findById: async (id: string) => (id === DEAL_ID ? { assigneeId: SALES.id } : null),
    },
  },
  boards: {
    boards: {
      list: async () => [{ id: BOARD_ID, name: "Производство" }],
      templates: () => [{ key: "sales", name: "Продажи" }],
      create: async () => BOARD_ID,
      view: async (_v: unknown, id: string) => ({ id, columns: [], cards: [] }),
      update: async () => {},
      archive: async () => {},
      reorderBoards: async () => {},
      views: async () => [],
      saveView: async () => BOARD_ID,
      deleteView: async () => {},
      addColumn: async () => BOARD_ID,
      updateColumn: async () => {},
      moveColumn: async () => {},
      deleteColumn: async () => {},
      addLabel: async () => BOARD_ID,
      updateLabel: async () => {},
      deleteLabel: async () => {},
      setMember: async () => {},
      addRule: async () => BOARD_ID,
      updateRule: async () => {},
      deleteRule: async () => {},
    },
    cards: {
      create: async () => TASK_ID,
      summary: async (_v: unknown, id: string) => ({ id, title: "Карточка" }),
      detail: async (_v: unknown, id: string) => ({ id, title: "Карточка", comments: [] }),
      update: async () => {},
      remove: async () => {},
      move: async () => {},
      setDone: async () => {},
      archive: async () => {},
      duplicate: async () => TASK_ID,
      setAssignees: async () => {},
      setWatching: async () => {},
      setLabel: async () => {},
      addChecklist: async () => TASK_ID,
      renameChecklist: async () => {},
      deleteChecklist: async () => {},
      addItem: async () => TASK_ID,
      updateItem: async () => {},
      deleteItem: async () => {},
      comment: async () => TASK_ID,
      editComment: async () => {},
      deleteComment: async () => {},
      attach: async (_v: unknown, _cardId: string, file: { name: string }) => `att:${file.name}`,
      detach: async () => {},
      bulk: async () => ({ ok: 1 }),
      file: async (_v: unknown, cardId: string, attId: string) => {
        if (shared.boardError) throw new BoardsError("forbidden", "Нет прав на карточку");
        if (cardId !== TASK_ID || attId !== ATT_ID) throw new BoardsError("notFound", "Не найдено");
        return { storageKey: "boards/a.pdf", name: "файл.pdf", mime: "application/pdf" };
      },
    },
    calendar: {
      feedStatus: async () => ({ enabled: true, url: `${ORIGIN}/api/calendar/tok` }),
      issueFeed: async () => `${ORIGIN}/api/calendar/tok`,
      revokeFeed: async () => {},
      range: async () => [],
    },
    google: {
      status: async () => ({ connected: false }),
      disconnect: async () => {},
      syncOne: async () => 0,
    },
    openFile: async () => null,
  },
  support: {
    tickets: {
      create: async (input: { notifyPhone: string }) => {
        if (shared.supportError) throw new SupportError("invalid", "Опишите проблему подробнее");
        return { id: TICKET_ID, number: 99, notifyPhone: input.notifyPhone || "+77011112233" };
      },
      linkChat: async () => ({ id: TICKET_ID }),
      process: async () => null,
      byId: async (id: string) => (id === TICKET_ID ? { id: TICKET_ID, createdBy: SALES.id } : null),
      released: async (input: { release: string; commits: Array<{ sha: string }> }) => [
        { number: 99, release: input.release, count: input.commits.length },
      ],
    },
    attachment: async (id: string, att: string) =>
      id === TICKET_ID && att === "1-abc" ? { id: "1-abc", key: "support/s1.png", name: "скрин.png", mime: "image/png", size: 4, kind: "image" } : null,
    openAttachment: async () => null,
  },
  reporting: {
    live: async () => ({
      counters: { attention: 1, tasks: 2, chats: 3, calls: 0, deals: 4, reviews: 0, finance: 1 },
      unread: 5,
      notifications: [],
      ringing: [],
    }),
    clients: async () => ({
      rows: [
        {
          user: {
            id: "u-c1",
            name: "Асель",
            email: "asel@example.kz",
            phone: "+77010001122",
            tags: ["vip"],
            createdAt: FIXED_NOW,
            lastSeenAt: FIXED_NOW,
            managerId: SALES.id,
            source: { source: "instagram", medium: "cpc" },
          },
          booksCount: 2,
          bestAnswered: 15,
          bestWords: 0,
          ordersCount: 1,
          ltv: 29000,
          lastOrderAt: FIXED_NOW,
          occasion: "birthday",
          lastBookUpdate: FIXED_NOW,
        },
      ],
      total: 1,
    }),
    expenses: async () => [
      {
        id: "e1",
        source: "expense" as const,
        day: "2026-11-20",
        category: "print",
        title: "Печать",
        amount: 12000,
        quantity: 1,
        note: "",
        channel: null,
        createdById: OWNER.id,
        createdAt: FIXED_NOW,
      },
    ],
    finance: async () => ({ money: [], deals: [], orders: [], unrecorded: [], review: [], resolutions: [] }),
    leadStats: async () => ({ deals: [], payments: [], invoices: [], spend: [{ day: "2026-11-20", amount: 4000 }] }),
    orderExport: async () => [
      {
        number: 1042,
        createdAt: FIXED_NOW,
        paidAt: FIXED_NOW,
        status: "paid",
        plan: "hardcover",
        quantity: 1,
        itemsAmount: 29000,
        discountAmount: 0,
        promoCode: null,
        deliveryAmount: 2000,
        amount: 31000,
        currency: "KZT",
        contactName: "Асель",
        contactPhone: "+77010001122",
        contactEmail: "asel@example.kz",
        deliveryMethod: "courier",
        deliveryCountry: "KZ",
        city: "Алматы",
        address: "Абая 1",
        postalCode: "050000",
        desiredDate: "2026-12-01",
        trackingNumber: null,
        customerComment: null,
      },
    ],
    paymentsExport: async () => [
      {
        at: FIXED_NOW,
        amount: 29000,
        kind: "order" as const,
        type: "kaspi",
        ref: "№1042",
        client: "Асель",
        phone: "+77010001122",
        manager: "Данияр",
        receipt: "да",
      },
    ],
    profit: async () => ({
      money: [],
      expenses: [],
      counts: { leads: 2, buyers: 1, buyersFirstSum: 29000, buyersAgreed: 29000, orders: 1, books: 1 },
      prevCounts: { leads: 1, buyers: 0, buyersFirstSum: 0, buyersAgreed: 0, orders: 0, books: 0 },
      forms: {},
    }),
    salesRegister: async () => [],
    vcardClients: async () => [
      { id: "u-c1", name: "Асель", phone: "+77010001122", extra_phones: ["+77010001133"], deal_number: 7, occasion: "birthday" },
    ],
  },
  ordering: {
    queries: {
      orderDetails: async (id: string) =>
        id === ORDER_ID ? { id: ORDER_ID, bookId: BOOK_ID, number: 1042, plan: "hardcover", quantity: 1 } : null,
    },
  },
  printFiles: {
    prepare: async () => null,
    getFile: async (_job: unknown, kind: string) => Buffer.from(`PRINT:${kind}`),
  },
  workspace: {
    inbox: {
      markRead: async () => {},
      subscribe: async () => {},
      unsubscribe: async () => {},
    },
  },
  access: {
    queries: {
      allStaff: async () => [
        { id: OWNER.id, name: "Айгерим", email: "owner@mybooks.kz" },
        { id: SALES.id, name: "Данияр", email: "sales@mybooks.kz" },
      ],
    },
  },
};

vi.mock("@/server/container", () => ({
  container: () => mockContainer,
}));

const { assertRoute } = await import("./expected");
const { legacyCrmSitePorts } = await import("../src/legacy/crm-site.ports");
const { releaseToken } = await import("@/server/support-release");

const asOwner = { cookie: `mb_session=${sessionOf(OWNER)}`, origin: ORIGIN };
const asSales = { cookie: `mb_session=${sessionOf(SALES)}`, origin: ORIGIN };
const asNoPerms = { cookie: `mb_session=${sessionOf(NO_PERMS)}`, origin: ORIGIN };

function makeMultipart(parts: Array<{ name: string; value?: string; filename?: string; contentType?: string; content?: string }>) {
  const boundary = "----mb-parity-crm-site";
  const body = parts
    .map((p) =>
      p.filename !== undefined
        ? `--${boundary}\r\nContent-Disposition: form-data; name="${p.name}"; filename="${p.filename}"\r\nContent-Type: ${p.contentType ?? "application/octet-stream"}\r\n\r\n${p.content ?? ""}\r\n`
        : `--${boundary}\r\nContent-Disposition: form-data; name="${p.name}"\r\n\r\n${p.value ?? ""}\r\n`,
    )
    .join("")
    .concat(`--${boundary}--\r\n`);
  return { contentType: `multipart/form-data; boundary=${boundary}`, body };
}

describe("ответы Nest байт в байт (эталон — прежний mybook-api): 28 маршрутов сайта CRM (Контекст 5B)", () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    vi.useFakeTimers({ now: FIXED_NOW, toFake: ["Date"] });
    // Используем настоящий адаптер `legacyCrmSitePorts` с подменённым контейнером — проверяем его вместе с контроллерами.
    const realPorts = (legacyCrmSitePorts as FactoryProvider<CrmSitePorts>).useFactory(mockContainer);
    ({ app } = await bootTestApp({
      users: ALL_USERS,
      overrides: [
        [STAFF_ACCESS, staffAccess],
        [CRM_SITE_PORTS, realPorts],
      ],
    }));
  });

  afterAll(async () => {
    vi.useRealTimers();
    await app.close();
  });

  beforeEach(() => {
    shared.nextHeadersHits = 0;
    shared.afterHits = 0;
    shared.mediaMode = "ok";
    shared.sensitiveBlock = false;
    shared.convertAudioOk = true;
    shared.boardError = false;
    shared.supportError = false;
    shared.liveListeners.length = 0;
  });

  it("паритет: 7 маршрутов чатов и материалов бота", async () => {
    await assertRoute({ nest: app, method: "GET", url: "/api/admin/chats/inbox?f=open&q=test", headers: asSales });
    await assertRoute({ nest: app, method: "GET", url: "/api/v1/site/admin/chats/inbox", headers: asNoPerms });
    await assertRoute({ nest: app, method: "POST", url: "/api/admin/chats/inbox", headers: asOwner });

    const mpFile = makeMultipart([
      { name: "files", filename: "a.jpg", contentType: "image/jpeg", content: "IMG" },
      { name: "caption", value: "Вот фото" },
    ]);
    await assertRoute({
      nest: app,
      method: "POST",
      url: `/api/admin/chats/${CHAT_ID}/files`,
      headers: { ...asSales, "content-type": mpFile.contentType },
      body: mpFile.body,
    });
    shared.sensitiveBlock = true;
    await assertRoute({
      nest: app,
      method: "POST",
      url: `/api/admin/chats/${CHAT_ID}/files`,
      headers: { ...asSales, "content-type": mpFile.contentType },
      body: mpFile.body,
    });
    shared.sensitiveBlock = false;
    await assertRoute({
      nest: app,
      method: "POST",
      url: `/api/admin/chats/${OTHER_CHAT_ID}/files`,
      headers: { ...asSales, "content-type": mpFile.contentType },
      body: mpFile.body,
    });

    await assertRoute({ nest: app, method: "GET", url: `/api/admin/chats/${CHAT_ID}/messages?limit=30`, headers: asSales });
    await assertRoute({ nest: app, method: "GET", url: `/api/admin/chats/${OTHER_CHAT_ID}/messages`, headers: asSales });
    await assertRoute({ nest: app, method: "GET", url: "/api/admin/chats/bad/messages", headers: asSales });

    const mpVoice = makeMultipart([{ name: "voice", filename: "v.webm", contentType: "audio/webm", content: "WAV" }]);
    await assertRoute({
      nest: app,
      method: "POST",
      url: `/api/admin/chats/${CHAT_ID}/voice`,
      headers: { ...asSales, "content-type": mpVoice.contentType },
      body: mpVoice.body,
    });
    const mpEmptyVoice = makeMultipart([{ name: "replyToId", value: MSG_ID }]);
    await assertRoute({
      nest: app,
      method: "POST",
      url: `/api/admin/chats/${CHAT_ID}/voice`,
      headers: { ...asSales, "content-type": mpEmptyVoice.contentType },
      body: mpEmptyVoice.body,
    });

    const media = await assertRoute({
      nest: app,
      method: "GET",
      url: `/api/admin/chats/messages/${MSG_ID}/media`,
      headers: { ...asSales, range: "bytes=0-3" },
    });
    shared.mediaMode = "gowa";
    await assertRoute({ nest: app, method: "GET", url: `/api/admin/chats/messages/${MSG_ID}/media`, headers: asOwner });
    shared.mediaMode = "ok";

    const mpMat = makeMultipart([
      { name: "file", filename: "book.jpg", contentType: "image/jpeg", content: "JPG" },
      { name: "caption", value: "Пример" },
      { name: "lang", value: "ru" },
    ]);
    await assertRoute({
      nest: app,
      method: "POST",
      url: "/api/admin/bot/materials",
      headers: { ...asOwner, "content-type": mpMat.contentType },
      body: mpMat.body,
    });
    await assertRoute({ nest: app, method: "POST", url: "/api/admin/bot/materials", headers: asSales });

    const matPreview = await assertRoute({ nest: app, method: "GET", url: `/api/admin/bot/materials/${MAT_ID}`, headers: asOwner });
    await assertRoute({ nest: app, method: "GET", url: "/api/admin/bot/materials/nope", headers: asOwner });
  });

  it("паритет: 5 маршрутов досок, вложений задач и поддержки (включая НОЛЬ next/headers и after() в Nest)", async () => {
    // Проверяем, что запросы в NestJS вообще не трогают next/headers и after().
    shared.nextHeadersHits = 0;
    shared.afterHits = 0;
    const nestBoardOnly = await app.inject({ method: "GET", url: "/api/admin/boards", headers: asOwner });
    expect(nestBoardOnly.statusCode).toBe(200);
    const supMp = makeMultipart([
      { name: "kind", value: "bug" },
      { name: "description", value: "Описание" },
      { name: "conversationId", value: CHAT_ID },
      { name: "messageIds", value: JSON.stringify([MSG_ID]) },
    ]);
    const nestSupOnly = await app.inject({
      method: "POST",
      url: "/api/admin/support",
      headers: { ...asSales, "content-type": supMp.contentType },
      payload: supMp.body,
    });
    expect(nestSupOnly.statusCode).toBe(200);
    expect(shared.nextHeadersHits).toBe(0);
    expect(shared.afterHits).toBe(0);

    // Побайтовый паритет всех 5 методов /api/admin/boards/{path*}
    await assertRoute({ nest: app, method: "GET", url: "/api/admin/boards", headers: asOwner });
    await assertRoute({ nest: app, method: "GET", url: `/api/v1/site/admin/boards/${BOARD_ID}?done=1`, headers: asOwner });
    await assertRoute({ nest: app, method: "POST", url: "/api/admin/boards", headers: asOwner, body: { name: "Новая" } });
    await assertRoute({ nest: app, method: "PATCH", url: `/api/admin/boards/columns/${BOARD_ID}`, headers: asOwner, body: { name: "Колонка" } });
    await assertRoute({ nest: app, method: "PUT", url: `/api/admin/boards/cards/${TASK_ID}/watch`, headers: asOwner, body: { on: true } });
    await assertRoute({ nest: app, method: "DELETE", url: `/api/admin/boards/views/${BOARD_ID}`, headers: asOwner });
    const cardMp = makeMultipart([{ name: "file", filename: "note.txt", contentType: "text/plain", content: "TXT" }]);
    await assertRoute({
      nest: app,
      method: "POST",
      url: `/api/admin/boards/cards/${TASK_ID}/files`,
      headers: { ...asOwner, "content-type": cardMp.contentType },
      body: cardMp.body,
    });
    await assertRoute({ nest: app, method: "GET", url: "/api/admin/boards/unknown/path", headers: asOwner });

    // Вложения задач
    const tAtt = await assertRoute({
      nest: app,
      method: "GET",
      url: `/api/admin/tasks/${TASK_ID}/files/${ATT_ID}?download=1`,
      headers: { ...asOwner, range: "bytes=0-3" },
    });
    shared.boardError = true;
    await assertRoute({ nest: app, method: "GET", url: `/api/admin/tasks/${TASK_ID}/files/${ATT_ID}`, headers: asOwner });
    shared.boardError = false;

    // Поддержка (POST + GET file + POST release)
    await assertRoute({
      nest: app,
      method: "POST",
      url: "/api/admin/support",
      headers: { ...asSales, "content-type": supMp.contentType },
      body: supMp.body,
    });
    shared.supportError = true;
    await assertRoute({
      nest: app,
      method: "POST",
      url: "/api/admin/support",
      headers: { ...asSales, "content-type": supMp.contentType },
      body: supMp.body,
    });
    shared.supportError = false;

    const sAtt = await assertRoute({
      nest: app,
      method: "GET",
      url: `/api/admin/support/${TICKET_ID}/files/1-abc?download=1`,
      headers: asSales,
    });
    await assertRoute({ nest: app, method: "GET", url: `/api/admin/support/${TICKET_ID}/files/1-abc`, headers: asNoPerms });

    const validToken = releaseToken();
    await assertRoute({
      nest: app,
      method: "POST",
      url: "/api/support/release",
      headers: { "x-release-token": validToken },
      body: { release: "v2", commits: [{ sha: "abcdef1", subject: "Обращение №99" }] },
    });
    await assertRoute({
      nest: app,
      method: "POST",
      url: "/api/support/release",
      headers: { "x-release-token": "bad-token" },
      body: { release: "v2", commits: [] },
    });
    await assertRoute({
      nest: app,
      method: "POST",
      url: "/api/support/release",
      headers: { "x-release-token": validToken },
      body: { release: "v2", commits: [{ sha: "bad", subject: "x" }] },
    });
  });

  it("паритет: каталог (2), live/SSE, уведомления, push и ZIP-пакет заказа (5)", async () => {
    await assertRoute({
      nest: app,
      method: "GET",
      url: "/api/admin/catalog/photo?u=https%3A%2F%2Fmmg.whatsapp.net%2Fok.jpg",
      headers: asOwner,
    });
    await assertRoute({
      nest: app,
      method: "GET",
      url: "/api/admin/catalog/photo?u=https%3A%2F%2Fbad.example%2Fa.jpg",
      headers: asOwner,
    });
    await assertRoute({ nest: app, method: "GET", url: "/api/admin/catalog/555/image", headers: asSales });
    await assertRoute({ nest: app, method: "GET", url: "/api/admin/catalog/555/image", headers: asNoPerms });
    await assertRoute({ nest: app, method: "GET", url: "/api/admin/catalog/abc/image", headers: asOwner });

    await assertRoute({ nest: app, method: "GET", url: "/api/admin/live", headers: asSales });
    await assertRoute({ nest: app, method: "POST", url: "/api/admin/live/stream", headers: asOwner });

    // SSE-поток live/stream: заголовки, retry и JSON события — как отдавал прежний mybook-api (записано 27.11).
    await app.listen(0, "127.0.0.1");
    const address = (await app.getUrl()).replace("[::1]", "127.0.0.1");
    const nestAc = new AbortController();
    const nestSse = await fetch(`${address}/api/admin/live/stream`, { headers: asSales, signal: nestAc.signal });
    const sseHead = { status: nestSse.status, type: nestSse.headers.get("content-type"), cache: nestSse.headers.get("cache-control"), buffering: nestSse.headers.get("x-accel-buffering") };
    const nestReader = nestSse.body!.getReader();
    const dec = new TextDecoder();
    expect(sseHead).toEqual({ status: 200, type: "text/event-stream; charset=utf-8", cache: "no-cache, no-transform", buffering: "no" });
    expect(dec.decode((await nestReader.read()).value)).toBe("retry: 5000\n\n");
    for (const fn of [...shared.liveListeners]) fn({ type: "chat", conversationId: CHAT_ID });
    expect(dec.decode((await nestReader.read()).value)).toBe(`data: ${JSON.stringify({ type: "chat", conversationId: CHAT_ID })}\n\n`);
    nestAc.abort();
    await nestReader.cancel().catch(() => {});

    await assertRoute({ nest: app, method: "POST", url: "/api/admin/notifications", headers: asSales, body: { id: NOTIF_ID } });
    await assertRoute({ nest: app, method: "POST", url: "/api/admin/notifications", headers: asSales });

    await assertRoute({ nest: app, method: "GET", url: "/api/admin/push", headers: asSales });
    await assertRoute({
      nest: app,
      method: "POST",
      url: "/api/admin/push",
      headers: asSales,
      body: { endpoint: "https://push.example/1", keys: { p256dh: "1234567890abcdef", auth: "abcd" } },
    });
    await assertRoute({
      nest: app,
      method: "DELETE",
      url: "/api/admin/push",
      headers: asSales,
      body: { endpoint: "https://push.example/1" },
    });
    await assertRoute({ nest: app, method: "PUT", url: "/api/admin/push", headers: asSales });

    const zip = await assertRoute({ nest: app, method: "GET", url: `/api/admin/orders/${ORDER_ID}/package`, headers: asOwner });
    await assertRoute({ nest: app, method: "GET", url: `/api/admin/orders/${ORDER_ID}/package`, headers: asSales });
  });

  it("паритет: все 9 экспортов CSV и vCard", async () => {
    const urls = [
      "/api/admin/export/clients?segment=vip",
      "/api/admin/export/expenses?p=month",
      "/api/admin/export/finance?p=month",
      "/api/admin/export/leads?p=month",
      "/api/admin/export/orders?status=paid",
      "/api/admin/export/payments?days=30",
      "/api/admin/export/profit?p=month",
      "/api/admin/export/sales?p=month",
      "/api/admin/export/vcard?since=2026-11-01",
    ];
    for (const url of urls) {
      const res = await assertRoute({ nest: app, method: "GET", url, headers: asOwner });
    }
    // Проверяем также роль «только свои» на экспортах аналитики (без finance.view — без колонок рекламы/комиссии)
    await assertRoute({ nest: app, method: "GET", url: "/api/admin/export/leads?p=month", headers: asSales });
    await assertRoute({ nest: app, method: "GET", url: "/api/admin/export/sales?p=month", headers: asSales });
    await assertRoute({ nest: app, method: "GET", url: "/api/admin/export/payments?days=30", headers: asSales });
  });
});
