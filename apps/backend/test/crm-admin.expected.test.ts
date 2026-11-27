import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { crmAdminRoutes, crmCatalogRoutes, crmMarketingRoutes } from "@mybook/contracts";
import { applyCatalog, applySeller, applySiteFlags } from "@/config/site";
import { StaffContext } from "@/modules/access/domain/StaffContext";
import { isPhoneEmail } from "@/modules/identity";
import { allPermissions, type Permission } from "@/shared/domain/permissions";
import { STAFF_ACCESS, type StaffAccessPort } from "../src/core/auth/staff";
import { CRM_ADMIN_PORTS } from "../src/modules/crm-admin/crm-admin.tokens";
import { bootTestApp, sessionOf, testUser } from "./app";

const OWNER = testUser("11111111-1111-4111-8111-111111111111", { name: "Айгерим", email: "owner@mybooks.kz", role: "admin" });
const ANALYST = testUser("22222222-2222-4222-8222-222222222222", { name: "Аналитик", email: "analyst@mybooks.kz", role: "admin" });
const MARKETER = testUser("33333333-3333-4333-8333-333333333333", { name: "Маркетолог", email: "marketer@mybooks.kz", role: "admin" });
const HR = testUser("44444444-4444-4444-8444-444444444444", { name: "Тимлид", email: "hr@mybooks.kz", role: "admin", crmRoleId: "aaaa0000-0000-4000-8000-000000000002" });
const NO_PERMS = testUser("66666666-6666-4666-8666-666666666666", { name: "Стажёр", email: "intern@mybooks.kz", role: "admin" });
const REGULAR = testUser("88888888-8888-4888-8888-888888888888", { name: "Клиент", email: "client@mybooks.kz", role: "user" });
const ALL_USERS = [OWNER, ANALYST, MARKETER, HR, NO_PERMS, REGULAR];

const ROLE_OWNER_ID = "aaaa0000-0000-4000-8000-000000000001";
const ROLE_MGR_ID = "aaaa0000-0000-4000-8000-000000000002";
const LINK_ID = "bbbb0000-0000-4000-8000-000000000001";
const PROMO_ID = "cccc0000-0000-4000-8000-000000000001";
const GIFT_ID = "dddd0000-0000-4000-8000-000000000001";
const REVIEW_ID = "eeee0000-0000-4000-8000-000000000001";
const ORDER_ID = "ffff0000-0000-4000-8000-000000000001";
const TPL_ID = "99990000-0000-4000-8000-000000000001";
const TARGET_USER_ID = "12121212-1212-4121-8121-121212121212";
const FIXED_UPLOAD_TOKEN = "77777777-7777-4777-8777-777777777777";

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

const makeCtx = (id: string, roleName: string, scope: "all" | "own", perms: readonly Permission[], isOwner = false) =>
  new StaffContext(id, roleName, isOwner ? "owner" : null, scope, new Set(perms), isOwner, { isPhoneEmail });

function resolveStaffSync(user: typeof OWNER) {
  if (user.role !== "admin" || user.staffDisabled) return null;
  if (user.id === OWNER.id) return makeCtx(user.id, "Руководитель", "all", allPermissions, true);
  if (user.id === ANALYST.id) return makeCtx(user.id, "Аналитик", "all", ["analytics.view"]);
  if (user.id === MARKETER.id) return makeCtx(user.id, "Маркетолог", "all", ["promo.manage"]);
  if (user.id === HR.id) return makeCtx(user.id, "Тимлид", "all", ["team.manage"]);
  if (user.id === NO_PERMS.id) return makeCtx(user.id, "Стажёр", "own", []);
  return null;
}

const staffAccess: StaffAccessPort = {
  async resolve(user) {
    const context = resolveStaffSync(user);
    return context ? { context, gate: null } : null;
  },
};

const shared = vi.hoisted(() => ({
  collectionsFail: false,
  syncProblem: null as string | null,
  catalogSyncFail: null as string | null,
  productFail: null as string | null,
  collectionFail: null as string | null,
  grantFail: null as string | null,
  limitFail: null as string | null,
  linkFail: null as string | null,
  promoFail: null as string | null,
  giftNotPending: false,
  siteFail: null as string | null,
  pricingWarning: undefined as string | undefined,
  pricingFail: null as string | null,
  teamInviteFail: null as string | null,
  teamPhoneFail: null as string | null,
  teamPasswordFail: null as string | null,
  templateFail: null as string | null,
}));

const mockContainer = {
  messaging: {
    catalog: {
      syncIfStale: async () => shared.syncProblem,
      list: async () => [
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
      lastSyncedAt: async () => new Date("2026-11-26T09:30:00Z"),
      collections: async () => {
        if (shared.collectionsFail) throw new Error("GOWA timeout");
        return [{ id: "5001", name: "Хиты", productIds: ["1001"] }];
      },
    },
    gowa: {
      cachedStatus: async () => ({ phone: "77011234567" }),
    },
  },
  assistant: {
    designSettings: async () => ({ enabled: true }),
  },
  marketing: {
    service: {
      report: async () => ({
        total: { clicks: 200, leads: 40, registrations: 20, startedBook: 10, sales: 5, revenue: 145000, spend: 50000 },
        channels: [
          { key: "instagram", label: "Instagram", clicks: 150, leads: 30, registrations: 15, startedBook: 8, sales: 4, revenue: 116000, spend: 40000 },
        ],
        links: new Map([["ig-bio", { clicks: 100, leads: 20, registrations: 10, sales: 3, revenue: 87000 }]]),
      }),
      target: async (l: { kind: string; targetPath: string }) =>
        l.kind === "whatsapp" ? "https://wa.me/77011234567" : `https://mybooks.kz${l.targetPath}`,
      shortUrl: (slug: string) => `https://mybooks.kz/go/${slug}`,
    },
    links: {
      all: async () => [
        {
          id: LINK_ID,
          name: "Instagram шапка",
          slug: "ig-bio",
          kind: "site" as const,
          targetPath: "/gift",
          waText: "",
          utmSource: "instagram",
          utmMedium: "social",
          utmCampaign: "bio",
          utmContent: "",
          archived: false,
          createdAt: new Date("2026-11-01T10:00:00Z"),
        },
      ],
    },
  },
  ordering: {
    queries: {
      promoStats: async () => [
        {
          promo: {
            id: PROMO_ID,
            code: "WINTER15",
            kind: "percent" as const,
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
      recentGifts: async () => [
        {
          id: GIFT_ID,
          number: 101,
          status: "pending_payment" as const,
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
          paymentClaimedAt: new Date("2026-11-25T11:00:00Z"),
          promo: null,
          receiptStorageKey: null,
        },
        {
          id: "dddd0000-0000-4000-8000-000000000002",
          number: 100,
          status: "paid" as const,
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
          paymentClaimedAt: null,
          promo: { code: "GIFT-100", usedCount: 1 },
          receiptStorageKey: "receipts/g100.png",
        },
      ],
    },
    gifts: {
      confirmManual: async () =>
        shared.giftNotPending
          ? null
          : {
              number: 101,
              snapshot: () => ({ amount: 29000, receipt: { fileName: "check.png" } }),
            },
    },
  },
  feedback: {
    queries: {
      list: async () => [
        {
          id: REVIEW_ID,
          status: "new" as const,
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
      ],
      counts: async () => ({ new: 1, published: 10, hidden: 1 }),
      summary: async () => ({ count: 10, average: 4.9 }),
    },
  },
  access: {
    queries: {
      roles: async () => [
        { id: ROLE_OWNER_ID, name: "Руководитель", key: "owner" },
        { id: ROLE_MGR_ID, name: "Менеджер", key: null },
      ],
      team: async () => [
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
      ],
    },
  },
  workspace: {
    templates: {
      list: async () => [{ id: TPL_ID, title: "Приветствие", text: "Здравствуйте, {{name}}!" }],
    },
  },
};

vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return { ...actual, randomUUID: () => FIXED_UPLOAD_TOKEN };
});
vi.mock("@/server/container", () => ({ container: () => mockContainer }));
vi.mock("@/server/catalog", () => ({
  ensureCatalog: async () => {},
  syncCatalogFromSettings: async () => {},
}));
vi.mock("@/server/photoLimit", () => ({ maxPhotos: async () => 120 }));
vi.mock("@/server/designAiStore", () => ({ designAiFreeLimit: async () => 5 }));
vi.mock("@/server/designAiStats", () => ({
  designAiStats: async () => ({
    totals: { ok: 40, failed: 2, users: 15, free: 30, credit: 10, costUsd: 1.25, avgMs: 2340 },
    people: { used: 15, hitLimit: 4, withCredits: 3, creditsLeft: 18 },
    purchases: { paid: 2, paidAmount: 9800, pending: 1, pendingAmount: 4900 },
    byMode: [{ key: "edit", requests: 25, costUsd: 0.7 }],
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
}));
vi.mock("@/server/auth", async () => {
  const shim = await import("@/shared/infrastructure/http/request");
  return {
    getCurrentUser: async () => {
      const jar = await shim.cookies();
      const hdrs = await shim.headers();
      const bearer = hdrs.get("authorization")?.match(/^Bearer ([A-Za-z0-9_-]{20,200})$/)?.[1] ?? null;
      const tok = jar.get("mb_session")?.value ?? bearer;
      return tok ? ALL_USERS.find((u) => sessionOf(u) === tok) ?? null : null;
    },
  };
});
vi.mock("@/server/access", async () => {
  const { getCurrentUser } = await import("@/server/auth");
  const FORBIDDEN_ERROR = Symbol.for("mybook.forbidden-error");
  class MockForbiddenError extends Error {
    constructor(message = "Недостаточно прав") {
      super(message);
      Reflect.set(this, FORBIDDEN_ERROR, true);
    }
    static is(err: unknown): err is MockForbiddenError {
      return err instanceof MockForbiddenError;
    }
  }
  return {
    ForbiddenError: MockForbiddenError,
    audit: async () => {},
    getStaff: async () => {
      const u = await getCurrentUser();
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
    },
    can: (staff: { context: StaffContext } | null, ...perms: Permission[]) => Boolean(staff?.context.can(...perms)),
  };
});
vi.mock("@/server/crm-actions/catalog", () => ({
  syncCatalogAction: async () => (shared.catalogSyncFail ? { ok: false, error: shared.catalogSyncFail } : { ok: true, total: 12, removed: 2 }),
  createProductAction: async () => (shared.productFail ? { ok: false, error: shared.productFail } : { ok: true, id: "1002" }),
  updateProductAction: async () => (shared.productFail ? { ok: false, error: shared.productFail } : { ok: true }),
  setProductHiddenAction: async () => (shared.productFail ? { ok: false, error: shared.productFail } : { ok: true }),
  deleteProductAction: async () => (shared.productFail ? { ok: false, error: shared.productFail } : { ok: true }),
  saveCollectionAction: async () => (shared.collectionFail ? { ok: false, error: shared.collectionFail } : { ok: true }),
  deleteCollectionAction: async () => (shared.collectionFail ? { ok: false, error: shared.collectionFail } : { ok: true }),
}));
vi.mock("@/server/crm-actions/ai-designer", () => ({
  grantCreditsAction: async () => (shared.grantFail ? { error: shared.grantFail } : { ok: "+5" }),
  saveFreeLimitAction: async () => (shared.limitFail ? { error: shared.limitFail } : { ok: "Готово: 10 бесплатных запросов на клиента." }),
}));
vi.mock("@/server/crm-actions/marketing", () => ({
  createLinkAction: async () => (shared.linkFail ? { error: shared.linkFail } : { ok: "Ссылка создана" }),
  archiveLinkAction: async () => {},
}));
vi.mock("@/server/crm-actions/admin", () => ({
  createPromoAction: async () => (shared.promoFail ? { error: shared.promoFail } : { ok: "Промокод SPRING10 создан" }),
  togglePromoAction: async () => {},
}));
vi.mock("@/server/crm-actions/gifts", () => ({
  resendGiftAction: async () => {},
  cancelGiftAction: async () => {},
}));
vi.mock("@/server/crm-actions/reviews", () => ({
  moderateReviewAction: async () => {},
}));
vi.mock("@/server/crm-actions/site", () => ({
  setRegistrationAction: async () => (shared.siteFail ? { error: shared.siteFail } : { ok: "Регистрация обновлена." }),
  setGiftNoteAction: async () => ({ ok: "Открытка обновлена." }),
  setMaxPhotosAction: async () => ({ ok: "Предел фото сохранён." }),
  saveSellerAction: async () => ({ ok: "Реквизиты сохранены." }),
}));
vi.mock("@/server/crm-actions/pricing", () => ({
  savePricingAction: async () =>
    shared.pricingFail
      ? { error: shared.pricingFail }
      : { ok: "Цены обновлены", ...(shared.pricingWarning ? { warning: shared.pricingWarning } : {}) },
}));
vi.mock("@/server/crm-actions/team", () => ({
  createStaffAction: async () => (shared.teamInviteFail ? { error: shared.teamInviteFail } : { ok: "Сотрудник добавлен" }),
  setStaffRoleAction: async () => {},
  setStaffExtensionAction: async () => {},
  setStaffPhoneAction: async () => (shared.teamPhoneFail ? { ok: false, message: shared.teamPhoneFail } : { ok: true, message: "Телефон сохранён" }),
  setStaffDisabledAction: async () => {},
  revokeStaffAction: async () => {},
  resetStaffPasswordAction: async () => (shared.teamPasswordFail ? { ok: false, message: shared.teamPasswordFail } : { ok: true, message: "Новый пароль отправлен" }),
}));
vi.mock("@/server/crm-actions/settings-crm", () => ({
  saveTemplateAction: async () => (shared.templateFail ? { error: shared.templateFail } : { ok: "Сохранено" }),
  deleteTemplateAction: async () => {},
}));

const { assertRoute } = await import("./expected");
const { legacyCrmAdminPorts } = await import("../src/legacy/crm-admin.ports");

function multipartFile(field: string, filename: string, contentType: string, data: Buffer) {
  const boundary = "----ParityAdminBoundary4f9a";
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`),
    data,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { headers: { "content-type": `multipart/form-data; boundary=${boundary}` }, body };
}

function multipartEmpty() {
  const boundary = "----ParityAdminBoundaryEmpty";
  const body = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="note"\r\n\r\n1\r\n--${boundary}--\r\n`);
  return { headers: { "content-type": `multipart/form-data; boundary=${boundary}` }, body };
}

const asOwner = { cookie: `mb_session=${sessionOf(OWNER)}` };
const asAnalyst = { cookie: `mb_session=${sessionOf(ANALYST)}` };
const asMarketer = { cookie: `mb_session=${sessionOf(MARKETER)}` };
const asHr = { cookie: `mb_session=${sessionOf(HR)}` };
const asNoPerms = { cookie: `mb_session=${sessionOf(NO_PERMS)}` };
const asRegular = { cookie: `mb_session=${sessionOf(REGULAR)}` };

let app: NestFastifyApplication;

beforeAll(async () => {
  const factoryProvider = legacyCrmAdminPorts as { useFactory: (c: unknown) => unknown };
  const realPorts = factoryProvider.useFactory(mockContainer);
  ({ app } = await bootTestApp({
    users: ALL_USERS,
    overrides: [
      [STAFF_ACCESS, staffAccess],
      [CRM_ADMIN_PORTS, realPorts],
    ],
  }));
});

afterAll(() => app.close());

beforeEach(() => {
  shared.collectionsFail = false;
  shared.syncProblem = null;
  shared.catalogSyncFail = null;
  shared.productFail = null;
  shared.collectionFail = null;
  shared.grantFail = null;
  shared.limitFail = null;
  shared.linkFail = null;
  shared.promoFail = null;
  shared.giftNotPending = false;
  shared.siteFail = null;
  shared.pricingWarning = undefined;
  shared.pricingFail = null;
  shared.teamInviteFail = null;
  shared.teamPhoneFail = null;
  shared.teamPasswordFail = null;
  shared.templateFail = null;
  applyCatalog(null);
  applySiteFlags({ registration: true, giftNote: true });
  applySeller({});
});

type ContextRouteKey = keyof typeof crmCatalogRoutes | keyof typeof crmMarketingRoutes | keyof typeof crmAdminRoutes;

const PARITY_CASES: Record<
  ContextRouteKey,
  { method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; url: string; body?: Record<string, unknown>; multipart?: "catalog" | "gift" }
> = {
  // Каталог (8)
  crmCatalog: { method: "GET", url: "/api/v1/crm/catalog" },
  crmCatalogSync: { method: "POST", url: "/api/v1/crm/catalog/sync" },
  crmCatalogUpload: { method: "POST", url: "/api/v1/crm/catalog/uploads", multipart: "catalog" },
  crmCatalogSave: {
    method: "POST",
    url: "/api/v1/crm/catalog/products",
    body: { name: "Книга с фото", price: "29000", uploads: [FIXED_UPLOAD_TOKEN] },
  },
  crmCatalogHidden: { method: "POST", url: "/api/v1/crm/catalog/products/1001/hidden", body: { hidden: true } },
  crmCatalogDelete: { method: "DELETE", url: "/api/v1/crm/catalog/products/1001" },
  crmCatalogCollectionSave: { method: "POST", url: "/api/v1/crm/catalog/collections", body: { name: "Хиты", productIds: ["1001"] } },
  crmCatalogCollectionDelete: { method: "DELETE", url: "/api/v1/crm/catalog/collections/5001" },

  // Маркетинг и ИИ-дизайнер (15)
  crmDesignAi: { method: "GET", url: "/api/v1/crm/design-ai?days=30" },
  crmDesignAiGrant: { method: "POST", url: "/api/v1/crm/design-ai/grant", body: { userId: TARGET_USER_ID, count: 5 } },
  crmDesignAiLimit: { method: "PUT", url: "/api/v1/crm/design-ai/limit", body: { limit: 10 } },
  crmMarketing: { method: "GET", url: "/api/v1/crm/marketing?period=30" },
  crmMarketingLinkCreate: {
    method: "POST",
    url: "/api/v1/crm/marketing/links",
    body: { name: "Instagram шапка", kind: "site", targetPath: "/gift", utmSource: "instagram" },
  },
  crmMarketingLinkArchive: { method: "POST", url: `/api/v1/crm/marketing/links/${LINK_ID}/archive`, body: { archived: true } },
  crmPromos: { method: "GET", url: "/api/v1/crm/promos" },
  crmPromoCreate: {
    method: "POST",
    url: "/api/v1/crm/promos",
    body: { code: "SPRING10", kind: "percent", value: 10, maxUses: 50, expiresAt: "2026-12-31", note: "Акция" },
  },
  crmPromoToggle: { method: "POST", url: `/api/v1/crm/promos/${PROMO_ID}/toggle` },
  crmGifts: { method: "GET", url: "/api/v1/crm/gifts" },
  crmGiftPaid: { method: "POST", url: `/api/v1/crm/gifts/${GIFT_ID}/paid`, multipart: "gift" },
  crmGiftResend: { method: "POST", url: `/api/v1/crm/gifts/${GIFT_ID}/resend` },
  crmGiftCancel: { method: "POST", url: `/api/v1/crm/gifts/${GIFT_ID}/cancel` },
  crmReviews: { method: "GET", url: "/api/v1/crm/reviews?s=new" },
  crmReviewModerate: { method: "POST", url: `/api/v1/crm/reviews/${REVIEW_ID}/publish` },

  // Админка (12)
  crmSite: { method: "GET", url: "/api/v1/crm/site" },
  crmSiteSave: {
    method: "PATCH",
    url: "/api/v1/crm/site",
    body: { registration: true, giftNote: false, maxPhotos: 100 },
  },
  crmPricing: { method: "GET", url: "/api/v1/crm/pricing" },
  crmPricingSave: {
    method: "PUT",
    url: "/api/v1/crm/pricing",
    body: { values: { plan_hardcover_price: "30000", plan_hardcover_visible: "on" } },
  },
  crmTeam: { method: "GET", url: "/api/v1/crm/team" },
  crmTeamInvite: {
    method: "POST",
    url: "/api/v1/crm/team",
    body: { email: "new@mybooks.kz", name: "Новый", roleId: ROLE_MGR_ID },
  },
  crmTeamMember: {
    method: "PATCH",
    url: `/api/v1/crm/team/${HR.id}`,
    body: { roleId: ROLE_MGR_ID, extension: "109", phone: "+77019998877", disabled: false },
  },
  crmTeamRevoke: { method: "POST", url: `/api/v1/crm/team/${HR.id}/revoke` },
  crmTeamPassword: { method: "POST", url: `/api/v1/crm/team/${HR.id}/password` },
  crmTemplates: { method: "GET", url: "/api/v1/crm/templates" },
  crmTemplateSave: {
    method: "POST",
    url: "/api/v1/crm/templates",
    body: { title: "Приветствие", text: "Здравствуйте!" },
  },
  crmTemplateDelete: { method: "DELETE", url: `/api/v1/crm/templates/${TPL_ID}` },
};

describe("ответы Nest байт в байт (эталон — прежний mybook-api) (Контекст 5A-2 — все 35 маршрутов)", () => {
  it("все 35 маршрутов совпадают байт в байт на успешном ответе (GET — с ETag и 304)", async () => {
    const expectedKeys = [
      ...Object.keys(crmCatalogRoutes),
      ...Object.keys(crmMarketingRoutes),
      ...Object.keys(crmAdminRoutes),
    ] as ContextRouteKey[];
    expect(expectedKeys).toHaveLength(35);
    expect(Object.keys(PARITY_CASES).sort()).toEqual([...expectedKeys].sort());

    for (const key of Object.keys(PARITY_CASES) as ContextRouteKey[]) {
      const c = PARITY_CASES[key];
      if (c.multipart === "catalog") {
        const mp = multipartFile("image", "photo.jpg", "image/jpeg", JPEG_BYTES);
        await assertRoute({
          nest: app,
          method: c.method,
          url: c.url,
          headers: { ...asOwner, ...mp.headers },
          body: mp.body,
        });
      } else if (c.multipart === "gift") {
        const mp = multipartFile("file", "check.png", "image/png", PNG_BYTES);
        await assertRoute({
          nest: app,
          method: c.method,
          url: c.url,
          headers: { ...asOwner, ...mp.headers },
          body: mp.body,
        });
      } else {
        await assertRoute({
          nest: app,
          method: c.method,
          url: c.url,
          headers: asOwner,
          body: c.body,
        });
      }
    }
  });

  it("ветки ошибок, прав и особых случаев совпадают байт в байт", async () => {
    // 401 без входа и 403 не-сотрудник / нет права / чужой Origin
    await assertRoute({ nest: app, method: "GET", url: "/api/v1/crm/catalog" });
    await assertRoute({ nest: app, method: "GET", url: "/api/v1/crm/site", headers: asRegular });
    await assertRoute({ nest: app, method: "GET", url: "/api/v1/crm/promos", headers: asNoPerms });
    await assertRoute({
      nest: app,
      method: "POST",
      url: "/api/v1/crm/catalog/sync",
      headers: { ...asOwner, origin: "https://evil.example" },
    });

    // crmMarketing: ИЛИ-право (analytics.view, promo.manage, ни того ни другого)
    await assertRoute({ nest: app, method: "GET", url: "/api/v1/crm/marketing", headers: asAnalyst });
    await assertRoute({ nest: app, method: "GET", url: "/api/v1/crm/marketing", headers: asMarketer });
    await assertRoute({ nest: app, method: "GET", url: "/api/v1/crm/marketing", headers: asNoPerms });

    // crmTeam: не-владелец с team.manage (locked и inviteRoles)
    await assertRoute({ nest: app, method: "GET", url: "/api/v1/crm/team", headers: asHr });

    // 400 badData и 405 Allow
    await assertRoute({ nest: app, method: "DELETE", url: "/api/v1/crm/templates/bad-uuid", headers: asOwner });
    await assertRoute({ nest: app, method: "DELETE", url: "/api/v1/crm/site", headers: asOwner });

    // Каталог: ошибка коллекций + problem, плохой MIME, просроченный токен, refused на sync
    shared.collectionsFail = true;
    shared.syncProblem = "Нет связи с WhatsApp";
    await assertRoute({ nest: app, method: "GET", url: "/api/v1/crm/catalog", headers: asOwner });
    shared.collectionsFail = false;
    shared.syncProblem = null;

    const badImg = multipartFile("image", "bad.gif", "image/gif", Buffer.from("GIF89a"));
    await assertRoute({ nest: app, method: "POST", url: "/api/v1/crm/catalog/uploads", headers: { ...asOwner, ...badImg.headers }, body: badImg.body });

    await assertRoute({
      nest: app,
      method: "POST",
      url: "/api/v1/crm/catalog/products",
      headers: asOwner,
      body: { name: "Без загруженного фото", uploads: ["missing-token"] },
    });

    shared.catalogSyncFail = "Шлюз недоступен";
    await assertRoute({ nest: app, method: "POST", url: "/api/v1/crm/catalog/sync", headers: asOwner });
    shared.catalogSyncFail = null;

    // Чек сертификата: нет файла (400), плохой тип (400), уже оплачен (409)
    const emptyMp = multipartEmpty();
    await assertRoute({ nest: app, method: "POST", url: `/api/v1/crm/gifts/${GIFT_ID}/paid`, headers: { ...asOwner, ...emptyMp.headers }, body: emptyMp.body });

    const badRec = multipartFile("file", "bad.txt", "text/plain", Buffer.from("hello"));
    await assertRoute({ nest: app, method: "POST", url: `/api/v1/crm/gifts/${GIFT_ID}/paid`, headers: { ...asOwner, ...badRec.headers }, body: badRec.body });

    shared.giftNotPending = true;
    const okRec = multipartFile("file", "check.png", "image/png", PNG_BYTES);
    await assertRoute({ nest: app, method: "POST", url: `/api/v1/crm/gifts/${GIFT_ID}/paid`, headers: { ...asOwner, ...okRec.headers }, body: okRec.body });
    shared.giftNotPending = false;

    // Refused на маркетинге и админке + warning на ценах
    shared.grantFail = "От 1 до 200";
    await assertRoute({ nest: app, method: "POST", url: "/api/v1/crm/design-ai/grant", headers: asOwner, body: { userId: TARGET_USER_ID, count: 500 } });
    shared.grantFail = null;

    shared.promoFail = "Промокод уже есть";
    await assertRoute({ nest: app, method: "POST", url: "/api/v1/crm/promos", headers: asOwner, body: { code: "DUP10", kind: "percent", value: 10 } });
    shared.promoFail = null;

    shared.siteFail = "Ошибка настроек сайта";
    await assertRoute({ nest: app, method: "PATCH", url: "/api/v1/crm/site", headers: asOwner, body: { registration: false } });
    shared.siteFail = null;

    shared.pricingWarning = "У бота старые суммы";
    await assertRoute({ nest: app, method: "PUT", url: "/api/v1/crm/pricing", headers: asOwner, body: { values: { plan_hardcover_price: "31000", plan_hardcover_visible: "on" } } });
    shared.pricingWarning = undefined;

    shared.teamPhoneFail = "Проверьте номер: нужно не меньше 10 цифр";
    await assertRoute({ nest: app, method: "PATCH", url: `/api/v1/crm/team/${HR.id}`, headers: asOwner, body: { phone: "123" } });
    shared.teamPhoneFail = null;

    shared.teamPasswordFail = "Свои доступы меняет другой руководитель";
    await assertRoute({ nest: app, method: "POST", url: `/api/v1/crm/team/${OWNER.id}/password`, headers: asOwner });
    shared.teamPasswordFail = null;

    shared.templateFail = "Название шаблона";
    await assertRoute({ nest: app, method: "POST", url: "/api/v1/crm/templates", headers: asOwner, body: { title: "X", text: "Y" } });
    shared.templateFail = null;
  });
});
