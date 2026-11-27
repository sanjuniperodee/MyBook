import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, beforeAll, beforeEach, describe, it, vi } from "vitest";
import { applySiteFlags } from "@/config/site";
import { LOCALE_HEADER, type Locale } from "@/i18n/config";
import type { Messages } from "@/i18n/messages";
import { sectionHref as sectionLink } from "@/lib/book/hub-model";
import type { CabinetBookHubSource, CabinetPhotosSource, CabinetShelfSourceItem } from "@/lib/cabinet/views";
import { AuthoringError, type BookRow, type BookViewer } from "@/modules/authoring";
import { IdentityError, User, type CurrentUser } from "@/modules/identity";
import { toWebSessionUser } from "@/modules/identity/ui/session";
import { issueTicket } from "@/shared/two-factor-ticket";
import {
  CABINET_BOOK_PORTS,
  CABINET_WEB_PORTS,
  IDENTITY_ACCOUNTS,
  IDENTITY_AUTH,
  MOBILE_DEVICES,
} from "../src/modules/identity/identity.tokens";
import { bootTestApp, sessionOf, testUser, type FakeLimiter } from "./app";

const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const STAFF_ID = "22222222-2222-4222-8222-222222222222";
const BOOK_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PHOTO_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const QUESTION_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ORDER_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const DEVICE_TOKEN = "fcm_parity_token_0123456789abcdefghijklmnopqrstuvwxyz";
const RESET_TOKEN = "reset_parity_token_0123456789abcdef";

const CLIENT = testUser(CLIENT_ID, { name: "Айгерим", email: "aigerim@example.kz", phone: "+77011112233", locale: "ru" });
const STAFF = testUser(STAFF_ID, { name: "Руководитель", email: "owner@mybook.kz", role: "admin", totpEnabledAt: new Date("2026-10-01T00:00:00Z"), totpSecret: "enc" });

const domainUser = User.restore(CLIENT_ID, {
  email: "aigerim@example.kz",
  name: "Айгерим",
  phone: "+77011112233",
  passwordHash: "hash",
  role: "user",
  locale: "ru",
  staffDisabled: false,
  source: null,
  twoFactor: { encryptedSecret: null, enabledAt: null, backupHashes: [] },
  createdAt: new Date("2026-10-01T10:00:00Z"),
  deletedAt: null,
});

const sampleBook: BookRow = {
  id: BOOK_ID,
  userId: CLIENT_ID,
  theme: "mom",
  status: "draft",
  title: "Мама",
  subtitle: "История семьи",
  authorName: "Айгерим",
  authorGender: "f",
  recordedBy: "",
  recipientName: "Мама",
  recipientGender: "f",
  namesOnCover: "",
  hideRecipientOnCover: false,
  coverLines: true,
  coverTemplate: "classic",
  coverPhotoId: null,
  coverPhotoExtra: [],
  backText: "",
  backLayout: "quote",
  backPhotoId: null,
  backPhotoExtra: [],
  photoFrames: {},
  dedication: "",
  interior: "classic",
  interiorStyle: {},
  coverDesign: null,
  coverBack: null,
  format: "a5",
  photoPlacement: "chapters",
  showToc: true,
  tocMode: "both",
  tocLines: {},
  layoutRev: 2,
  paginationRev: 2,
  inviteToken: null,
  inviteText: "",
  endText: null,
  chapterStart: "page",
  titlePage: true,
  language: "ru",
  occasion: null,
  occasionDate: null,
  createdAt: new Date("2026-10-01T10:00:00Z"),
  updatedAt: new Date("2026-11-20T10:00:00Z"),
};

const shelfBook: CabinetShelfSourceItem = {
  row: {
    book: {
      id: BOOK_ID,
      title: "Мама",
      subtitle: "История семьи",
      theme: "mom",
      format: "a5",
      coverTemplate: "classic",
      coverLines: true,
      coverPhotoId: null,
      coverPhotoExtra: null,
      coverDesign: null,
      authorName: "Айгерим",
      recipientName: "Мама",
      hideRecipientOnCover: false,
      namesOnCover: "",
    },
    answered: 5,
    total: 40,
    words: 420,
    photos: 2,
  },
  kind: "Маме",
  blank: false,
  progress: 13,
  order: { id: ORDER_ID, number: 77, status: "paid", printed: true, statusLabel: "Оплачен", statusTone: "success" },
  ordered: false,
  writeSection: QUESTION_ID,
  deadline: { text: "До дня рождения 10 дней", tone: "calm" },
  updated: "Изменена 20 ноября 2026 г.",
};

const webShelfFixture = {
  books: [
    {
      ...shelfBook,
      row: { ...shelfBook.row, book: { ...shelfBook.row.book, coverLines: true, coverPhotoExtra: null, coverDesign: null, namesOnCover: "" } },
      order: { id: ORDER_ID, number: 77, status: "paid" as const, printed: true, statusLabel: "Оплачен", statusTone: "success" as const },
      writeHref: `/books/${BOOK_ID}/questions?s=${QUESTION_ID}`,
    },
  ],
  agreement: null,
  agreementBooks: [],
};

const hubFixture: CabinetBookHubSource = {
  stats: { answered: 5, total: 40, words: 420, photos: 2, estimatedPages: 36, printedPages: 40, emptyChapters: 0 },
  photos: [{ id: PHOTO_ID, width: 1200, height: 900 }],
  printedPages: 40,
  agreement: null,
  letterStats: { approved: 1, pending: 0 },
  letters: { href: `/books/${BOOK_ID}/letters`, title: "Письма близких", text: "1 письмо", action: "Открыть" },
  kind: "gift",
  blank: false,
  editable: true,
  percent: 13,
  chapters: [{ key: "childhood", title: "Детство", answered: 5, total: 10, firstId: QUESTION_ID, firstOpenId: QUESTION_ID }],
  nav: {
    kind: "gift",
    answered: 5,
    total: 40,
    words: 420,
    photos: 2,
    letters: { approved: 1, pending: 0 },
    coverReady: true,
    steps: [
      { key: "questions", status: "partial", fraction: 0.13 },
      { key: "photos", status: "partial", fraction: 0.5 },
      { key: "cover", status: "done", fraction: 1 },
      { key: "order", status: "todo", fraction: 0 },
    ],
    current: "questions",
    textDone: false,
    ready: false,
    ordered: false,
    paid: false,
    order: null,
  },
  rows: [{ key: "write", href: `/books/${BOOK_ID}/questions`, title: "Написать", value: "5 из 40", action: "Продолжить", bar: 13, status: "partial", fraction: 0.13, active: true }],
  card: {
    eyebrow: "Следующий вопрос",
    title: "Какой момент запомнился больше всего?",
    serif: true,
    lang: "ru",
    primary: { href: `/books/${BOOK_ID}/questions?s=${QUESTION_ID}`, label: "Ответить", icon: true },
  },
  needs: [],
  hasErrors: false,
  deadline: null,
  preview: { href: `/books/${BOOK_ID}/preview`, tab: "Макет", cta: "Посмотреть макет" },
};

const photosFixture = (editable: boolean): CabinetPhotosSource => ({
  book: { interior: "classic", blank: false, photoPlacement: "chapters", galleryTitle: "Альбом", editable },
  photos: [{ id: PHOTO_ID, width: 1600, height: 1200, caption: "Лето", layout: "full", questionId: QUESTION_ID, chapter: null, opener: false, version: "v1", edited: false }],
  places: [[PHOTO_ID, { kind: "answer", questionId: QUESTION_ID, chapterKey: "childhood", auto: false, onCover: null }]],
  chapters: [{ key: "childhood", title: "Детство" }],
  answers: [{ id: QUESTION_ID, title: "Первый день", chapterKey: "childhood" }],
  losses: { [PHOTO_ID]: 0 },
  maxPhotos: 100,
});

const shared = vi.hoisted(() => ({
  allowRate: vi.fn<() => Promise<boolean>>(),
  auth: {
    login: vi.fn(),
    completeSecondFactor: vi.fn(),
    logout: vi.fn(),
    openCompanionSession: vi.fn(),
    register: vi.fn(),
    requestPasswordReset: vi.fn(),
    linkInfo: vi.fn(),
    redeemAccessLink: vi.fn(),
    resetPassword: vi.fn(),
  },
  accounts: {
    updateProfile: vi.fn(),
    changePassword: vi.fn(),
    setLocale: vi.fn(),
  },
  subscriptions: {
    setReminders: vi.fn(),
  },
  devices: {
    register: vi.fn(),
    forget: vi.fn(),
    pushReady: vi.fn<(platform?: "ios" | "android") => boolean>(),
  },
  fcmOptions: vi.fn<() => { apiKey: string; appId: string; projectId: string; senderId: string } | null>(),
  deletionPreview: vi.fn(),
  deleteClientAccount: vi.fn(),
  shopWhatsapp: vi.fn(),
  startBook: vi.fn(),
  deleteBook: vi.fn(),
  webShelf: vi.fn(),
  shelfBooks: vi.fn(),
  inviteData: vi.fn(),
  healthStatus: vi.fn(),
  visibleBook: vi.fn(),
  bookHub: vi.fn(),
  photosTab: vi.fn(),
  helpThread: vi.fn(),
  helpAsk: vi.fn(),
  freshUser: vi.fn<(tokenHash: string) => Promise<CurrentUser | null>>(),
}));

vi.mock("next/headers", () => import("@/server/http/next-shim"));
vi.mock("next/server", () => import("@/server/http/next-shim"));
vi.mock("@/server/rateLimit", () => ({ rateLimit: () => shared.allowRate(), trustedClientIp: async () => "203.0.113.10" }));
vi.mock("@/server/catalog", () => ({ ensureCatalog: async () => {}, syncCatalogFromSettings: async () => {} }));
vi.mock("@/server/account-deletion", () => ({
  deletionPreview: (userId: string, locale: Locale) => shared.deletionPreview(userId, locale),
  deleteClientAccount: (userId: string, password: string, locale: Locale) => shared.deleteClientAccount(userId, password, locale),
}));
vi.mock("@/server/v1-local-bridge", () => ({
  toWebSessionUser,
  localSessionUserDto: async (token: string) => {
    const u = await shared.freshUser(token);
    return u ? toWebSessionUser(u) : null;
  },
  localBooksPageData: (userId: string, locale: Locale, m: Messages) => shared.webShelf(userId, locale, m),
  localShelfBooks: (userId: string, locale: Locale, m: Messages) => shared.shelfBooks(userId, locale, m),
  localInviteData: (userId: string, locale: Locale) => shared.inviteData(userId, locale),
  localHealth: () => shared.healthStatus(),
}));
vi.mock("@/server/book-hub", () => ({
  bookHub: async (book: BookRow, locale: Locale, m: Messages) => ({
    ...(await shared.bookHub(book, locale, m)),
    sectionHref: (sid: string | null) => sectionLink(book.id, sid),
  }),
}));
vi.mock("@/server/photos-tab-data", () => ({
  photosTabData: (book: BookRow, editable: boolean, m: Messages) => shared.photosTab(book, editable, m),
}));
vi.mock("@/server/book-help", () => ({
  helpThread: (book: BookRow, userId: string) => shared.helpThread(book, userId),
  helpAsk: (book: BookRow, user: CurrentUser, input: { text: string; place: null; human: boolean }, locale: Locale) => shared.helpAsk(book, user, input, locale),
}));
vi.mock("@/server/books", () => ({
  viewerOf: async (user: Pick<CurrentUser, "id" | "role" | "staffDisabled">) => ({
    userId: user.id,
    isStaff: user.role === "admin" && !user.staffDisabled,
    staffEdits: user.role === "admin" && !user.staffDisabled,
  }),
}));
vi.mock("@/server/auth", async () => {
  const actual = await vi.importActual<typeof import("@/server/auth")>("@/server/auth");
  return {
    ...actual,
    getCurrentUser: async () => {
      const token = await actual.sessionToken();
      return token ? shared.freshUser(token) : null;
    },
  };
});
vi.mock("@/modules/workspace", async () => {
  const actual = await vi.importActual<typeof import("@/modules/workspace")>("@/modules/workspace");
  return {
    ...actual,
    mobileDevices: shared.devices,
    fcmConfig: () => ({ projectId: "p", clientEmail: "c@p", privateKey: "k", senderId: "1", androidAppId: "1:1:android:abc", apiKey: "k" }),
    fcmClientOptions: () => shared.fcmOptions(),
  };
});
vi.mock("@/server/container", () => ({
  container: () => ({
    identity: {
      auth: shared.auth,
      accounts: shared.accounts,
      queries: { userBySession: (hash: string) => shared.freshUser(hash) },
      tokens: { hash: (t: string) => t },
    },
    notifications: { subscriptions: shared.subscriptions },
    marketing: { service: { shopWhatsapp: () => shared.shopWhatsapp() } },
    authoring: {
      books: {
        start: (userId: string, input: unknown) => shared.startBook(userId, input),
        delete: (bookId: string, viewer: BookViewer) => shared.deleteBook(bookId, viewer),
      },
      queries: {
        visibleBook: (bookId: string, viewer: BookViewer) => shared.visibleBook(bookId, viewer),
      },
    },
  }),
}));

const { assertRoute } = await import("./expected");

const asClient = { cookie: `mb_session=${sessionOf(CLIENT)}` };
const asStaff = { cookie: `mb_session=${sessionOf(STAFF)}` };
const origin = { origin: "http://localhost:3000" };

let app: NestFastifyApplication;
let limiter: FakeLimiter;

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-26T10:00:00.000Z"));
  ({ app, limiter } = await bootTestApp({
    users: [CLIENT, STAFF],
    overrides: [
      [IDENTITY_AUTH, shared.auth],
      [
        IDENTITY_ACCOUNTS,
        {
          freshUserBySession: (token: string) => shared.freshUser(token),
          updateProfile: shared.accounts.updateProfile,
          changePassword: shared.accounts.changePassword,
          setLocale: shared.accounts.setLocale,
          setReminders: shared.subscriptions.setReminders,
          deletionPreview: shared.deletionPreview,
          deleteClientAccount: shared.deleteClientAccount,
        },
      ],
      [
        MOBILE_DEVICES,
        {
          register: shared.devices.register,
          forget: shared.devices.forget,
          pushReady: shared.devices.pushReady,
          androidClientOptions: shared.fcmOptions,
        },
      ],
      [
        CABINET_WEB_PORTS,
        {
          syncRegistrationOpen: async () => (await import("@/config/site")).registrationOpen(),
          shopWhatsappDigits: () => shared.shopWhatsapp(),
          webShelf: shared.webShelf,
          startBook: shared.startBook,
          deleteBook: shared.deleteBook,
          inviteData: shared.inviteData,
          healthStatus: shared.healthStatus,
        },
      ],
      [
        CABINET_BOOK_PORTS,
        {
          bookOwnership: async () => ({ managerId: STAFF_ID }),
          visibleBook: shared.visibleBook,
          shelfBooks: shared.shelfBooks,
          bookHub: shared.bookHub,
          photosTab: shared.photosTab,
          helpThread: shared.helpThread,
          helpAsk: shared.helpAsk,
        },
      ],
    ],
  }));
});

afterAll(async () => {
  vi.useRealTimers();
  await app.close();
});

beforeEach(() => {
  vi.clearAllMocks();
  limiter.hits.length = 0;
  limiter.deny = false;
  applySiteFlags({ registration: true });
  shared.allowRate.mockResolvedValue(true);
  shared.freshUser.mockImplementation(async (token) => (token === sessionOf(CLIENT) ? CLIENT : token === sessionOf(STAFF) ? STAFF : null));
  shared.auth.login.mockResolvedValue({ kind: "session", token: "tok-1", expiresAt: new Date("2026-12-26T10:00:00Z"), user: domainUser });
  shared.auth.completeSecondFactor.mockResolvedValue({ token: "tok-2fa", expiresAt: new Date("2026-12-26T10:00:00Z"), user: domainUser });
  shared.auth.logout.mockResolvedValue(undefined);
  shared.auth.openCompanionSession.mockResolvedValue({ token: "tok-web", expiresAt: new Date("2026-11-26T22:00:00Z") });
  shared.auth.register.mockResolvedValue({ token: "tok-reg", expiresAt: new Date("2026-12-26T10:00:00Z"), user: domainUser });
  shared.auth.requestPasswordReset.mockResolvedValue(undefined);
  shared.auth.linkInfo.mockResolvedValue({ purpose: "reset", valid: true });
  shared.auth.redeemAccessLink.mockResolvedValue({ token: "tok-acc", expiresAt: new Date("2026-12-26T10:00:00Z"), user: domainUser });
  shared.auth.resetPassword.mockResolvedValue({ kind: "session", token: "tok-rst", expiresAt: new Date("2026-12-26T10:00:00Z"), user: domainUser });
  shared.accounts.updateProfile.mockResolvedValue(undefined);
  shared.accounts.changePassword.mockResolvedValue(undefined);
  shared.accounts.setLocale.mockResolvedValue(undefined);
  shared.subscriptions.setReminders.mockResolvedValue(undefined);
  shared.devices.register.mockResolvedValue(undefined);
  shared.devices.forget.mockResolvedValue(undefined);
  shared.devices.pushReady.mockImplementation((platform) => platform === "ios");
  shared.fcmOptions.mockReturnValue({ apiKey: "k", appId: "1:1:android:abc", projectId: "p", senderId: "1" });
  shared.deletionPreview.mockResolvedValue({ confirm: "password", items: ["Профиль"], kept: ["Учёт"], keptOrders: [77] });
  shared.deleteClientAccount.mockResolvedValue({ confirm: "password", items: ["Профиль"], kept: ["Учёт"], keptOrders: [] });
  shared.shopWhatsapp.mockResolvedValue("77019998877");
  shared.webShelf.mockResolvedValue(webShelfFixture);
  shared.shelfBooks.mockResolvedValue([shelfBook]);
  shared.startBook.mockResolvedValue({ id: BOOK_ID });
  shared.deleteBook.mockResolvedValue(undefined);
  shared.inviteData.mockResolvedValue({ code: "MYBOOK10", link: "http://localhost:3000/r/MYBOOK10", friendPercent: 10, rewardPercent: 10, friends: 2, rewards: [] });
  shared.healthStatus.mockResolvedValue({ ok: true, db: true, storage: true, redis: true, outbox: { pending: 0, failed: 0, oldestPendingSec: null } });
  shared.visibleBook.mockImplementation(async (bookId: string, viewer: BookViewer) => (bookId === BOOK_ID && (viewer.isStaff || viewer.userId === CLIENT_ID) ? sampleBook : null));
  shared.bookHub.mockResolvedValue(hubFixture);
  shared.photosTab.mockImplementation(async (_book: BookRow, editable: boolean) => photosFixture(editable));
  shared.helpThread.mockResolvedValue({ enabled: true, whatsapp: "https://wa.me/77019998877", messages: [{ id: "m1", from: "bot", at: "2026-11-26T09:00:00.000Z", text: "Привет!", place: "" }], hints: ["start"] });
  shared.helpAsk.mockResolvedValue({ outcome: "answered", handoff: null, suggestions: ["Ещё"], messages: [{ id: "m2", from: "bot", at: "2026-11-26T10:00:00.000Z", text: "Готово", place: "" }] });
});

describe("ответы Nest байт в байт (эталон — прежний mybook-api) (Контекст 1: 33 маршрута)", () => {
  it("auth (5 маршрутов): authLogin, authSecondFactor, authLogout, authWebSession, me", async () => {
    await assertRoute({ nest: app, method: "POST", url: "/api/v1/auth/login", body: { login: "aigerim@example.kz", password: "secretpassword" } });

    shared.auth.login.mockResolvedValueOnce({ kind: "second_factor", userId: STAFF_ID });
    await assertRoute({ nest: app, method: "POST", url: "/api/v1/auth/login", body: { login: "owner@mybook.kz", password: "secretpassword" } });

    shared.auth.login.mockRejectedValueOnce(new IdentityError("credentials"));
    await assertRoute({ nest: app, method: "POST", url: "/api/v1/auth/login", headers: { [LOCALE_HEADER]: "kk" }, body: { login: "x@y.kz", password: "bad" } });

    limiter.deny = true;
    shared.allowRate.mockResolvedValueOnce(false);
    await assertRoute({ nest: app, method: "POST", url: "/api/v1/auth/login", body: { login: "x@y.kz", password: "bad" } });
    limiter.deny = false;

    const ticket = issueTicket(STAFF_ID);
    await assertRoute({ nest: app, method: "POST", url: "/api/v1/auth/2fa", body: { ticket, code: "123456" } });
    await assertRoute({ nest: app, method: "POST", url: "/api/v1/auth/2fa", body: { ticket: "bad-ticket-value", code: "123456" } });
    await assertRoute({ nest: app, method: "POST", url: "/api/v1/auth/logout", headers: { ...asClient, ...origin } });
    await assertRoute({ nest: app, method: "POST", url: "/api/v1/auth/web-session", headers: { ...asClient, ...origin } });
    await assertRoute({ nest: app, method: "GET", url: "/api/v1/me", headers: asClient });
  });

  it("me (13 маршрутов): аккаунт, профиль, пароль, напоминания, язык, устройства, CRM push, app-config, удаление", async () => {
    await assertRoute({ nest: app, method: "GET", url: "/api/v1/me/account?locale=ru", headers: asClient });
    await assertRoute({ nest: app, method: "PATCH", url: "/api/v1/me/profile", headers: { ...asClient, ...origin }, body: { name: "Айгерим", phone: "+77011112233" } });
    await assertRoute({ nest: app, method: "PATCH", url: "/api/v1/me/profile", headers: { ...asClient, ...origin }, body: { name: "  ", phone: "" } });
    await assertRoute({ nest: app, method: "POST", url: "/api/v1/me/password", headers: { ...asClient, ...origin }, body: { current: "oldpass123", next: "newpass123" } });

    shared.accounts.changePassword.mockRejectedValueOnce(new IdentityError("password"));
    await assertRoute({ nest: app, method: "POST", url: "/api/v1/me/password", headers: { ...asClient, ...origin }, body: { current: "oldpass123", next: "123" } });

    await assertRoute({ nest: app, method: "PUT", url: "/api/v1/me/reminders", headers: { ...asClient, ...origin }, body: { on: false } });
    await assertRoute({ nest: app, method: "PUT", url: "/api/v1/me/locale", headers: { ...asClient, ...origin }, body: { locale: "kk" } });
    await assertRoute({ nest: app, method: "PUT", url: "/api/v1/me/devices", headers: { ...asClient, ...origin }, body: { platform: "ios", token: DEVICE_TOKEN } });
    await assertRoute({ nest: app, method: "POST", url: "/api/v1/me/devices/forget", headers: { ...asClient, ...origin }, body: { token: DEVICE_TOKEN } });

    await assertRoute({ nest: app, method: "GET", url: "/api/v1/crm/push", headers: asStaff });
    await assertRoute({ nest: app, method: "GET", url: "/api/v1/crm/push", headers: asClient });
    await assertRoute({ nest: app, method: "PUT", url: "/api/v1/crm/devices", headers: { ...asStaff, ...origin }, body: { platform: "android", token: DEVICE_TOKEN } });
    await assertRoute({ nest: app, method: "POST", url: "/api/v1/crm/devices/forget", headers: { ...asStaff, ...origin }, body: { token: DEVICE_TOKEN } });

    await assertRoute({ nest: app, method: "GET", url: "/api/v1/app-config?locale=kk" });
    await assertRoute({ nest: app, method: "GET", url: "/api/v1/me/deletion?locale=ru", headers: asClient });
    await assertRoute({ nest: app, method: "POST", url: "/api/v1/me/delete?locale=ru", headers: { ...asClient, ...origin }, body: { password: "secretpassword" } });
    await assertRoute({ nest: app, method: "POST", url: "/api/v1/me/delete", headers: { ...asStaff, ...origin }, body: { password: "secretpassword" } });
  });

  it("web-cabinet (10 маршрутов): сессия, регистрация, сброс, полка, книги, приглашения, здоровье", async () => {
    await assertRoute({ nest: app, method: "GET", url: "/api/v1/web/session" });
    await assertRoute({ nest: app, method: "GET", url: "/api/v1/web/session", headers: asClient });

    const regBody = { name: "Айгерим", email: "new@example.kz", password: "password123", locale: "ru" };
    await assertRoute({ nest: app, method: "POST", url: "/api/v1/web/auth/register", body: regBody });

    shared.auth.register.mockRejectedValueOnce(new IdentityError("exists"));
    await assertRoute({ nest: app, method: "POST", url: "/api/v1/web/auth/register", body: regBody });

    applySiteFlags({ registration: false });
    await assertRoute({ nest: app, method: "POST", url: "/api/v1/web/auth/register", body: regBody });
    applySiteFlags({ registration: true });

    await assertRoute({ nest: app, method: "POST", url: "/api/v1/web/auth/forgot", body: { email: "a@b.kz", locale: "ru" } });
    await assertRoute({ nest: app, method: "GET", url: `/api/v1/web/auth/reset/${RESET_TOKEN}` });
    await assertRoute({ nest: app, method: "POST", url: "/api/v1/web/auth/reset", body: { token: RESET_TOKEN, password: "newpassword123" } });

    shared.auth.linkInfo.mockResolvedValueOnce({ purpose: "access", valid: false });
    shared.auth.redeemAccessLink.mockRejectedValueOnce(new IdentityError("resetExpired"));
    await assertRoute({ nest: app, method: "POST", url: "/api/v1/web/auth/reset", body: { token: RESET_TOKEN, password: "newpassword123" } });

    await assertRoute({ nest: app, method: "GET", url: "/api/v1/web/shelf?locale=ru", headers: asClient });
    await assertRoute({
      nest: app,
      method: "POST",
      url: "/api/v1/web/books",
      headers: { ...asClient, ...origin },
      body: { theme: "mom", language: "ru", authorName: "Айгерим", authorGender: "f", recipientName: "Мама", recipientGender: "f" },
    });
    await assertRoute({
      nest: app,
      method: "POST",
      url: "/api/v1/web/books",
      headers: { ...asClient, ...origin },
      body: { theme: "mom", language: "ru", authorName: "Айгерим", authorGender: "f" },
    });

    await assertRoute({ nest: app, method: "DELETE", url: `/api/v1/web/books/${BOOK_ID}`, headers: { ...asClient, ...origin } });

    shared.deleteBook.mockRejectedValueOnce(new AuthoringError("bookHasOrders"));
    await assertRoute({ nest: app, method: "DELETE", url: `/api/v1/web/books/${BOOK_ID}`, headers: { ...asClient, ...origin } });

    await assertRoute({ nest: app, method: "GET", url: "/api/v1/web/invite?locale=ru", headers: asClient });
    await assertRoute({ nest: app, method: "GET", url: "/api/v1/web/health" });
  });

  it("cabinet (5 маршрутов): cabinetShelf, cabinetBook, cabinetPhotos, cabinetHelp, cabinetHelpAsk", async () => {
    await assertRoute({ nest: app, method: "GET", url: "/api/v1/cabinet/shelf", headers: asClient });
    await assertRoute({ nest: app, method: "GET", url: `/api/v1/cabinet/books/${BOOK_ID}`, headers: asClient });
    await assertRoute({ nest: app, method: "GET", url: `/api/v1/cabinet/books/${BOOK_ID}/photos`, headers: asClient });
    await assertRoute({ nest: app, method: "GET", url: `/api/v1/cabinet/books/${BOOK_ID}/help?section=photos`, headers: asClient });
    await assertRoute({
      nest: app,
      method: "POST",
      url: `/api/v1/cabinet/books/${BOOK_ID}/help`,
      headers: { ...asClient, ...origin },
      body: { text: "Где фото?", human: false },
    });

    // Несуществующая книга → 404 bookNotFound, чужой метод → 405 Allow
    await assertRoute({ nest: app, method: "GET", url: "/api/v1/cabinet/books/99999999-9999-4999-8999-999999999999", headers: asClient });
    await assertRoute({ nest: app, method: "DELETE", url: `/api/v1/cabinet/books/${BOOK_ID}/help`, headers: asClient });
  });
});
