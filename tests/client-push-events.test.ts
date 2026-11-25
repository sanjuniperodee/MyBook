import { describe, expect, it, vi } from "vitest";
import type { Locale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import { MessagingEvents, type Conversation, type InboundMessage, type ManagerReplyPayload } from "@/modules/messaging";
import { MessagingService } from "@/modules/messaging/application/services";
import { Order, OrderingEvents, type OrderRef } from "@/modules/ordering";
import { apnsBody } from "@/modules/workspace/infrastructure/apns";
import { fcmBody } from "@/modules/workspace/infrastructure/fcm";
import { registerClientPushSubscriptions, type ClientPushDeps, type ClientPushMessage } from "@/server/client-push";
import { InProcessEventBus } from "@/shared/infrastructure";

const baseOrderRef: OrderRef = {
  orderId: "ord-1111",
  number: 42,
  userId: "user-1",
  bookId: "book-9999",
  plan: "hardcover",
  amount: 24900,
  prepaid: 0,
  contactName: "Алия",
  contactPhone: "+77011234567",
  contactEmail: "aliya@example.com",
  promoCode: null,
};

function setup(overrides: Partial<ClientPushDeps> = {}) {
  const bus = new InProcessEventBus({ info: () => {}, warn: () => {}, error: () => {} });
  const sent: { userId: string; payload: ClientPushMessage }[] = [];
  let auto = true;
  const locales = new Map<string, Locale>([["user-1", "ru"]]);
  const books = new Map<string, { title: string; language: string | null }>([["book-9999", { title: "Книга для мамы", language: "ru" }]]);
  const orders = new Map<string, { status: string; bookId: string; number: number; trackingNumber: string | null }>([
    ["ord-1111", { status: "shipped", bookId: "book-9999", number: 42, trackingNumber: "KZ123456" }],
  ]);
  const deals = new Map<string, { clientId: string | null; orderId: string | null }>();
  const phones = new Map<string, string>();
  const latestBooks = new Map<string, string>([["user-1", "book-9999"]]);

  const deps: ClientPushDeps = {
    autoEnabled: async () => auto,
    clientLocale: async (id) => locales.get(id) ?? "ru",
    bookInfo: async (id) => books.get(id) ?? null,
    orderInfo: async (id) => orders.get(id) ?? null,
    dealInfo: async (id) => deals.get(id) ?? null,
    findClientByPhone: async (phone) => phones.get(phone) ?? null,
    latestBookId: async (userId) => latestBooks.get(userId) ?? null,
    send: async (userId, payload) => {
      sent.push({ userId, payload });
    },
    ...overrides,
  };

  registerClientPushSubscriptions(bus, deps);

  return {
    bus,
    sent,
    setAuto: (v: boolean) => {
      auto = v;
    },
    locales,
    books,
    orders,
    deals,
    phones,
    latestBooks,
  };
}

describe("клиентские push-уведомления на 4 доменных события", () => {
  it("1) книга готова (ordering.print_files_ready) — словарь на языке книги и data payload с bookId/orderId", async () => {
    const { bus, sent, books } = setup();
    books.set("book-9999", { title: "Анама арналған кітап", language: "kk" });

    await bus.publish([OrderingEvents.printFilesReady({ ...baseOrderRef, pageCount: 84 })]);

    expect(sent).toHaveLength(1);
    const { userId, payload } = sent[0];
    expect(userId).toBe("user-1");
    expect(payload.kind).toBe("book_ready");
    expect(payload.title).toBe(messagesFor("kk").mail.push.bookReady.title);
    expect(payload.body).toBe(messagesFor("kk").mail.push.bookReady.bodyWithTitle("Анама арналған кітап"));
    expect(payload.link).toBe("/books/book-9999");
    expect(payload.data).toEqual({ kind: "book_ready", bookId: "book-9999", orderId: "ord-1111" });
  });

  it("1b) книга готова: при отсутствии языка книги берётся язык клиента (uz, en) и fallback без названия", async () => {
    const { bus, sent, locales, books } = setup();
    locales.set("user-1", "en");
    books.set("book-9999", { title: "", language: null });

    await bus.publish([OrderingEvents.printFilesReady({ ...baseOrderRef, pageCount: 60 })]);

    expect(sent).toHaveLength(1);
    expect(sent[0].payload.title).toBe(messagesFor("en").mail.push.bookReady.title);
    expect(sent[0].payload.body).toBe(messagesFor("en").mail.push.bookReady.body(42));
  });

  it("1c) Order.recordPrintSpec записывает событие ordering.print_files_ready только при первой сборке", () => {
    const now = new Date("2026-11-25T10:00:00Z");
    const order = Order.place(
      {
        id: "ord-1111",
        number: 42,
        userId: "user-1",
        bookId: "book-9999",
        plan: "hardcover",
        quantity: 1,
        delivery: { method: null, city: "Алматы", address: "Абая 1", postalCode: null },
        addons: [],
        contact: { name: "Алия", phone: "+77011234567", email: "aliya@example.com" },
        promo: null,
        currency: "KZT",
        paymentProvider: "kaspi",
        estimatedPages: 60,
        formatMoney: (n) => `${n} ₸`,
      },
      now,
    );
    order.pullEvents(); // очистить order_placed

    const spec = { format: "a5", pageCount: 84, spineMm: 10, coverWidthMm: 320, coverHeightMm: 220, generatedAt: now.toISOString() };
    order.recordPrintSpec(spec);
    const first = order.pullEvents();
    expect(first).toHaveLength(1);
    expect(first[0].type).toBe("ordering.print_files_ready");
    expect(first[0].payload).toMatchObject({ orderId: "ord-1111", bookId: "book-9999", userId: "user-1", pageCount: 84 });

    // Повторная пересборка печатных файлов не дублирует push клиенту
    order.recordPrintSpec({ ...spec, pageCount: 86 });
    expect(order.pullEvents()).toHaveLength(0);
  });

  it("2) заказ оплачен (ordering.order_paid) — печатный и электронный тарифы, локаль клиента", async () => {
    const { bus, sent, locales } = setup();
    locales.set("user-1", "ru");

    await bus.publish([OrderingEvents.orderPaid({ ...baseOrderRef, paymentId: "pay-1", actor: "kaspi" })]);
    await bus.publish([OrderingEvents.orderPaid({ ...baseOrderRef, orderId: "ord-2", number: 43, plan: "digital", paymentId: "pay-2", actor: "kaspi" })]);

    expect(sent).toHaveLength(2);
    expect(sent[0].payload).toMatchObject({
      kind: "order_paid",
      title: messagesFor("ru").mail.push.orderPaid.title,
      body: messagesFor("ru").mail.push.orderPaid.bodyPrinted(42),
      link: "/orders/ord-1111",
      data: { kind: "order_paid", orderId: "ord-1111", bookId: "book-9999" },
    });
    expect(sent[1].payload).toMatchObject({
      kind: "order_paid",
      body: messagesFor("ru").mail.push.orderPaid.bodyDigital(43),
      link: "/orders/ord-2",
      data: { kind: "order_paid", orderId: "ord-2", bookId: "book-9999" },
    });
  });

  it("3) заказ отправлен (ordering.order_status_changed → shipped и ordering.tracking_added после отправки)", async () => {
    const { bus, sent, locales, orders } = setup();
    locales.set("user-1", "uz");

    // Другие статусы не шлют push «отправлен»
    await bus.publish([OrderingEvents.statusChanged({ ...baseOrderRef, from: "paid", to: "in_production", trackingNumber: null, actor: "staff-1" })]);
    expect(sent).toHaveLength(0);

    // Перевод в shipped без трека
    await bus.publish([OrderingEvents.statusChanged({ ...baseOrderRef, from: "in_production", to: "shipped", trackingNumber: null, actor: "staff-1" })]);
    expect(sent).toHaveLength(1);
    expect(sent[0].payload).toMatchObject({
      kind: "order_shipped",
      title: messagesFor("uz").mail.push.orderShipped.title,
      body: messagesFor("uz").mail.push.orderShipped.body(42),
      link: "/orders/ord-1111",
      tag: "order:ord-1111:shipped",
      data: { kind: "order_shipped", orderId: "ord-1111", bookId: "book-9999" },
    });

    // Трек-номер добавили после отправки — приходит обновлённый push с тем же tag
    await bus.publish([OrderingEvents.trackingAdded({ ...baseOrderRef, trackingNumber: "KZ987654", afterShipping: true, actor: "staff-1" })]);
    expect(sent).toHaveLength(2);
    expect(sent[1].payload.body).toBe(messagesFor("uz").mail.push.orderShipped.bodyTracking(42, "KZ987654"));
    expect(sent[1].payload.tag).toBe("order:ord-1111:shipped");

    // Если заказ уже доставлен или afterShipping=false — трек не шлёт повторный push
    orders.set("ord-1111", { status: "delivered", bookId: "book-9999", number: 42, trackingNumber: "KZ987654" });
    await bus.publish([
      OrderingEvents.trackingAdded({ ...baseOrderRef, trackingNumber: "KZ987654", afterShipping: true, actor: "staff-1" }),
      OrderingEvents.trackingAdded({ ...baseOrderRef, trackingNumber: "KZ987654", afterShipping: false, actor: "staff-1" }),
    ]);
    expect(sent).toHaveLength(2);
  });

  it("4) ответ менеджера клиенту (messaging.manager_replied) — clientId, help-чат, сделка/заказ и поиск по телефону", async () => {
    const { bus, sent, locales, deals, phones } = setup();
    locales.set("user-1", "kk");

    // 4a) Ответ в помощнике кабинета (help-<userId>) без clientId — открывает книгу с помощником
    await bus.publish([
      MessagingEvents.managerReplied({
        conversationId: "conv-help",
        channel: "site",
        chatId: "help-user-1",
        clientId: null,
        dealId: null,
        phone: null,
        authorId: "staff-1",
        text: "Здравствуйте! Обложку уже поправили.",
      }),
    ]);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toEqual({
      userId: "user-1",
      payload: {
        kind: "manager_reply",
        title: messagesFor("kk").mail.push.managerReply.title,
        body: "Здравствуйте! Обложку уже поправили.",
        link: "/books/book-9999?help=1",
        tag: "chat:conv-help",
        data: { kind: "manager_reply", bookId: "book-9999" },
      },
    });

    // 4b) Ответ в чате сделки с заказом — резолвит клиента из сделки и ведёт в заказ
    deals.set("deal-7", { clientId: "user-1", orderId: "ord-1111" });
    await bus.publish([
      MessagingEvents.managerReplied({
        conversationId: "conv-wa",
        channel: "whatsapp",
        chatId: "77011234567",
        clientId: null,
        dealId: "deal-7",
        phone: "+77011234567",
        authorId: "staff-1",
        text: "   ",
      }),
    ]);
    expect(sent).toHaveLength(2);
    expect(sent[1].payload).toMatchObject({
      kind: "manager_reply",
      body: messagesFor("kk").mail.push.managerReply.bodyFallback,
      link: "/orders/ord-1111",
      data: { kind: "manager_reply", bookId: "book-9999", orderId: "ord-1111" },
    });

    // 4c) Поиск клиента по телефону, если нет clientId и dealId
    phones.set("+77019998877", "user-1");
    await bus.publish([
      MessagingEvents.managerReplied({
        conversationId: "conv-phone",
        channel: "whatsapp",
        chatId: "77019998877",
        clientId: null,
        dealId: null,
        phone: "+77019998877",
        authorId: "staff-1",
        text: "Отправили фото макета",
      }),
    ]);
    expect(sent).toHaveLength(3);
    expect(sent[2].userId).toBe("user-1");

    // 4d) Незнакомый номер без аккаунта клиента — тихо пропускаем
    await bus.publish([
      MessagingEvents.managerReplied({
        conversationId: "conv-anon",
        channel: "whatsapp",
        chatId: "77000000000",
        clientId: null,
        dealId: null,
        phone: "+77000000000",
        authorId: "staff-1",
        text: "Добрый день",
      }),
    ]);
    expect(sent).toHaveLength(3);
  });

  it("КРИТИЧНО: при notify.auto=off ни одно из 4 событий НЕ отправляет push клиенту", async () => {
    const { bus, sent, setAuto } = setup();
    setAuto(false);

    await bus.publish([
      OrderingEvents.printFilesReady({ ...baseOrderRef, pageCount: 80 }),
      OrderingEvents.orderPaid({ ...baseOrderRef, paymentId: "pay-1", actor: "kaspi" }),
      OrderingEvents.statusChanged({ ...baseOrderRef, from: "in_production", to: "shipped", trackingNumber: "KZ123", actor: "staff-1" }),
      OrderingEvents.trackingAdded({ ...baseOrderRef, trackingNumber: "KZ999", afterShipping: true, actor: "staff-1" }),
      MessagingEvents.managerReplied({
        conversationId: "conv-1",
        channel: "whatsapp",
        chatId: "77011234567",
        clientId: "user-1",
        dealId: null,
        phone: "+77011234567",
        authorId: "staff-1",
        text: "Ваш заказ передан курьеру",
      }),
    ]);

    expect(sent).toHaveLength(0);
  });
});

describe("MessagingService: событие ответа менеджера не срабатывает на бота, правила и автоприветствие", () => {
  function makeMessaging() {
    const replies: ManagerReplyPayload[] = [];
    const conv: Conversation = {
      id: "conv-1",
      channel: "whatsapp",
      channelId: "ch-1",
      chatId: "77011234567",
      contactName: "Алия",
      avatarUrl: null,
      clientId: "user-1",
      dealId: "deal-1",
      assigneeId: "staff-1",
      botStep: null,
      lastMessageAt: new Date("2026-11-25T10:00:00Z"),
      meta: { phone: "+77011234567" },
    };
    const recentMsgs: { direction: "in" | "out"; source: string | null; at: Date }[] = [];

    const service = new MessagingService(
      {
        findById: async () => conv,
        findByChat: async () => conv,
        latestWhatsapp: async () => conv,
        create: async () => conv,
        updateContact: async () => conv,
        linkDeal: async () => conv,
        setAssignee: async () => {},
        recordIncoming: async () => {},
        recordOutgoing: async () => {},
        revertOutgoing: async () => {},
        recordEcho: async () => {},
        recordHistory: async () => {},
        closeAsSpam: async () => {},
        findByClientOrPhone: async () => [conv],
        linkDealClient: async () => {},
        assignDealConversations: async () => {},
      } as unknown as ConstructorParameters<typeof MessagingService>[0],
      {
        insertOutgoing: async (_cid: string, text: string, authorId: string | null) => ({ id: "msg-1", conversationId: conv.id, direction: "out", text, authorId, status: "sending", createdAt: new Date() }),
        attachExternalId: async () => {},
        setStatus: async () => {},
        existsExternal: async () => false,
        claimPendingEcho: async () => false,
        insertEcho: async () => true,
        insertIncoming: async () => true,
        recent: async () => recentMsgs,
      } as unknown as ConstructorParameters<typeof MessagingService>[1],
      { isBlocked: async () => false, noMarketing: async () => false, add: async () => {} } as unknown as ConstructorParameters<typeof MessagingService>[2],
      {
        send: async () => ({ ok: true, externalId: "ext-1" }),
        sendFile: async () => ({ ok: true, externalId: "ext-2" }),
        sendCard: async () => ({ ok: true, externalId: "ext-3" }),
      },
      {
        acceptUnsorted: async () => {},
        findClientByPhone: async () => "user-1",
        findOpenDeal: async () => null,
        createDeal: async () => ({ id: "deal-1", clientId: "user-1", assigneeId: "staff-1" }),
        setUtmIfEmpty: async () => {},
        note: async () => {},
        setField: async () => {},
        deal: async () => null,
        nextRoundRobin: async () => null,
      },
      { fromText: async () => null },
      { notify: async () => {} },
      { chatChanged: () => {}, notificationsChanged: () => {} },
      { messageIncoming: async () => {} },
      { onIncoming: async () => ({ quiet: false }), stopByHuman: async () => false, isActive: async () => false },
      { now: () => new Date("2026-11-25T10:05:00Z") },
      { info: () => {}, warn: () => {}, error: vi.fn() },
      async () => "",
      async () => ({ id: "staff-phone", name: "Margo" }),
      undefined,
      null,
      null,
      <T,>(work: () => Promise<T>) => work(),
      async (reply: ManagerReplyPayload) => {
        replies.push(reply);
      },
    );

    return { service, replies, recentMsgs };
  }

  it("живой менеджер (send с authorId, sendFile, эхо с телефона) вызывает onManagerReply; бот и правило — нет", async () => {
    const { service, replies } = makeMessaging();

    // Бот (authorId = null) — не вызывает
    await service.send("conv-1", "Привет от бота", null, "bot");
    // Правило автоматизации (authorId = null) — не вызывает
    await service.send("conv-1", "Авторассылка", null, "rule");
    // Файл от бота — не вызывает
    await service.sendBotFile("conv-1", { data: new Uint8Array([1]), name: "a.jpg", mime: "image/jpeg", kind: "image" }, "Пример", "store:a");
    expect(replies).toHaveLength(0);

    // Живой менеджер из CRM — вызывает
    await service.send("conv-1", "Добрый день, проверили макет!", "staff-1");
    expect(replies).toHaveLength(1);
    expect(replies[0]).toMatchObject({ conversationId: "conv-1", clientId: "user-1", authorId: "staff-1", text: "Добрый день, проверили макет!" });

    // Файл от менеджера — вызывает
    await service.sendFile("conv-1", { data: new Uint8Array([1]), name: "cover.jpg", mime: "image/jpeg", kind: "image" }, "Вот обложка", "staff-1", { mediaUrl: "/m/1" });
    expect(replies).toHaveLength(2);
    expect(replies[1].text).toBe("Вот обложка");

    // Эхо ответа менеджера с телефона магазина — вызывает
    const echo: InboundMessage = {
      chatType: "whatsapp",
      channelId: "ch-1",
      chatId: "77011234567",
      externalId: "echo-1",
      contactName: "Алия",
      avatarUrl: null,
      type: "text",
      mediaUrl: null,
      status: "sent",
      text: "Ответ с телефона",
      at: new Date("2026-11-25T10:06:00Z"),
      isEcho: true,
    };
    await service.ingest(echo);
    expect(replies).toHaveLength(3);
    expect(replies[2]).toMatchObject({ authorId: "staff-phone", text: "Ответ с телефона" });
  });
});

describe("формат полезной нагрузки FCM и APNs для клиентских push", () => {
  it("fcmBody и apnsBody передают kind, bookId, orderId и ссылку для навигации по тапу", () => {
    const fcm = fcmBody("fcm-token", {
      title: "Заказ отправлен",
      body: "Заказ №42 в пути",
      link: "/orders/ord-1111",
      tag: "order:ord-1111:shipped",
      kind: "order_shipped",
      data: { kind: "order_shipped", orderId: "ord-1111", bookId: "book-9999" },
    });
    expect(fcm.message.data).toMatchObject({
      kind: "order_shipped",
      orderId: "ord-1111",
      bookId: "book-9999",
      link: "/orders/ord-1111",
      tag: "order:ord-1111:shipped",
    });

    const apns = apnsBody({
      title: "Книга готова",
      body: "Книга свёрстана",
      link: "/books/book-9999",
      threadId: "client",
      data: { kind: "book_ready", bookId: "book-9999", orderId: "ord-1111" },
    });
    expect(apns).toMatchObject({
      aps: { "thread-id": "client" },
      payload: "/books/book-9999",
      kind: "book_ready",
      bookId: "book-9999",
      orderId: "ord-1111",
    });
  });
});
