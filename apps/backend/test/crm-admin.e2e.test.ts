import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { crmAdminRoutes, crmCatalogRoutes, crmMarketingRoutes } from "@mybook/contracts";
import { applyCatalog, applySeller, applySiteFlags } from "@/config/site";
import { StaffContext } from "@/modules/access/domain/StaffContext";
import { isPhoneEmail } from "@/modules/identity";
import { allPermissions, type Permission } from "@/shared/domain/permissions";
import { STAFF_ACCESS, type StaffAccessPort } from "../src/core/auth/staff";
import { CLOCK } from "../src/core/kernel/tokens";
import { CRM_ADMIN_PORTS, type CrmAdminPorts } from "../src/modules/crm-admin/crm-admin.tokens";
import { bootTestApp, sessionOf, testUser } from "./app";

const OWNER = testUser("11111111-1111-4111-8111-111111111111", { name: "Айгерим", email: "owner@mybooks.kz", role: "admin" });
const ANALYST = testUser("22222222-2222-4222-8222-222222222222", { name: "Аналитик", email: "analyst@mybooks.kz", role: "admin" });
const MARKETER = testUser("33333333-3333-4333-8333-333333333333", { name: "Маркетолог", email: "marketer@mybooks.kz", role: "admin" });
const HR = testUser("44444444-4444-4444-8444-444444444444", { name: "Тимлид", email: "hr@mybooks.kz", role: "admin", crmRoleId: "aaaa0000-0000-4000-8000-000000000002" });
const CATALOG_MGR = testUser("55555555-5555-4555-8555-555555555555", { name: "Каталогист", email: "catalog@mybooks.kz", role: "admin" });
const NO_PERMS = testUser("66666666-6666-4666-8666-666666666666", { name: "Стажёр", email: "intern@mybooks.kz", role: "admin" });
const DISABLED = testUser("77777777-7777-4777-8777-777777777777", { name: "Уволенный", email: "old@mybooks.kz", role: "admin", staffDisabled: true });
const REGULAR = testUser("88888888-8888-4888-8888-888888888888", { name: "Клиент", email: "client@mybooks.kz", role: "user" });
const ALL_USERS = [OWNER, ANALYST, MARKETER, HR, CATALOG_MGR, NO_PERMS, DISABLED, REGULAR];

const ROLE_OWNER_ID = "aaaa0000-0000-4000-8000-000000000001";
const ROLE_MGR_ID = "aaaa0000-0000-4000-8000-000000000002";
const LINK_ID = "bbbb0000-0000-4000-8000-000000000001";
const PROMO_ID = "cccc0000-0000-4000-8000-000000000001";
const GIFT_ID = "dddd0000-0000-4000-8000-000000000001";
const GIFT_PAID_ID = "dddd0000-0000-4000-8000-000000000002";
const REVIEW_ID = "eeee0000-0000-4000-8000-000000000001";
const ORDER_ID = "ffff0000-0000-4000-8000-000000000001";
const TPL_ID = "99990000-0000-4000-8000-000000000001";
const TARGET_USER_ID = "12121212-1212-4121-8121-121212121212";

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

const makeCtx = (id: string, roleName: string, scope: "all" | "own", perms: readonly Permission[], isOwner = false) =>
  new StaffContext(id, roleName, isOwner ? "owner" : null, scope, new Set(perms), isOwner, { isPhoneEmail });

const staffAccess: StaffAccessPort = {
  async resolve(user) {
    if (user.role !== "admin" || user.staffDisabled) return null;
    if (user.id === OWNER.id) return { context: makeCtx(user.id, "Руководитель", "all", allPermissions, true), gate: null };
    if (user.id === ANALYST.id) return { context: makeCtx(user.id, "Аналитик", "all", ["analytics.view"]), gate: null };
    if (user.id === MARKETER.id) return { context: makeCtx(user.id, "Маркетолог", "all", ["promo.manage"]), gate: null };
    if (user.id === HR.id) return { context: makeCtx(user.id, "Тимлид", "all", ["team.manage"]), gate: null };
    if (user.id === CATALOG_MGR.id) return { context: makeCtx(user.id, "Каталогист", "all", ["catalog.manage"]), gate: null };
    if (user.id === NO_PERMS.id) return { context: makeCtx(user.id, "Стажёр", "own", []), gate: null };
    return null;
  },
};

function multipartFile(field: string, filename: string, contentType: string, data: Buffer) {
  const boundary = "----CrmAdminE2eBoundary7a4d";
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`),
    data,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { headers: { "content-type": `multipart/form-data; boundary=${boundary}` }, body };
}

function multipartEmpty(fieldName = "other") {
  const boundary = "----CrmAdminE2eBoundaryEmpty";
  const body = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${fieldName}"\r\n\r\n1\r\n--${boundary}--\r\n`);
  return { headers: { "content-type": `multipart/form-data; boundary=${boundary}` }, body };
}

let clockMs = Date.parse("2026-11-26T10:00:00.000Z");

const state = {
  collectionsFail: false,
  syncFail: null as string | null,
  productFail: null as string | null,
  collectionFail: null as string | null,
  grantFail: null as string | null,
  limitFail: null as string | null,
  linkFail: null as string | null,
  promoFail: null as string | null,
  giftConfirmOk: true,
  siteStepFail: null as "registration" | "giftNote" | "maxPhotos" | "seller" | null,
  pricingWarning: undefined as string | undefined,
  pricingFail: null as string | null,
  staffInviteFail: null as string | null,
  staffPhoneFail: null as string | null,
  staffPasswordFail: null as string | null,
  templateFail: null as string | null,
};

const calls = {
  createProduct: vi.fn(),
  updateProduct: vi.fn(),
  setProductHidden: vi.fn(),
  deleteProduct: vi.fn(),
  saveCollection: vi.fn(),
  deleteCollection: vi.fn(),
  grantDesignAiCredits: vi.fn(),
  saveDesignAiFreeLimit: vi.fn(),
  createMarketingLink: vi.fn(),
  archiveMarketingLink: vi.fn(),
  createPromo: vi.fn(),
  togglePromo: vi.fn(),
  confirmGiftPayment: vi.fn(),
  resendGift: vi.fn(),
  cancelGift: vi.fn(),
  moderateReview: vi.fn(),
  syncCatalogFromSettings: vi.fn(),
  setRegistration: vi.fn(),
  setGiftNote: vi.fn(),
  setMaxPhotos: vi.fn(),
  saveSeller: vi.fn(),
  savePricing: vi.fn(),
  createStaff: vi.fn(),
  setStaffRole: vi.fn(),
  setStaffExtension: vi.fn(),
  setStaffPhone: vi.fn(),
  setStaffDisabled: vi.fn(),
  revokeStaff: vi.fn(),
  resetStaffPassword: vi.fn(),
  saveSharedTemplate: vi.fn(),
  deleteSharedTemplate: vi.fn(),
};

const mockPorts: CrmAdminPorts = {
  catalogSyncIfStale: async () => null,
  catalogList: async () => [
    {
      id: "1001",
      name: "Книга в твёрдой обложке",
      description: "Семейная фотокнига",
      price: 29000,
      currency: "KZT",
      retailerId: "SKU-1",
      url: "https://mybooks.kz",
      hidden: false,
      review: "APPROVED",
      imageUrls: ["https://cdn.wa/p1.jpg"],
      videoUrls: ["https://cdn.wa/v1.mp4"],
      syncedAt: new Date("2026-11-26T09:30:00Z"),
    },
  ],
  catalogLastSyncedAt: async () => new Date("2026-11-26T09:30:00Z"),
  gowaCachedPhone: async () => "77011234567",
  catalogCollections: async () => {
    if (state.collectionsFail) throw new Error("GOWA timeout");
    return [{ id: "5001", name: "Хиты", productIds: ["1001"], review: "APPROVED" }];
  },
  syncCatalog: async () => (state.syncFail ? { ok: false, error: state.syncFail } : { ok: true, total: 12, removed: 2 }),
  createProduct: async (_ctx, form) => {
    calls.createProduct(form);
    return state.productFail ? { ok: false, error: state.productFail } : { ok: true, id: "1002" };
  },
  updateProduct: async (_ctx, id, form) => {
    calls.updateProduct(id, form);
    return state.productFail ? { ok: false, error: state.productFail } : { ok: true };
  },
  setProductHidden: async (_ctx, id, hidden) => {
    calls.setProductHidden(id, hidden);
    return state.productFail ? { ok: false, error: state.productFail } : { ok: true };
  },
  deleteProduct: async (_ctx, id) => {
    calls.deleteProduct(id);
    return state.productFail ? { ok: false, error: state.productFail } : { ok: true };
  },
  saveCollection: async (_ctx, id, input) => {
    calls.saveCollection(id, input);
    return state.collectionFail ? { ok: false, error: state.collectionFail } : { ok: true };
  },
  deleteCollection: async (_ctx, id) => {
    calls.deleteCollection(id);
    return state.collectionFail ? { ok: false, error: state.collectionFail } : { ok: true };
  },
  designAiFreeLimit: async () => 5,
  designAiStats: async () => ({
    totals: { ok: 40, failed: 2, users: 15, free: 30, credit: 10, costUsd: 1.25, avgMs: 2340 },
    people: { used: 15, hitLimit: 4, withCredits: 3, creditsLeft: 18 },
    purchases: { paid: 2, paidAmount: 9800, pending: 1, pendingAmount: 4900 },
    byMode: [{ key: "edit", requests: 25, costUsd: 0.7 }, { key: "custom_mode", requests: 5, costUsd: 0.2 }],
    byDay: [{ day: "2026-11-25", requests: 12, users: 6 }],
    topUsers: [
      {
        userId: TARGET_USER_ID,
        name: "Асель",
        email: "asel@example.kz",
        requests: 8,
        free: 5,
        credit: 3,
        credits: 7,
        lastAt: new Date("2026-11-26T08:00:00Z"),
      },
    ],
  }),
  designAiSettings: async () => ({ enabled: true }),
  grantDesignAiCredits: async (_ctx, form) => {
    calls.grantDesignAiCredits(form);
    return state.grantFail ? { error: state.grantFail } : { ok: "+5" };
  },
  saveDesignAiFreeLimit: async (_ctx, form) => {
    calls.saveDesignAiFreeLimit(form);
    return state.limitFail ? { error: state.limitFail } : { ok: "Готово: 10 бесплатных запросов на клиента." };
  },
  marketingReport: async () => ({
    total: { clicks: 200, leads: 40, registrations: 20, startedBook: 10, sales: 5, revenue: 145000, spend: 50000 },
    channels: [
      { key: "instagram", label: "Instagram", clicks: 150, leads: 30, registrations: 15, startedBook: 8, sales: 4, revenue: 116000, spend: 40000 },
    ],
    links: new Map([["ig-bio", { clicks: 100, leads: 20, registrations: 10, sales: 3, revenue: 87000 }]]),
  }),
  marketingLinks: async () => [
    {
      id: LINK_ID,
      name: "Instagram шапка",
      slug: "ig-bio",
      kind: "site",
      targetPath: "/gift",
      waText: "",
      utmSource: "instagram",
      utmMedium: "social",
      utmCampaign: "bio",
      utmContent: "",
      archived: false,
      createdAt: new Date("2026-11-01T10:00:00Z"),
    },
    {
      id: "bbbb0000-0000-4000-8000-000000000002",
      name: "Архивная WA",
      slug: "wa-old",
      kind: "whatsapp",
      targetPath: "/",
      waText: "Привет",
      utmSource: "whatsapp",
      utmMedium: "",
      utmCampaign: "",
      utmContent: "",
      archived: true,
      createdAt: new Date("2026-10-01T10:00:00Z"),
    },
  ],
  marketingLinkTarget: async (link) => (link.kind === "whatsapp" ? "https://wa.me/77011234567" : `https://mybooks.kz${link.targetPath}`),
  marketingShortUrl: (slug) => `https://mybooks.kz/go/${slug}`,
  createMarketingLink: async (_ctx, form) => {
    calls.createMarketingLink(form);
    return state.linkFail ? { error: state.linkFail } : { ok: "Ссылка создана" };
  },
  archiveMarketingLink: async (_ctx, id, archived) => {
    calls.archiveMarketingLink(id, archived);
  },
  promoStats: async () => [
    {
      promo: {
        id: PROMO_ID,
        code: "WINTER15",
        kind: "percent",
        value: 15,
        active: true,
        usedCount: 4,
        maxUses: 50,
        expiresAt: new Date("2026-12-31T00:00:00Z"),
        note: "Зимняя акция",
      },
      paid: 3,
      revenue: 75000,
    },
  ],
  createPromo: async (_ctx, form) => {
    calls.createPromo(form);
    return state.promoFail ? { error: state.promoFail } : { ok: "Промокод SPRING10 создан" };
  },
  togglePromo: async (_ctx, id) => {
    calls.togglePromo(id);
  },
  recentGifts: async () => [
    {
      id: GIFT_ID,
      number: 101,
      status: "pending_payment",
      amount: 29000,
      plan: "hardcover",
      buyerName: "Динара",
      buyerEmail: "dinara@example.kz",
      buyerPhone: "+77010000001",
      recipientName: "Мама",
      recipientEmail: "mama@example.kz",
      sentAt: null,
      sendAt: "2026-12-01",
      createdAt: new Date("2026-11-25T10:00:00Z"),
      paymentClaimedAt: null,
      promo: null,
      receiptStorageKey: null,
    },
    {
      id: "dddd0000-0000-4000-8000-000000000003",
      number: 102,
      status: "pending_payment",
      amount: 29000,
      plan: "hardcover",
      buyerName: "Аскар",
      buyerEmail: "askar@example.kz",
      buyerPhone: null,
      recipientName: "Отец",
      recipientEmail: null,
      sentAt: null,
      sendAt: null,
      createdAt: new Date("2026-11-26T10:00:00Z"),
      paymentClaimedAt: new Date("2026-11-26T10:05:00Z"),
      promo: null,
      receiptStorageKey: null,
    },
    {
      id: GIFT_PAID_ID,
      number: 100,
      status: "paid",
      amount: 29000,
      plan: "hardcover",
      buyerName: "Алия",
      buyerEmail: "aliya@example.kz",
      buyerPhone: "+77010000002",
      recipientName: "Подруга",
      recipientEmail: "friend@example.kz",
      sentAt: new Date("2026-11-24T12:00:00Z"),
      sendAt: null,
      createdAt: new Date("2026-11-24T10:00:00Z"),
      paymentClaimedAt: new Date("2026-11-24T11:00:00Z"),
      promo: { code: "GIFT-100", usedCount: 1 },
      receiptStorageKey: "receipts/g100.png",
    },
  ],
  confirmGiftPayment: async (_ctx, id, file) => {
    calls.confirmGiftPayment(id, file);
    return state.giftConfirmOk;
  },
  resendGift: async (_ctx, id) => {
    calls.resendGift(id);
  },
  cancelGift: async (_ctx, id) => {
    calls.cancelGift(id);
  },
  reviewList: async () => [
    {
      id: REVIEW_ID,
      status: "new",
      rating: 5,
      text: "Очень красивая книга, родители растрогались до слёз!",
      authorName: "Жанна",
      city: "Алматы",
      theme: "family",
      locale: "ru",
      featured: false,
      consent: true,
      photo: { width: 800, height: 600 },
      orderId: ORDER_ID,
      orderNumber: 555,
      thankYouCode: "THX-10",
      createdAt: new Date("2026-11-25T10:00:00Z"),
    },
    {
      id: "eeee0000-0000-4000-8000-000000000002",
      status: "new",
      rating: 4,
      text: "Ок",
      authorName: "Марат",
      city: null,
      theme: "love",
      locale: "ru",
      featured: null,
      consent: false,
      photo: null,
      orderId: null,
      orderNumber: null,
      thankYouCode: null,
      createdAt: new Date("2026-11-25T11:00:00Z"),
    },
  ],
  reviewCounts: async () => ({ new: 2, published: 10, hidden: 1 }),
  reviewSummary: async () => ({ count: 10, average: 4.85 }),
  moderateReview: async (_ctx, id, action) => {
    calls.moderateReview(id, action);
  },
  syncCatalogFromSettings: async () => {
    calls.syncCatalogFromSettings();
  },
  maxPhotos: async () => 120,
  setRegistration: async (_ctx, form) => {
    calls.setRegistration(form);
    return state.siteStepFail === "registration" ? { error: "Ошибка регистрации" } : { ok: "Регистрация обновлена." };
  },
  setGiftNote: async (_ctx, form) => {
    calls.setGiftNote(form);
    return state.siteStepFail === "giftNote" ? { error: "Ошибка открытки" } : { ok: "Открытка обновлена." };
  },
  setMaxPhotos: async (_ctx, form) => {
    calls.setMaxPhotos(form);
    return state.siteStepFail === "maxPhotos" ? { error: "Лимит фото вне диапазона" } : { ok: "Лимит фото обновлён." };
  },
  saveSeller: async (_ctx, form) => {
    calls.saveSeller(form);
    return state.siteStepFail === "seller" ? { error: "Неверный БИН" } : { ok: "Реквизиты сохранены." };
  },
  savePricing: async (_ctx, form) => {
    calls.savePricing(form);
    if (state.pricingFail) return { error: state.pricingFail };
    return { ok: "Цены обновлены", ...(state.pricingWarning ? { warning: state.pricingWarning } : {}) };
  },
  listRoles: async () => [
    { id: ROLE_OWNER_ID, name: "Руководитель", key: "owner" },
    { id: ROLE_MGR_ID, name: "Менеджер", key: null },
  ],
  listTeam: async () => [
    {
      user: {
        id: OWNER.id,
        name: OWNER.name,
        email: OWNER.email,
        crmRoleId: null,
        sipExtension: "101",
        phone: "+77011111111",
        staffDisabled: false,
        onShift: true,
        lastSeenAt: new Date("2026-11-26T09:50:00Z"),
      },
      openDeals: 2,
      calls7d: 5,
    },
    {
      user: {
        id: HR.id,
        name: HR.name,
        email: HR.email,
        crmRoleId: ROLE_MGR_ID,
        sipExtension: "102",
        phone: "+77012222222",
        staffDisabled: false,
        onShift: true,
        lastSeenAt: null,
      },
      openDeals: 4,
      calls7d: 12,
    },
    {
      user: {
        id: TARGET_USER_ID,
        name: "Сабина",
        email: "sabina@mybooks.kz",
        crmRoleId: ROLE_MGR_ID,
        sipExtension: null,
        phone: null,
        staffDisabled: false,
        onShift: false,
        lastSeenAt: null,
      },
      openDeals: 1,
      calls7d: 0,
    },
  ],
  createStaff: async (_ctx, form) => {
    calls.createStaff(form);
    return state.staffInviteFail ? { error: state.staffInviteFail } : { ok: "Сотрудник добавлен. Логин: new@mybooks.kz" };
  },
  setStaffRole: async (_ctx, userId, roleId) => {
    calls.setStaffRole(userId, roleId);
  },
  setStaffExtension: async (_ctx, userId, extension) => {
    calls.setStaffExtension(userId, extension);
  },
  setStaffPhone: async (_ctx, userId, phone) => {
    calls.setStaffPhone(userId, phone);
    return state.staffPhoneFail ? { ok: false, message: state.staffPhoneFail } : { ok: true, message: "Телефон сохранён" };
  },
  setStaffDisabled: async (_ctx, userId, disabled) => {
    calls.setStaffDisabled(userId, disabled);
  },
  revokeStaff: async (_ctx, userId) => {
    calls.revokeStaff(userId);
  },
  resetStaffPassword: async (_ctx, userId) => {
    calls.resetStaffPassword(userId);
    return state.staffPasswordFail ? { ok: false, message: state.staffPasswordFail } : { ok: true, message: "Новый пароль для sabina@mybooks.kz: abc12345" };
  },
  listSharedTemplates: async () => [{ id: TPL_ID, title: "Приветствие", text: "Здравствуйте, {{name}}!" }],
  saveSharedTemplate: async (_ctx, form) => {
    calls.saveSharedTemplate(form);
    return state.templateFail ? { error: state.templateFail } : { ok: "Сохранено" };
  },
  deleteSharedTemplate: async (_ctx, id) => {
    calls.deleteSharedTemplate(id);
  },
};

const authOf = (u: typeof OWNER) => ({ cookie: `mb_session=${sessionOf(u)}` });

let app: NestFastifyApplication;

beforeAll(async () => {
  ({ app } = await bootTestApp({
    users: ALL_USERS,
    overrides: [
      [STAFF_ACCESS, staffAccess],
      [CRM_ADMIN_PORTS, mockPorts],
      [CLOCK, { now: () => new Date(clockMs) }],
    ],
  }));
});

afterAll(() => app.close());

beforeEach(() => {
  clockMs = Date.parse("2026-11-26T10:00:00.000Z");
  state.collectionsFail = false;
  state.syncFail = null;
  state.productFail = null;
  state.collectionFail = null;
  state.grantFail = null;
  state.limitFail = null;
  state.linkFail = null;
  state.promoFail = null;
  state.giftConfirmOk = true;
  state.siteStepFail = null;
  state.pricingWarning = undefined;
  state.pricingFail = null;
  state.staffInviteFail = null;
  state.staffPhoneFail = null;
  state.staffPasswordFail = null;
  state.templateFail = null;
  applyCatalog(null);
  applySiteFlags({ registration: true, giftNote: true });
  applySeller({});
  for (const fn of Object.values(calls)) fn.mockClear();
});

describe("Контекст 5A-2 — CRM каталог, маркетинг/ИИ-дизайнер и админка (35 маршрутов)", () => {
  it("реестр контракта содержит ровно 35 маршрутов (8 + 15 + 12)", () => {
    expect(Object.keys(crmCatalogRoutes)).toHaveLength(8);
    expect(Object.keys(crmMarketingRoutes)).toHaveLength(15);
    expect(Object.keys(crmAdminRoutes)).toHaveLength(12);
  });

  it("401 без входа, 403 не-сотрудник / отключённый / нет права / чужой Origin, 400 badData, 405 Allow", async () => {
    const noAuth = await app.inject({ method: "GET", url: "/api/v1/crm/catalog" });
    expect(noAuth.statusCode).toBe(401);

    for (const u of [REGULAR, DISABLED]) {
      const res = await app.inject({ method: "GET", url: "/api/v1/crm/site", headers: authOf(u) });
      expect(res.statusCode).toBe(403);
    }

    // Проверка @Permissions по всем группам прав
    for (const [method, url, payload] of [
      ["GET", "/api/v1/crm/catalog", undefined],
      ["POST", "/api/v1/crm/catalog/sync", undefined],
      ["GET", "/api/v1/crm/design-ai", undefined],
      ["POST", "/api/v1/crm/design-ai/grant", { userId: TARGET_USER_ID, count: 5 }],
      ["PUT", "/api/v1/crm/design-ai/limit", { limit: 10 }],
      ["GET", "/api/v1/crm/marketing", undefined],
      ["POST", "/api/v1/crm/marketing/links", { name: "Тест", kind: "site", utmSource: "ig" }],
      ["GET", "/api/v1/crm/promos", undefined],
      ["GET", "/api/v1/crm/gifts", undefined],
      ["GET", "/api/v1/crm/reviews", undefined],
      ["GET", "/api/v1/crm/site", undefined],
      ["GET", "/api/v1/crm/pricing", undefined],
      ["GET", "/api/v1/crm/team", undefined],
      ["GET", "/api/v1/crm/templates", undefined],
    ] as const) {
      const denied = await app.inject({ method, url, headers: authOf(NO_PERMS), payload });
      expect(denied.statusCode, `${method} ${url}`).toBe(403);
    }

    // Чужой Origin на мутации → 403
    const badOrigin = await app.inject({
      method: "POST",
      url: "/api/v1/crm/catalog/sync",
      headers: { ...authOf(OWNER), origin: "https://evil.example" },
    });
    expect(badOrigin.statusCode).toBe(403);

    // Кривой параметр → 400 (до проверки прав), неверный метод → 405 с Allow
    const badUuid = await app.inject({ method: "DELETE", url: "/api/v1/crm/templates/not-a-uuid", headers: authOf(NO_PERMS) });
    expect(badUuid.statusCode).toBe(400);

    const wrongMethod = await app.inject({ method: "DELETE", url: "/api/v1/crm/site", headers: authOf(OWNER) });
    expect(wrongMethod.statusCode).toBe(405);
    expect(wrongMethod.headers.allow).toContain("GET");
    expect(wrongMethod.headers.allow).toContain("PATCH");
  });

  it("все 10 GET-маршрутов отдают 200, ETag и 304 по If-None-Match", async () => {
    const urls = [
      "/api/v1/crm/catalog",
      "/api/v1/crm/design-ai?days=7",
      "/api/v1/crm/marketing?period=30",
      "/api/v1/crm/promos",
      "/api/v1/crm/gifts",
      "/api/v1/crm/reviews?s=new",
      "/api/v1/crm/site",
      "/api/v1/crm/pricing",
      "/api/v1/crm/team",
      "/api/v1/crm/templates",
    ];
    for (const url of urls) {
      const res = await app.inject({ method: "GET", url, headers: authOf(OWNER) });
      expect(res.statusCode, url).toBe(200);
      const etag = res.headers.etag;
      expect(typeof etag, url).toBe("string");
      expect(res.headers["cache-control"]).toBe("private, no-cache");

      const cached = await app.inject({ method: "GET", url, headers: { ...authOf(OWNER), "if-none-match": String(etag) } });
      expect(cached.statusCode, `${url} 304`).toBe(304);
      expect(cached.rawPayload.length).toBe(0);
    }
  });

  it("каталог WhatsApp (8 маршрутов): загрузка фото, токены/владение/TTL/лимиты, сохранение, скрытие, удаление, коллекции", async () => {
    // GET каталог с ошибкой коллекций не роняет ответ
    state.collectionsFail = true;
    const catErr = await app.inject({ method: "GET", url: "/api/v1/crm/catalog", headers: authOf(CATALOG_MGR) });
    expect(catErr.statusCode).toBe(200);
    expect(catErr.json()).toMatchObject({ collections: [], collectionsError: "GOWA timeout", link: "https://wa.me/c/77011234567" });
    state.collectionsFail = false;

    // POST sync: успех и refused
    const syncOk = await app.inject({ method: "POST", url: "/api/v1/crm/catalog/sync", headers: authOf(CATALOG_MGR) });
    expect(syncOk.statusCode).toBe(200);
    expect(syncOk.json()).toEqual({ ok: true, message: "Обновлено из WhatsApp: 12 товаров, убрано 2" });

    state.syncFail = "WhatsApp не подключён";
    const syncBad = await app.inject({ method: "POST", url: "/api/v1/crm/catalog/sync", headers: authOf(CATALOG_MGR) });
    expect(syncBad.statusCode).toBe(400);
    expect(syncBad.json()).toEqual({ error: "WhatsApp не подключён", code: "refused" });
    state.syncFail = null;

    // POST upload: не-multipart → 400, плохой MIME → refused, > 8 МБ → refused
    const notMp = await app.inject({ method: "POST", url: "/api/v1/crm/catalog/uploads", headers: authOf(CATALOG_MGR), payload: {} });
    expect(notMp.statusCode).toBe(400);

    const badMime = multipartFile("image", "doc.pdf", "application/pdf", Buffer.from("%PDF-1.4"));
    const badMimeRes = await app.inject({ method: "POST", url: "/api/v1/crm/catalog/uploads", headers: { ...authOf(CATALOG_MGR), ...badMime.headers }, payload: badMime.body });
    expect(badMimeRes.statusCode).toBe(400);
    expect(badMimeRes.json()).toEqual({ error: "Фото товара — JPEG, PNG или WebP", code: "refused" });

    const tooBig = multipartFile("image", "huge.jpg", "image/jpeg", Buffer.alloc(8 * 1024 * 1024 + 1, 0xff));
    const tooBigRes = await app.inject({ method: "POST", url: "/api/v1/crm/catalog/uploads", headers: { ...authOf(CATALOG_MGR), ...tooBig.headers }, payload: tooBig.body });
    expect(tooBigRes.statusCode).toBe(400);
    expect(tooBigRes.json()).toEqual({ error: "Фото больше 8 МБ — уменьшите", code: "refused" });

    // Успешная загрузка → чужой сотрудник не может использовать токен → владелец сохраняет → токен сгорает
    const goodImg = multipartFile("image", "book.jpg", "image/jpeg", JPEG_BYTES);
    const upRes = await app.inject({ method: "POST", url: "/api/v1/crm/catalog/uploads", headers: { ...authOf(CATALOG_MGR), ...goodImg.headers }, payload: goodImg.body });
    expect(upRes.statusCode).toBe(200);
    const [tok] = upRes.json().tokens as string[];
    expect(tok).toBeTruthy();

    const stolenRes = await app.inject({
      method: "POST",
      url: "/api/v1/crm/catalog/products",
      headers: authOf(OWNER),
      payload: { name: "Книга", uploads: [tok] },
    });
    expect(stolenRes.statusCode).toBe(400);
    expect(stolenRes.json().code).toBe("refused");

    // При отказе сохранения токен не удаляется
    state.productFail = "Сбой WhatsApp";
    const failSave = await app.inject({
      method: "POST",
      url: "/api/v1/crm/catalog/products",
      headers: authOf(CATALOG_MGR),
      payload: { name: "Книга", uploads: [tok] },
    });
    expect(failSave.statusCode).toBe(400);
    expect(failSave.json()).toEqual({ error: "Сбой WhatsApp", code: "refused" });
    state.productFail = null;
    calls.createProduct.mockClear();

    // Успешное создание с тем же токеном
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v1/crm/catalog/products",
      headers: authOf(CATALOG_MGR),
      payload: { name: "Книга новая", price: "29000", uploads: [tok] },
    });
    expect(createRes.statusCode).toBe(200);
    expect(createRes.json()).toEqual({ ok: true, message: "Товар добавлен — после проверки WhatsApp его увидят клиенты" });
    expect(calls.createProduct).toHaveBeenCalledTimes(1);
    const createdForm = calls.createProduct.mock.calls[0][0] as FormData;
    expect(createdForm.get("name")).toBe("Книга новая");
    expect(createdForm.getAll("image")).toHaveLength(1);

    // Повторное использование сожжённого токена → refused
    const reuseRes = await app.inject({
      method: "POST",
      url: "/api/v1/crm/catalog/products",
      headers: authOf(CATALOG_MGR),
      payload: { name: "Повтор", uploads: [tok] },
    });
    expect(reuseRes.statusCode).toBe(400);
    expect(reuseRes.json().code).toBe("refused");

    // Истечение TTL 30 минут → refused
    const up2 = await app.inject({ method: "POST", url: "/api/v1/crm/catalog/uploads", headers: { ...authOf(CATALOG_MGR), ...goodImg.headers }, payload: goodImg.body });
    const [tok2] = up2.json().tokens as string[];
    clockMs += 31 * 60_000;
    const expiredRes = await app.inject({
      method: "POST",
      url: "/api/v1/crm/catalog/products",
      headers: authOf(CATALOG_MGR),
      payload: { name: "Протухший", uploads: [tok2] },
    });
    expect(expiredRes.statusCode).toBe(400);
    expect(expiredRes.json().code).toBe("refused");

    // Обновление товара с keep
    const updRes = await app.inject({
      method: "POST",
      url: "/api/v1/crm/catalog/products",
      headers: authOf(CATALOG_MGR),
      payload: { id: "1001", name: "Книга ред.", keep: ["https://cdn.wa/p1.jpg"], hidden: true },
    });
    expect(updRes.statusCode).toBe(200);
    expect(updRes.json()).toEqual({ ok: true, message: "Товар сохранён — WhatsApp проверит изменения" });
    const updForm = calls.updateProduct.mock.calls[0][1] as FormData;
    expect(updForm.get("keepSet")).toBe("1");
    expect(updForm.getAll("keep")).toEqual(["https://cdn.wa/p1.jpg"]);
    expect(updForm.get("hidden")).toBe("true");

    // Скрыть / показать / удалить товар / коллекция сохранить и удалить
    const hideRes = await app.inject({ method: "POST", url: "/api/v1/crm/catalog/products/1001/hidden", headers: authOf(CATALOG_MGR), payload: { hidden: true } });
    expect(hideRes.statusCode).toBe(200);
    expect(hideRes.json()).toEqual({ ok: true, message: "Товар скрыт" });

    const showRes = await app.inject({ method: "POST", url: "/api/v1/crm/catalog/products/1001/hidden", headers: authOf(CATALOG_MGR), payload: { hidden: false } });
    expect(showRes.json()).toEqual({ ok: true, message: "Товар снова виден" });

    const delProd = await app.inject({ method: "DELETE", url: "/api/v1/crm/catalog/products/1001", headers: authOf(CATALOG_MGR) });
    expect(delProd.statusCode).toBe(200);
    expect(delProd.json()).toEqual({ ok: true, message: "Товар удалён" });

    const saveCol = await app.inject({ method: "POST", url: "/api/v1/crm/catalog/collections", headers: authOf(CATALOG_MGR), payload: { name: "Подарки", productIds: ["1001"] } });
    expect(saveCol.statusCode).toBe(200);
    expect(saveCol.json()).toEqual({ ok: true, message: "Коллекция сохранена" });

    const delCol = await app.inject({ method: "DELETE", url: "/api/v1/crm/catalog/collections/5001", headers: authOf(CATALOG_MGR) });
    expect(delCol.statusCode).toBe(200);
    expect(delCol.json()).toEqual({ ok: true, message: "Коллекция удалена" });
  });

  it("маркетинг, ИИ-дизайнер, промокоды, сертификаты и отзывы (15 маршрутов)", async () => {
    // ИИ-дизайнер: аналитик видит canEdit=false, но grant/limit ему 403
    const aiAnalyst = await app.inject({ method: "GET", url: "/api/v1/crm/design-ai?days=7", headers: authOf(ANALYST) });
    expect(aiAnalyst.statusCode).toBe(200);
    expect(aiAnalyst.json()).toMatchObject({ days: 7, canEdit: false, totals: { avgSeconds: 2.3 } });

    const grantDenied = await app.inject({ method: "POST", url: "/api/v1/crm/design-ai/grant", headers: authOf(ANALYST), payload: { userId: TARGET_USER_ID, count: 5 } });
    expect(grantDenied.statusCode).toBe(403);

    const grantOk = await app.inject({ method: "POST", url: "/api/v1/crm/design-ai/grant", headers: authOf(OWNER), payload: { userId: TARGET_USER_ID, count: 5 } });
    expect(grantOk.statusCode).toBe(200);
    expect(grantOk.json()).toEqual({ ok: true, message: "Подарено запросов: 5" });

    const limitOk = await app.inject({ method: "PUT", url: "/api/v1/crm/design-ai/limit", headers: authOf(OWNER), payload: { limit: 10 } });
    expect(limitOk.statusCode).toBe(200);
    expect(limitOk.json()).toEqual({ ok: true, message: "Готово: 10 бесплатных запросов на клиента." });

    // crmMarketing: достаточно ЛЮБОГО из двух прав (analytics.view ИЛИ promo.manage)
    const mAnalyst = await app.inject({ method: "GET", url: "/api/v1/crm/marketing", headers: authOf(ANALYST) });
    expect(mAnalyst.statusCode).toBe(200);
    expect(mAnalyst.json()).toMatchObject({ showAnalytics: true, canManage: false, archived: false });
    expect(mAnalyst.json().links).toHaveLength(1);

    const mMarketer = await app.inject({ method: "GET", url: "/api/v1/crm/marketing?archived=1", headers: authOf(MARKETER) });
    expect(mMarketer.statusCode).toBe(200);
    expect(mMarketer.json()).toMatchObject({ showAnalytics: false, canManage: true, archived: true });
    expect(mMarketer.json().links[0].target).toBe("в WhatsApp");

    // Создание и архивирование ссылки
    const linkOk = await app.inject({
      method: "POST",
      url: "/api/v1/crm/marketing/links",
      headers: authOf(MARKETER),
      payload: { name: "Новая ссылка", kind: "site", targetPath: "/gift", utmSource: "tg" },
    });
    expect(linkOk.statusCode).toBe(200);
    expect(linkOk.json()).toEqual({ ok: true, message: "Ссылка создана" });

    const archOk = await app.inject({
      method: "POST",
      url: `/api/v1/crm/marketing/links/${LINK_ID}/archive`,
      headers: authOf(MARKETER),
      payload: { archived: true },
    });
    expect(archOk.statusCode).toBe(200);
    expect(archOk.json()).toEqual({ ok: true, message: "Ссылка в архиве" });

    // Промокоды
    const promoOk = await app.inject({
      method: "POST",
      url: "/api/v1/crm/promos",
      headers: authOf(MARKETER),
      payload: { code: "SPRING10", kind: "percent", value: 10, maxUses: 100, expiresAt: "2026-12-31", note: "Весна" },
    });
    expect(promoOk.statusCode).toBe(200);
    expect(promoOk.json()).toEqual({ ok: true, message: "Промокод SPRING10 создан" });

    const promoToggle = await app.inject({ method: "POST", url: `/api/v1/crm/promos/${PROMO_ID}/toggle`, headers: authOf(MARKETER) });
    expect(promoToggle.statusCode).toBe(200);
    expect(promoToggle.json()).toEqual({ ok: true, message: null });

    // Сертификаты: список сортирует claimed выше, чек валидирует файл и 409, переотправка и отмена
    const giftsRes = await app.inject({ method: "GET", url: "/api/v1/crm/gifts", headers: authOf(OWNER) });
    expect(giftsRes.statusCode).toBe(200);
    expect(giftsRes.json().waiting[0].claimed).toBe(true);
    expect(giftsRes.json().totals).toEqual({ paid: 1, redeemed: 1, revenue: 29000, claimed: 1 });

    const noFileMp = multipartEmpty();
    const giftNoFile = await app.inject({ method: "POST", url: `/api/v1/crm/gifts/${GIFT_ID}/paid`, headers: { ...authOf(OWNER), ...noFileMp.headers }, payload: noFileMp.body });
    expect(giftNoFile.statusCode).toBe(400);
    expect(giftNoFile.json().code).toBe("receiptRequired");

    const badReceipt = multipartFile("file", "bad.txt", "text/plain", Buffer.from("not an image"));
    const giftBadType = await app.inject({ method: "POST", url: `/api/v1/crm/gifts/${GIFT_ID}/paid`, headers: { ...authOf(OWNER), ...badReceipt.headers }, payload: badReceipt.body });
    expect(giftBadType.statusCode).toBe(400);
    expect(giftBadType.json().code).toBe("receiptType");

    const bigReceipt = multipartFile("file", "big.png", "image/png", Buffer.concat([PNG_BYTES, Buffer.alloc(12 * 1024 * 1024, 0)]));
    const giftTooBig = await app.inject({ method: "POST", url: `/api/v1/crm/gifts/${GIFT_ID}/paid`, headers: { ...authOf(OWNER), ...bigReceipt.headers }, payload: bigReceipt.body });
    expect(giftTooBig.statusCode).toBe(400);
    expect(giftTooBig.json().code).toBe("receiptTooBig");

    const okReceipt = multipartFile("file", "check.png", "image/png", PNG_BYTES);
    state.giftConfirmOk = false;
    const giftConflict = await app.inject({ method: "POST", url: `/api/v1/crm/gifts/${GIFT_ID}/paid`, headers: { ...authOf(OWNER), ...okReceipt.headers }, payload: okReceipt.body });
    expect(giftConflict.statusCode).toBe(409);
    expect(giftConflict.json().code).toBe("giftNotPending");
    state.giftConfirmOk = true;

    const giftPaid = await app.inject({ method: "POST", url: `/api/v1/crm/gifts/${GIFT_ID}/paid`, headers: { ...authOf(OWNER), ...okReceipt.headers }, payload: okReceipt.body });
    expect(giftPaid.statusCode).toBe(200);
    expect(giftPaid.json()).toEqual({ ok: true, message: "Оплата подтверждена — код отправлен" });
    expect(calls.confirmGiftPayment).toHaveBeenCalledWith(GIFT_ID, { bytes: PNG_BYTES, fileName: "check.png" });

    const giftResend = await app.inject({ method: "POST", url: `/api/v1/crm/gifts/${GIFT_PAID_ID}/resend`, headers: authOf(OWNER) });
    expect(giftResend.statusCode).toBe(200);
    expect(giftResend.json()).toEqual({ ok: true, message: "Сертификат отправлен ещё раз" });

    const giftCancel = await app.inject({ method: "POST", url: `/api/v1/crm/gifts/${GIFT_ID}/cancel`, headers: authOf(OWNER) });
    expect(giftCancel.statusCode).toBe(200);
    expect(giftCancel.json()).toEqual({ ok: true, message: "Сертификат отменён" });

    // Отзывы и модерация
    const revList = await app.inject({ method: "GET", url: "/api/v1/crm/reviews?s=new", headers: authOf(OWNER) });
    expect(revList.statusCode).toBe(200);
    expect(revList.json().rows[0].blocker).toBeNull();
    expect(revList.json().rows[1].blocker).toBe("Автор не разрешил показывать отзыв на сайте");
    expect(revList.json().average).toBe("4.8 из 5");

    const revMod = await app.inject({ method: "POST", url: `/api/v1/crm/reviews/${REVIEW_ID}/publish`, headers: authOf(OWNER) });
    expect(revMod.statusCode).toBe(200);
    expect(revMod.json()).toEqual({ ok: true, message: "Отзыв на сайте" });
    expect(calls.moderateReview).toHaveBeenCalledWith(REVIEW_ID, "publish");
  });

  it("админка (12 маршрутов): сайт (шаги и отказ), цены (switch и warning), команда (isOwner/locked), общие шаблоны", async () => {
    // Сайт GET вызывает syncCatalogFromSettings
    const siteRes = await app.inject({ method: "GET", url: "/api/v1/crm/site", headers: authOf(OWNER) });
    expect(siteRes.statusCode).toBe(200);
    expect(calls.syncCatalogFromSettings).toHaveBeenCalledTimes(1);

    // Сайт PATCH: последовательные шаги
    const siteSaveOk = await app.inject({
      method: "PATCH",
      url: "/api/v1/crm/site",
      headers: authOf(OWNER),
      payload: { registration: false, giftNote: true, maxPhotos: 80, seller: { legalName: "ТОО Тест", bin: "123456789012", phone: "+77011234567", whatsapp: "77011234567" } },
    });
    expect(siteSaveOk.statusCode).toBe(200);
    expect(siteSaveOk.json().message).toContain("Регистрация обновлена.");
    expect(siteSaveOk.json().message).toContain("Реквизиты сохранены.");

    // Отказ на шаге maxPhotos прерывает цепочку до saveSeller
    calls.saveSeller.mockClear();
    state.siteStepFail = "maxPhotos";
    const siteSaveRefused = await app.inject({
      method: "PATCH",
      url: "/api/v1/crm/site",
      headers: authOf(OWNER),
      payload: { registration: true, maxPhotos: 9999, seller: { legalName: "ТОО", bin: "", phone: "", whatsapp: "" } },
    });
    expect(siteSaveRefused.statusCode).toBe(400);
    expect(siteSaveRefused.json()).toEqual({ error: "Лимит фото вне диапазона", code: "refused" });
    expect(calls.saveSeller).not.toHaveBeenCalled();
    state.siteStepFail = null;

    // Цены PUT: фильтрует *_visible != "on" и склеивает warning
    state.pricingWarning = "У бота старые цены";
    const pricingSave = await app.inject({
      method: "PUT",
      url: "/api/v1/crm/pricing",
      headers: authOf(OWNER),
      payload: { values: { plan_hardcover_price: "30000", plan_hardcover_visible: "on", plan_digital_visible: "" } },
    });
    expect(pricingSave.statusCode).toBe(200);
    expect(pricingSave.json()).toEqual({ ok: true, message: "Цены обновлены. У бота старые цены" });
    const pricingForm = calls.savePricing.mock.calls[0][0] as FormData;
    expect(pricingForm.get("plan_hardcover_visible")).toBe("on");
    expect(pricingForm.get("plan_digital_visible")).toBeNull();
    state.pricingWarning = undefined;

    // Команда GET: владелец vs не-владелец с team.manage (locked и inviteRoles)
    const teamAsHr = await app.inject({ method: "GET", url: "/api/v1/crm/team", headers: authOf(HR) });
    expect(teamAsHr.statusCode).toBe(200);
    const hrBody = teamAsHr.json();
    expect(hrBody.inviteRoles).toEqual([{ id: ROLE_MGR_ID, label: "Менеджер" }]);
    const ownerRowForHr = hrBody.members.find((m: { id: string }) => m.id === OWNER.id);
    const selfRowForHr = hrBody.members.find((m: { id: string }) => m.id === HR.id);
    const otherRowForHr = hrBody.members.find((m: { id: string }) => m.id === TARGET_USER_ID);
    expect(ownerRowForHr.locked).toBe(true);
    expect(selfRowForHr.locked).toBe(true);
    expect(otherRowForHr.locked).toBe(false);

    const teamAsOwner = await app.inject({ method: "GET", url: "/api/v1/crm/team", headers: authOf(OWNER) });
    expect(teamAsOwner.json().inviteRoles).toHaveLength(2);

    // Пригласить, обновить, отказ по телефону останавливает disabled, забрать доступ, сбросить пароль
    const invOk = await app.inject({
      method: "POST",
      url: "/api/v1/crm/team",
      headers: authOf(OWNER),
      payload: { email: "new@mybooks.kz", name: "Новый", roleId: ROLE_MGR_ID },
    });
    expect(invOk.statusCode).toBe(200);
    expect(invOk.json().message).toContain("new@mybooks.kz");

    const patchOk = await app.inject({
      method: "PATCH",
      url: `/api/v1/crm/team/${TARGET_USER_ID}`,
      headers: authOf(OWNER),
      payload: { roleId: ROLE_MGR_ID, extension: "105", phone: "+77015556677", disabled: true },
    });
    expect(patchOk.statusCode).toBe(200);
    expect(calls.setStaffRole).toHaveBeenCalledWith(TARGET_USER_ID, ROLE_MGR_ID);
    expect(calls.setStaffExtension).toHaveBeenCalledWith(TARGET_USER_ID, "105");
    expect(calls.setStaffPhone).toHaveBeenCalledWith(TARGET_USER_ID, "+77015556677");
    expect(calls.setStaffDisabled).toHaveBeenCalledWith(TARGET_USER_ID, true);

    calls.setStaffDisabled.mockClear();
    state.staffPhoneFail = "Проверьте номер";
    const patchBadPhone = await app.inject({
      method: "PATCH",
      url: `/api/v1/crm/team/${TARGET_USER_ID}`,
      headers: authOf(OWNER),
      payload: { phone: "123", disabled: true },
    });
    expect(patchBadPhone.statusCode).toBe(400);
    expect(patchBadPhone.json()).toEqual({ error: "Проверьте номер", code: "refused" });
    expect(calls.setStaffDisabled).not.toHaveBeenCalled();
    state.staffPhoneFail = null;

    const revOk = await app.inject({ method: "POST", url: `/api/v1/crm/team/${TARGET_USER_ID}/revoke`, headers: authOf(OWNER) });
    expect(revOk.statusCode).toBe(200);
    expect(revOk.json()).toEqual({ ok: true, message: "Доступ к CRM забран" });

    const pwdOk = await app.inject({ method: "POST", url: `/api/v1/crm/team/${TARGET_USER_ID}/password`, headers: authOf(OWNER) });
    expect(pwdOk.statusCode).toBe(200);
    expect(pwdOk.json().message).toContain("sabina@mybooks.kz");

    state.staffPasswordFail = "Свои доступы меняет другой руководитель";
    const pwdBad = await app.inject({ method: "POST", url: `/api/v1/crm/team/${OWNER.id}/password`, headers: authOf(OWNER) });
    expect(pwdBad.statusCode).toBe(400);
    expect(pwdBad.json()).toEqual({ error: "Свои доступы меняет другой руководитель", code: "refused" });

    // Общие шаблоны ответов
    const tplSave = await app.inject({
      method: "POST",
      url: "/api/v1/crm/templates",
      headers: authOf(OWNER),
      payload: { id: TPL_ID, title: "Оплата", text: "Ссылка на оплату" },
    });
    expect(tplSave.statusCode).toBe(200);
    expect(tplSave.json()).toEqual({ ok: true, message: "Шаблон сохранён" });

    const tplDel = await app.inject({ method: "DELETE", url: `/api/v1/crm/templates/${TPL_ID}`, headers: authOf(OWNER) });
    expect(tplDel.statusCode).toBe(200);
    expect(tplDel.json()).toEqual({ ok: true, message: "Шаблон удалён" });
  });
});
