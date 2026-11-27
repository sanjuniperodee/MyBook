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
const NEED_2FA = testUser("44444444-4444-4444-8444-444444444444", { name: "Без2ФА", email: "no2fa@mybooks.kz", role: "admin" });
const REGULAR = testUser("55555555-5555-4555-8555-555555555555", { name: "Клиент", email: "client@example.kz", role: "user" });
const ALL_USERS = [OWNER, SALES, NO_PERMS, NEED_2FA, REGULAR];

const CHAT_ID = "aaaa1111-1111-4111-8111-111111111111";
const OTHER_CHAT_ID = "aaaa2222-2222-4222-8222-222222222222";
const MSG_ID = "bbbb1111-1111-4111-8111-111111111111";
const DEAL_ID = "cccc1111-1111-4111-8111-111111111111";
const TASK_ID = "dddd1111-1111-4111-8111-111111111111";
const ATT_ID = "eeee1111-1111-4111-8111-111111111111";
const TICKET_ID = "ffff1111-1111-4111-8111-111111111111";
const ORDER_ID = "99991111-1111-4111-8111-111111111111";
const BOOK_ID = "88881111-1111-4111-8111-111111111111";
const NOTIF_ID = "77771111-1111-4111-8111-111111111111";
const MAT_ID = "mat12345";

const asOwner = { cookie: `mb_session=${sessionOf(OWNER)}`, origin: ORIGIN };
const asSales = { cookie: `mb_session=${sessionOf(SALES)}`, origin: ORIGIN };
const asNoPerms = { cookie: `mb_session=${sessionOf(NO_PERMS)}`, origin: ORIGIN };
const asNeed2fa = { cookie: `mb_session=${sessionOf(NEED_2FA)}`, origin: ORIGIN };
const asRegular = { cookie: `mb_session=${sessionOf(REGULAR)}`, origin: ORIGIN };

const makeCtx = (id: string, roleName: string, scope: "all" | "own", perms: readonly Permission[], isOwner = false) =>
  new StaffContext(id, roleName, isOwner ? "owner" : null, scope, new Set(perms), isOwner, { isPhoneEmail });

const staffAccess: StaffAccessPort = {
  async resolve(user) {
    if (user.role !== "admin" || user.staffDisabled) return null;
    if (user.id === OWNER.id) return { context: makeCtx(user.id, "Руководитель", "all", allPermissions, true), gate: null };
    if (user.id === SALES.id) {
      return { context: makeCtx(user.id, "Менеджер", "own", ["chats.view", "chats.send", "analytics.view"]), gate: null };
    }
    if (user.id === NO_PERMS.id) return { context: makeCtx(user.id, "Стажёр", "own", []), gate: null };
    if (user.id === NEED_2FA.id) return { context: makeCtx(user.id, "Менеджер", "all", allPermissions, true), gate: "2fa" };
    return null;
  },
};

function makeConversation(id: string, assigneeId: string | null, dealId: string | null = DEAL_ID): Conversation {
  return {
    id,
    channel: "whatsapp",
    channelId: "gowa",
    chatId: "77019998877",
    contactName: "Асель",
    avatarUrl: null,
    clientId: null,
    dealId: dealId,
    assigneeId,
    botStep: null,
    awaitingSince: FIXED_NOW,
    lastMessageAt: FIXED_NOW,
    status: "open",
    meta: { phone: "+77019998877" },
  };
}

function buildMultipart(parts: Array<{ name: string; value?: string; filename?: string; contentType?: string; content?: string | Buffer }>) {
  const boundary = "----mb-crm-site-boundary";
  const chunks: Buffer[] = [];
  for (const p of parts) {
    if (p.filename !== undefined) {
      chunks.push(
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="${p.name}"; filename="${p.filename}"\r\nContent-Type: ${p.contentType ?? "application/octet-stream"}\r\n\r\n`,
          "utf8",
        ),
      );
      chunks.push(Buffer.isBuffer(p.content) ? p.content : Buffer.from(p.content ?? "", "utf8"));
      chunks.push(Buffer.from("\r\n", "utf8"));
    } else {
      chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${p.name}"\r\n\r\n${p.value ?? ""}\r\n`, "utf8"));
    }
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`, "utf8"));
  return { contentType: `multipart/form-data; boundary=${boundary}`, body: Buffer.concat(chunks) };
}

describe("Контекст 5B: 28 не-денежных маршрутов сайта CRM (@SiteRoute)", () => {
  let app: NestFastifyApplication;
  const auditCalls: Array<{ action: string; entity: string; details?: Record<string, unknown> }> = [];
  const scheduledTasks: Array<() => unknown> = [];
  const processedTickets: string[] = [];
  const boardCalls: Array<{ method: string; path: string[]; bodyText: string; hasFile: boolean }> = [];
  let mediaMode: "ok" | "range" | "gowa" | "unavailable" | "missing" = "ok";
  let sendUploadError: string | null = null;
  let sensitiveBlock = false;
  let audioConverted = true;
  let boardFileError: BoardsError | null = null;
  let supportCreateError: SupportError | null = null;
  let liveListener: ((e: LiveEvent) => void) | null = null;
  let liveUnsubscribed = 0;

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

  beforeAll(async () => {
    vi.useFakeTimers({ now: FIXED_NOW, toFake: ["Date"] });
    const ports: CrmSitePorts = {
      chatsInbox: async (_ctx, input) => [{ id: CHAT_ID, filter: input.f, q: input.q ?? null }],
      findConversation: async (id) => {
        if (id === CHAT_ID) return makeConversation(CHAT_ID, SALES.id);
        if (id === OTHER_CHAT_ID) return makeConversation(OTHER_CHAT_ID, OWNER.id, DEAL_ID);
        return null;
      },
      chatMessages: async (_convId, limit) => [
        {
          id: MSG_ID,
          direction: "in",
          type: "text",
          text: `limit=${limit}`,
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
      sensitiveFor: async () => (sensitiveBlock ? [{ kind: "card", value: "4400 ****" }] : []),
      sendChatUpload: async (_convId, file) => {
        if (sendUploadError) throw new MessageActionError(sendUploadError);
        return { id: MSG_ID, status: "sent", error: file.name === "warn.jpg" ? "delay" : null };
      },
      convertAudio: async () => (audioConverted ? { data: new Uint8Array([1, 2, 3]), mime: "audio/ogg" } : null),
      findMessageMedia: async (id) => {
        if (id !== MSG_ID) return null;
        return {
          message: { id: MSG_ID, conversationId: OTHER_CHAT_ID, externalId: "ext-1", type: "audio", mediaUrl: "store:m1" },
          conversation: makeConversation(OTHER_CHAT_ID, OWNER.id, DEAL_ID),
        } satisfies Attachment;
      },
      findDealById: async (id) => (id === DEAL_ID ? { assigneeId: SALES.id } : null),
      openMessageMedia: async (_att, range) => {
        if (mediaMode === "gowa") throw new GowaError("gateway down", null, 502);
        if (mediaMode === "unavailable") throw new MediaUnavailableError();
        if (mediaMode === "missing") return null;
        const body = new ReadableStream<Uint8Array>({
          start(c) {
            c.enqueue(new TextEncoder().encode(range ? "PART" : "FULL-MEDIA"));
            c.close();
          },
        });
        return {
          body,
          contentType: "audio/ogg",
          size: range ? "4" : "10",
          range: range ? "bytes 0-3/10" : null,
        };
      },
      addBotMaterial: async (file, meta) => {
        if (file.name.endsWith(".mp3")) throw new MessageActionError("Голосовые в подборку не добавляются");
        return { ...sampleMaterial, name: file.name, caption: meta.caption, lang: meta.lang, about: meta.about };
      },
      botMaterialFile: async (id) => (id === MAT_ID ? { data: new Uint8Array([10, 20, 30, 40]), material: sampleMaterial } : null),

      boardsDispatch: async (_ctx, req, path) => {
        let bodyText = "";
        let hasFile = false;
        if (req.headers.get("content-type")?.includes("multipart/form-data")) {
          const form = await req.formData();
          hasFile = form.get("file") instanceof File;
        } else if (req.method !== "GET") {
          bodyText = await req.text();
        }
        boardCalls.push({ method: req.method, path, bodyText, hasFile });
        return Response.json(
          { method: req.method, path, hasFile, body: bodyText || null },
          { status: req.method === "POST" && path.length === 0 ? 201 : 200, headers: { "cache-control": "no-store" } },
        );
      },
      boardCardFile: async (_viewer, cardId, attId) => {
        if (boardFileError) throw boardFileError;
        if (cardId !== TASK_ID || attId !== ATT_ID) throw new BoardsError("notFound", "Вложение не найдено");
        return { storageKey: "boards/doc.pdf", name: "отчёт.pdf", mime: "application/pdf" };
      },
      serveBoardFile: async (key, mime, req, headers) => {
        if (key !== "boards/doc.pdf") return null;
        const isRange = req.range === "bytes=0-3";
        return new Response(isRange ? "PDF!" : "FULL-PDF", {
          status: isRange ? 206 : 200,
          headers: { "Content-Type": mime, "Accept-Ranges": "bytes", ...(isRange ? { "Content-Range": "bytes 0-3/8" } : {}), ...headers },
        });
      },
      createSupportTicket: async (input) => {
        if (supportCreateError) throw supportCreateError;
        return { id: TICKET_ID, number: 42, notifyPhone: input.notifyPhone || "+77011112233" };
      },
      linkSupportChat: async () => {},
      processSupportTicket: async (id) => {
        processedTickets.push(id);
      },
      scheduleBackground: (fn) => {
        scheduledTasks.push(fn);
        void Promise.resolve().then(fn);
      },
      findSupportTicket: async (id) => (id === TICKET_ID ? { id: TICKET_ID, createdBy: SALES.id } : null),
      findSupportAttachment: async (id, att) =>
        id === TICKET_ID && att === "1-abc" ? { id: "1-abc", key: "support/1.png", name: "скрин.png", mime: "image/png", size: 5, kind: "image" } : null,
      serveSupportAttachment: async (att, _req, headers) =>
        new Response("PNG55", { status: 200, headers: { "Content-Type": att.mime, "Accept-Ranges": "bytes", ...headers } }),
      isReleaseTokenValid: (token) => token === "valid-release-secret",
      markSupportReleased: async (input) => [{ number: 42, release: input.release, commits: input.commits.length }],

      catalogRemoteImage: async (url) => (url.includes("missing") ? null : { data: new Uint8Array([7, 8, 9]), mime: "image/jpeg" }),
      catalogProductImage: async (id) => (id === "12345" ? { data: new Uint8Array([4, 5, 6]), mime: "image/webp" } : null),

      liveState: async () => ({
        counters: { attention: 1, tasks: 2, chats: 3, calls: 0, deals: 4, reviews: 0, finance: 1 },
        unread: 5,
        notifications: [],
        ringing: [],
      }),
      subscribeLive: async (onEvent) => {
        liveListener = onEvent;
        return () => {
          liveUnsubscribed++;
          if (liveListener === onEvent) liveListener = null;
        };
      },
      markNotificationsRead: async () => {},
      syncMobileBadge: async () => {},
      vapidKeys: async () => ({ publicKey: "VAPID-PUB-KEY" }),
      subscribePush: async () => {},
      unsubscribePush: async () => {},
      findOrderDetails: async (id) =>
        id === ORDER_ID ? { id: ORDER_ID, bookId: BOOK_ID, number: 1042, plan: "hardcover", quantity: 1 } : null,
      canSeeOrder: async (staff, id) => id === ORDER_ID && staff.scope === "all",
      preparePrintFiles: async () => {},
      getPrintFile: async (_job, kind) => Buffer.from(`FILE:${kind}`),

      audit: async (_staff, action, entity, _id, details) => {
        auditCalls.push({ action, entity, details });
      },
      allStaff: async () => [
        { id: OWNER.id, name: "Айгерим", email: "owner@mybooks.kz" },
        { id: SALES.id, name: "Данияр", email: "sales@mybooks.kz" },
      ] as Awaited<ReturnType<CrmSitePorts["allStaff"]>>,
      getSetting: async (key) => (key === "finance.fees" ? JSON.stringify({ kaspi: 0.01 }) : key === "finance.taxRate" ? "0.03" : null),
      exportClients: async () => ({
        rows: [
          {
            user: {
              id: REGULAR.id,
              name: "Асель",
              email: "asel@example.kz",
              phone: "+77010001122",
              tags: ["vip"],
              createdAt: FIXED_NOW,
              lastSeenAt: FIXED_NOW,
              managerId: SALES.id,
              source: { source: "instagram", medium: "cpc" },
            },
            booksCount: 1,
            bestAnswered: 12,
            bestWords: 0,
            ordersCount: 1,
            ltv: 29000,
            lastOrderAt: FIXED_NOW,
            occasion: "birthday",
            lastBookUpdate: FIXED_NOW,
          },
        ] as unknown as Awaited<ReturnType<CrmSitePorts["exportClients"]>>["rows"],
        total: 1,
      }),
      exportExpenses: async () => [
        {
          id: "e1",
          source: "expense",
          day: "2026-11-20",
          category: "print",
          title: "Печать тиража",
          amount: 15000,
          quantity: 2,
          note: "Ок",
          channel: null,
          createdById: OWNER.id,
          createdAt: FIXED_NOW,
        },
      ],
      exportFinance: async () => ({ money: [], deals: [], orders: [], unrecorded: [], review: [], resolutions: [] }),
      exportLeadStats: async () => ({ deals: [], payments: [], invoices: [], spend: [{ day: "2026-11-20", amount: 5000 }] }),
      exportOrders: async () => [
        {
          id: ORDER_ID,
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
        } as unknown as Awaited<ReturnType<CrmSitePorts["exportOrders"]>>[number],
      ],
      exportPayments: async () => [
        {
          at: FIXED_NOW,
          amount: 29000,
          kind: "order",
          type: "kaspi",
          ref: "№1042",
          client: "Асель",
          phone: "+77010001122",
          manager: "Данияр",
          receipt: "да",
        },
      ],
      exportProfit: async () => ({
        money: [],
        expenses: [],
        counts: { leads: 1, buyers: 1, buyersFirstSum: 29000, buyersAgreed: 29000, orders: 1, books: 1 },
        prevCounts: { leads: 0, buyers: 0, buyersFirstSum: 0, buyersAgreed: 0, orders: 0, books: 0 },
        forms: {},
      }),
      exportSalesRegister: async () => [],
      exportVcard: async () => [
        { id: REGULAR.id, name: "Асель", phone: "+77010001122", extra_phones: ["+77010001133"], deal_number: 7, occasion: "birthday" },
      ],
    };

    ({ app } = await bootTestApp({
      users: ALL_USERS,
      overrides: [
        [STAFF_ACCESS, staffAccess],
        [CRM_SITE_PORTS, ports],
      ],
    }));
  });

  afterAll(async () => {
    vi.useRealTimers();
    await app.close();
  });

  beforeEach(() => {
    auditCalls.length = 0;
    scheduledTasks.length = 0;
    processedTickets.length = 0;
    boardCalls.length = 0;
    mediaMode = "ok";
    sendUploadError = null;
    sensitiveBlock = false;
    audioConverted = true;
    boardFileError = null;
    supportCreateError = null;
    liveUnsubscribed = 0;
  });

  it("Чаты и материалы бота (7 путей): 200/400/401/403/404/405/502, multipart, оба префикса", async () => {
    // 1. GET /api/admin/chats/inbox
    expect((await app.inject({ method: "GET", url: "/api/admin/chats/inbox" })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/api/admin/chats/inbox", headers: asRegular })).statusCode).toBe(403);
    expect((await app.inject({ method: "GET", url: "/api/admin/chats/inbox", headers: asNeed2fa })).statusCode).toBe(403);
    expect((await app.inject({ method: "GET", url: "/api/admin/chats/inbox", headers: asNoPerms })).statusCode).toBe(403);
    const inbox1 = await app.inject({ method: "GET", url: "/api/admin/chats/inbox?f=unread&q=Асель", headers: asSales });
    expect(inbox1.statusCode).toBe(200);
    expect(inbox1.headers["cache-control"]).toBe("no-store");
    expect(inbox1.json()).toEqual({ items: [{ id: CHAT_ID, filter: "unread", q: "Асель" }] });
    const inboxSite = await app.inject({ method: "GET", url: "/api/v1/site/admin/chats/inbox?f=unknown", headers: asOwner });
    expect(inboxSite.statusCode).toBe(200);
    expect(inboxSite.json()).toEqual({ items: [{ id: CHAT_ID, filter: "open", q: null }] });
    const inbox405 = await app.inject({ method: "POST", url: "/api/admin/chats/inbox", headers: asOwner });
    expect(inbox405.statusCode).toBe(405);
    expect(inbox405.headers.allow).toBe("GET");

    // 2. POST /api/admin/chats/{id}/files
    expect((await app.inject({ method: "POST", url: "/api/admin/chats/bad-uuid/files", headers: asSales })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url: `/api/admin/chats/${OTHER_CHAT_ID}/files`, headers: asSales })).statusCode).toBe(403);
    expect((await app.inject({ method: "POST", url: `/api/admin/chats/${TASK_ID}/files`, headers: asSales })).statusCode).toBe(404);
    const emptyFiles = buildMultipart([{ name: "caption", value: "hi" }]);
    const noFilesRes = await app.inject({
      method: "POST",
      url: `/api/admin/chats/${CHAT_ID}/files`,
      headers: { ...asSales, "content-type": emptyFiles.contentType },
      payload: emptyFiles.body,
    });
    expect(noFilesRes.statusCode).toBe(400);
    expect(noFilesRes.json()).toEqual({ error: "Выберите файл" });

    const tooMany = buildMultipart(
      Array.from({ length: 11 }, (_, i) => ({ name: "files", filename: `f${i}.jpg`, contentType: "image/jpeg", content: "x" })),
    );
    const tooManyRes = await app.inject({
      method: "POST",
      url: `/api/admin/chats/${CHAT_ID}/files`,
      headers: { ...asSales, "content-type": tooMany.contentType },
      payload: tooMany.body,
    });
    expect(tooManyRes.statusCode).toBe(400);
    expect(tooManyRes.json()).toEqual({ error: "Не больше 10 файлов за раз" });

    sensitiveBlock = true;
    const oneFile = buildMultipart([
      { name: "files", filename: "a.jpg", contentType: "image/jpeg", content: "IMG" },
      { name: "caption", value: "Переведите на 4400" },
    ]);
    const sensRes = await app.inject({
      method: "POST",
      url: `/api/admin/chats/${CHAT_ID}/files`,
      headers: { ...asSales, "content-type": oneFile.contentType },
      payload: oneFile.body,
    });
    expect(sensRes.statusCode).toBe(400);
    expect(sensRes.json().code).toBe("sensitiveCaption");
    sensitiveBlock = false;

    const okFiles = await app.inject({
      method: "POST",
      url: `/api/v1/site/admin/chats/${CHAT_ID}/files`,
      headers: { ...asSales, "content-type": oneFile.contentType },
      payload: oneFile.body,
    });
    expect(okFiles.statusCode).toBe(200);
    expect(okFiles.json()).toEqual({ results: [{ name: "a.jpg", id: MSG_ID, status: "sent" }] });

    // 3. GET /api/admin/chats/{id}/messages
    expect((await app.inject({ method: "GET", url: "/api/admin/chats/not-uuid/messages", headers: asSales })).statusCode).toBe(400);
    expect((await app.inject({ method: "GET", url: `/api/admin/chats/${OTHER_CHAT_ID}/messages`, headers: asSales })).statusCode).toBe(404);
    const msgs = await app.inject({ method: "GET", url: `/api/admin/chats/${CHAT_ID}/messages?limit=5`, headers: asSales });
    expect(msgs.statusCode).toBe(200);
    expect(msgs.headers["cache-control"]).toBe("no-store");
    expect(msgs.json().messages[0].text).toBe("limit=10");

    // 4. POST /api/admin/chats/{id}/voice
    const emptyVoice = buildMultipart([{ name: "replyToId", value: MSG_ID }]);
    const emptyVoiceRes = await app.inject({
      method: "POST",
      url: `/api/admin/chats/${CHAT_ID}/voice`,
      headers: { ...asSales, "content-type": emptyVoice.contentType },
      payload: emptyVoice.body,
    });
    expect(emptyVoiceRes.statusCode).toBe(400);
    expect(emptyVoiceRes.json()).toEqual({ error: "Запись пустая" });

    const voiceForm = buildMultipart([{ name: "voice", filename: "rec.webm", contentType: "audio/webm", content: "OGG" }]);
    const okVoice = await app.inject({
      method: "POST",
      url: `/api/admin/chats/${CHAT_ID}/voice`,
      headers: { ...asSales, "content-type": voiceForm.contentType },
      payload: voiceForm.body,
    });
    expect(okVoice.statusCode).toBe(200);
    expect(okVoice.json()).toEqual({ id: MSG_ID, status: "sent", error: null, converted: true });

    sendUploadError = "Файл слишком большой";
    const errVoice = await app.inject({
      method: "POST",
      url: `/api/admin/chats/${CHAT_ID}/voice`,
      headers: { ...asSales, "content-type": voiceForm.contentType },
      payload: voiceForm.body,
    });
    expect(errVoice.statusCode).toBe(400);
    expect(errVoice.json()).toEqual({ error: "Файл слишком большой" });
    sendUploadError = null;

    // 5. GET /api/admin/chats/messages/{id}/media (с доступом через сделку, Range 206, 502)
    const mediaOk = await app.inject({
      method: "GET",
      url: `/api/admin/chats/messages/${MSG_ID}/media`,
      headers: { ...asSales, range: "bytes=0-3" },
    });
    expect(mediaOk.statusCode).toBe(206);
    expect(mediaOk.headers["content-range"]).toBe("bytes 0-3/10");
    expect(mediaOk.headers["content-security-policy"]).toBe("sandbox");
    expect(mediaOk.body).toBe("PART");

    mediaMode = "gowa";
    const media502 = await app.inject({ method: "GET", url: `/api/admin/chats/messages/${MSG_ID}/media`, headers: asOwner });
    expect(media502.statusCode).toBe(502);
    expect(media502.body).toBe("gateway down");
    mediaMode = "ok";

    // 6. POST /api/admin/bot/materials & 7. GET /api/admin/bot/materials/{id}
    expect((await app.inject({ method: "POST", url: "/api/admin/bot/materials", headers: asSales })).statusCode).toBe(403);
    const matForm = buildMultipart([
      { name: "file", filename: "cover.jpg", contentType: "image/jpeg", content: "JPEG" },
      { name: "caption", value: "Пример обложки" },
      { name: "lang", value: "kk" },
    ]);
    const matPost = await app.inject({
      method: "POST",
      url: "/api/admin/bot/materials",
      headers: { ...asOwner, "content-type": matForm.contentType },
      payload: matForm.body,
    });
    expect(matPost.statusCode).toBe(200);
    expect(matPost.json().material.lang).toBe("kk");
    expect(auditCalls).toHaveLength(1);

    const matGet = await app.inject({ method: "GET", url: `/api/v1/site/admin/bot/materials/${MAT_ID}`, headers: asOwner });
    expect(matGet.statusCode).toBe(200);
    expect(matGet.headers["content-type"]).toBe("image/jpeg");
    expect(matGet.headers["content-disposition"]).toContain("inline; filename*=UTF-8''");
    expect((await app.inject({ method: "GET", url: "/api/admin/bot/materials/missing", headers: asOwner })).statusCode).toBe(404);
  });

  it("Доски, вложения задач и поддержка (5 путей): корень и вложенные {path*}, 5 методов, scheduleBackground без after(), X-Release-Token", async () => {
    // 8. /api/admin/boards/{path*} — все 5 методов, корень и вложенные пути, multipart
    for (const url of ["/api/admin/boards", "/api/v1/site/admin/boards"]) {
      const r = await app.inject({ method: "GET", url, headers: asOwner });
      expect(r.statusCode).toBe(200);
      expect(r.json().path).toEqual([]);
    }
    const postRoot = await app.inject({ method: "POST", url: "/api/admin/boards", headers: asOwner, payload: { name: "Печать" } });
    expect(postRoot.statusCode).toBe(201);
    const patchSub = await app.inject({ method: "PATCH", url: `/api/admin/boards/columns/${TASK_ID}`, headers: asOwner, payload: { name: "Готово" } });
    expect(patchSub.statusCode).toBe(200);
    expect(patchSub.json().path).toEqual(["columns", TASK_ID]);
    const putSub = await app.inject({ method: "PUT", url: `/api/v1/site/admin/boards/cards/${TASK_ID}/watch`, headers: asOwner, payload: { on: true } });
    expect(putSub.statusCode).toBe(200);
    const delSub = await app.inject({ method: "DELETE", url: `/api/admin/boards/views/${TASK_ID}`, headers: asOwner });
    expect(delSub.statusCode).toBe(200);
    const cardFile = buildMultipart([{ name: "file", filename: "doc.txt", contentType: "text/plain", content: "hello" }]);
    const upCard = await app.inject({
      method: "POST",
      url: `/api/admin/boards/cards/${TASK_ID}/files`,
      headers: { ...asOwner, "content-type": cardFile.contentType },
      payload: cardFile.body,
    });
    expect(upCard.statusCode).toBe(200);
    expect(upCard.json().hasFile).toBe(true);

    // 9. GET /api/admin/tasks/{id}/files/{att}
    expect((await app.inject({ method: "GET", url: `/api/admin/tasks/bad/files/${ATT_ID}`, headers: asOwner })).statusCode).toBe(400);
    const taskAtt = await app.inject({
      method: "GET",
      url: `/api/admin/tasks/${TASK_ID}/files/${ATT_ID}?download=1`,
      headers: { ...asOwner, range: "bytes=0-3" },
    });
    expect(taskAtt.statusCode).toBe(206);
    expect(taskAtt.headers["content-disposition"]).toContain("attachment; filename*=UTF-8''");
    expect(taskAtt.body).toBe("PDF!");

    boardFileError = new BoardsError("forbidden", "Нет доступа");
    const taskAtt403 = await app.inject({ method: "GET", url: `/api/admin/tasks/${TASK_ID}/files/${ATT_ID}`, headers: asOwner });
    expect(taskAtt403.statusCode).toBe(403);
    expect(taskAtt403.json()).toEqual({ error: "Нет доступа" });
    boardFileError = null;

    // 10. POST /api/admin/support — без next/server after(), с безопасным scheduleBackground
    const badFormRes = await app.inject({
      method: "POST",
      url: "/api/admin/support",
      headers: { ...asOwner, "content-type": "application/json" },
      payload: { description: "x" },
    });
    expect(badFormRes.statusCode).toBe(400);
    expect(badFormRes.json().error).toContain("Не удалось прочитать форму");

    const supForm = buildMultipart([
      { name: "kind", value: "bug" },
      { name: "urgency", value: "high" },
      { name: "description", value: "Не открывается макет" },
      { name: "conversationId", value: CHAT_ID },
      { name: "messageIds", value: JSON.stringify([MSG_ID]) },
      { name: "voice", filename: "v.webm", contentType: "audio/webm", content: "VOICE" },
    ]);
    const supDeniedChat = await app.inject({
      method: "POST",
      url: "/api/admin/support",
      headers: { ...asNoPerms, "content-type": supForm.contentType },
      payload: supForm.body,
    });
    expect(supDeniedChat.statusCode).toBe(403);

    const supOk = await app.inject({
      method: "POST",
      url: "/api/admin/support",
      headers: { ...asSales, "content-type": supForm.contentType },
      payload: supForm.body,
    });
    expect(supOk.statusCode).toBe(200);
    expect(supOk.json()).toEqual({ number: 42, phone: "+77012223344" });
    await Promise.resolve();
    expect(scheduledTasks).toHaveLength(1);
    expect(processedTickets).toEqual([TICKET_ID]);

    // 11. GET /api/admin/support/{id}/files/{att}
    expect((await app.inject({ method: "GET", url: `/api/admin/support/${TICKET_ID}/files/bad!att`, headers: asOwner })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: `/api/admin/support/${TICKET_ID}/files/1-abc`, headers: asNoPerms })).statusCode).toBe(404);
    const supFile = await app.inject({ method: "GET", url: `/api/v1/site/admin/support/${TICKET_ID}/files/1-abc?download`, headers: asSales });
    expect(supFile.statusCode).toBe(200);
    expect(supFile.headers["content-disposition"]).toContain("attachment; filename*=UTF-8''");
    expect(supFile.body).toBe("PNG55");

    // 12. POST /api/support/release (auth: "none" + X-Release-Token)
    const rel403 = await app.inject({
      method: "POST",
      url: "/api/support/release",
      headers: { "x-release-token": "wrong" },
      payload: { release: "v1", commits: [] },
    });
    expect(rel403.statusCode).toBe(403);
    expect(rel403.json()).toEqual({ error: "forbidden" });

    const rel400 = await app.inject({
      method: "POST",
      url: "/api/support/release",
      headers: { "x-release-token": "valid-release-secret" },
      payload: { release: "v1", commits: [{ sha: "not-hex", subject: "bad" }] },
    });
    expect(rel400.statusCode).toBe(400);
    expect(rel400.json()).toEqual({ error: "bad request" });

    const relOk = await app.inject({
      method: "POST",
      url: "/api/v1/site/support/release",
      headers: { "x-release-token": "valid-release-secret" },
      payload: { release: "2026.11.26", commits: [{ sha: "abcdef1", subject: "Обращение №42" }] },
    });
    expect(relOk.statusCode).toBe(200);
    expect(relOk.json()).toEqual({ tickets: [{ number: 42, release: "2026.11.26", commits: 1 }] });

    const rel405 = await app.inject({ method: "GET", url: "/api/support/release" });
    expect(rel405.statusCode).toBe(405);
    expect(rel405.headers.allow).toBe("POST");
  });

  it("Каталог (2), Live/SSE, уведомления, push и ZIP-пакет заказа (5): права, потоки, AbortSignal", async () => {
    // 13. GET /api/admin/catalog/photo
    expect((await app.inject({ method: "GET", url: "/api/admin/catalog/photo?u=https://evil.example/a.jpg", headers: asSales })).statusCode).toBe(403);
    expect((await app.inject({ method: "GET", url: "/api/admin/catalog/photo?u=https://evil.example/a.jpg", headers: asOwner })).statusCode).toBe(404);
    const catPhoto = await app.inject({
      method: "GET",
      url: "/api/admin/catalog/photo?u=https%3A%2F%2Fmmg.whatsapp.net%2Fimg.jpg",
      headers: asOwner,
    });
    expect(catPhoto.statusCode).toBe(200);
    expect(catPhoto.headers["content-type"]).toBe("image/jpeg");

    // 14. GET /api/admin/catalog/{id}/image (логическое ИЛИ: chats.view || catalog.manage)
    expect((await app.inject({ method: "GET", url: "/api/admin/catalog/12345/image", headers: asNoPerms })).statusCode).toBe(403);
    expect((await app.inject({ method: "GET", url: "/api/admin/catalog/abc/image", headers: asSales })).statusCode).toBe(404);
    const catImg = await app.inject({ method: "GET", url: "/api/v1/site/admin/catalog/12345/image", headers: asSales });
    expect(catImg.statusCode).toBe(200);
    expect(catImg.headers["content-type"]).toBe("image/webp");

    // 15. GET /api/admin/live
    const liveRes = await app.inject({ method: "GET", url: "/api/admin/live", headers: asNoPerms });
    expect(liveRes.statusCode).toBe(200);
    expect(liveRes.headers["cache-control"]).toBe("no-store");
    expect(liveRes.json().unread).toBe(5);

    // 16. GET /api/admin/live/stream — проверяем настоящий SSE-стрим и отписку при обрыве (AbortSignal)
    expect((await app.inject({ method: "GET", url: "/api/admin/live/stream" })).statusCode).toBe(401);
    const sse405 = await app.inject({ method: "POST", url: "/api/admin/live/stream", headers: asOwner });
    expect(sse405.statusCode).toBe(405);
    expect(sse405.headers.allow).toBe("GET");

    await app.listen(0, "127.0.0.1");
    const address = (await app.getUrl()).replace("[::1]", "127.0.0.1");
    const ac = new AbortController();
    const sseRes = await fetch(`${address}/api/admin/live/stream`, { headers: asSales, signal: ac.signal });
    expect(sseRes.status).toBe(200);
    expect(sseRes.headers.get("content-type")).toBe("text/event-stream; charset=utf-8");
    expect(sseRes.headers.get("x-accel-buffering")).toBe("no");
    const reader = sseRes.body!.getReader();
    const decoder = new TextDecoder();
    const first = decoder.decode((await reader.read()).value);
    expect(first).toContain("retry: 5000\n\n");
    // Событие только для OWNER — отфильтруется, событие для SALES и board-событие — дойдут.
    liveListener?.({ type: "chat", conversationId: OTHER_CHAT_ID, users: [OWNER.id] });
    liveListener?.({ type: "board", boardId: "b1", taskId: TASK_ID });
    const second = decoder.decode((await reader.read()).value);
    expect(second).toContain('data: {"type":"board","conversationId":null,"boardId":"b1","taskId":"dddd1111-1111-4111-8111-111111111111"}\n\n');
    ac.abort();
    await reader.cancel().catch(() => {});
    await new Promise((r) => setTimeout(r, 30));
    expect(liveUnsubscribed).toBeGreaterThanOrEqual(1);

    // 17. POST /api/admin/notifications
    expect((await app.inject({ method: "POST", url: "/api/admin/notifications", headers: asSales, payload: { id: "bad" } })).statusCode).toBe(400);
    const notifAll = await app.inject({ method: "POST", url: "/api/admin/notifications", headers: asSales });
    expect(notifAll.statusCode).toBe(200);
    expect(notifAll.json()).toEqual({ ok: true });
    const notifOne = await app.inject({ method: "POST", url: "/api/v1/site/admin/notifications", headers: asSales, payload: { id: NOTIF_ID } });
    expect(notifOne.statusCode).toBe(200);

    // 18. GET/POST/DELETE /api/admin/push
    const pushGet = await app.inject({ method: "GET", url: "/api/admin/push", headers: asSales });
    expect(pushGet.statusCode).toBe(200);
    expect(pushGet.json()).toEqual({ publicKey: "VAPID-PUB-KEY" });
    const pushPost = await app.inject({
      method: "POST",
      url: "/api/admin/push",
      headers: asSales,
      payload: { endpoint: "https://push.example/sub/1", keys: { p256dh: "1234567890abcdef", auth: "abcd" } },
    });
    expect(pushPost.statusCode).toBe(200);
    expect(pushPost.json()).toEqual({ ok: true });
    const pushDel = await app.inject({
      method: "DELETE",
      url: "/api/admin/push",
      headers: asSales,
      payload: { endpoint: "https://push.example/sub/1" },
    });
    expect(pushDel.statusCode).toBe(200);
    const push405 = await app.inject({ method: "PATCH", url: "/api/admin/push", headers: asSales });
    expect(push405.statusCode).toBe(405);
    expect(push405.headers.allow).toBe("GET, POST, DELETE");

    // 19. GET /api/admin/orders/{id}/package
    expect((await app.inject({ method: "GET", url: `/api/admin/orders/${ORDER_ID}/package`, headers: asSales })).statusCode).toBe(403);
    expect((await app.inject({ method: "GET", url: "/api/admin/orders/bad/package", headers: asOwner })).statusCode).toBe(400);
    expect((await app.inject({ method: "GET", url: `/api/admin/orders/${TASK_ID}/package`, headers: asOwner })).statusCode).toBe(404);
    const pkg = await app.inject({ method: "GET", url: `/api/admin/orders/${ORDER_ID}/package`, headers: asOwner });
    expect(pkg.statusCode).toBe(200);
    expect(pkg.headers["content-type"]).toBe("application/zip");
    expect(pkg.headers["content-disposition"]).toBe('attachment; filename="order-1042.zip"');
    expect(pkg.headers["cache-control"]).toBe("private, no-store");
    expect(pkg.rawPayload.subarray(0, 2).toString("ascii")).toBe("PK");
  });

  it("9 экспортов CSV и vCard: права, аудит, заголовки, 405 и оба префикса", async () => {
    const exportsList: Array<{ path: string; entity: string; deniedForSales: boolean; contentType: string }> = [
      { path: "/api/admin/export/clients?segment=vip", entity: "clients", deniedForSales: true, contentType: "text/csv; charset=utf-8" },
      { path: "/api/admin/export/expenses?p=month", entity: "expenses", deniedForSales: true, contentType: "text/csv; charset=utf-8" },
      { path: "/api/admin/export/finance?p=month", entity: "finance", deniedForSales: false, contentType: "text/csv; charset=utf-8" },
      { path: "/api/admin/export/leads?p=month", entity: "leads", deniedForSales: false, contentType: "text/csv; charset=utf-8" },
      { path: "/api/admin/export/orders?status=paid", entity: "orders", deniedForSales: true, contentType: "text/csv; charset=utf-8" },
      { path: "/api/admin/export/payments?days=30", entity: "payments", deniedForSales: false, contentType: "text/csv; charset=utf-8" },
      { path: "/api/admin/export/profit?p=month", entity: "profit", deniedForSales: true, contentType: "text/csv; charset=utf-8" },
      { path: "/api/admin/export/sales?p=month", entity: "sales", deniedForSales: false, contentType: "text/csv; charset=utf-8" },
      { path: "/api/admin/export/vcard?since=2026-11-01", entity: "clients_vcard", deniedForSales: true, contentType: "text/vcard; charset=utf-8" },
    ];

    for (const item of exportsList) {
      const noAuth = await app.inject({ method: "GET", url: item.path });
      expect(noAuth.statusCode, item.path).toBe(401);

      const noPerm = await app.inject({ method: "GET", url: item.path, headers: asNoPerms });
      expect(noPerm.statusCode, item.path).toBe(403);

      if (item.deniedForSales) {
        expect((await app.inject({ method: "GET", url: item.path, headers: asSales })).statusCode, item.path).toBe(403);
      }

      const ok = await app.inject({ method: "GET", url: item.path, headers: asOwner });
      expect(ok.statusCode, item.path).toBe(200);
      expect(ok.headers["content-type"], item.path).toBe(item.contentType);
      expect(ok.headers["cache-control"], item.path).toBe("no-store");
      expect(ok.headers["content-disposition"], item.path).toContain("attachment; filename=");

      const siteUrl = `/api/v1/site${item.path.slice("/api".length)}`;
      const okSite = await app.inject({ method: "GET", url: siteUrl, headers: asOwner });
      expect(okSite.statusCode, siteUrl).toBe(200);

      const badMethod = await app.inject({ method: "POST", url: item.path.split("?")[0], headers: asOwner });
      expect(badMethod.statusCode, item.path).toBe(405);
      expect(badMethod.headers.allow, item.path).toBe("GET");
    }

    // Каждый из 9 экспортов вызывался дважды (/api и /api/v1/site) → 18 записей аудита.
    expect(auditCalls.map((a) => a.entity).filter((v, i, arr) => arr.indexOf(v) === i)).toEqual(
      exportsList.map((e) => e.entity),
    );
  });
});
