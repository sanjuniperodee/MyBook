import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import type { InjectOptions } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { v1 } from "@mybook/contracts";
import { LOCALE_HEADER } from "@/i18n/config";
import type { CabinetBookHubSource, CabinetPhotosSource, CabinetShelfSourceItem } from "@/lib/cabinet/views";
import { StaffContext } from "@/modules/access/domain/StaffContext";
import { AuthoringError, type BookRow } from "@/modules/authoring";
import { IdentityError, isPhoneEmail, User, type CurrentUser } from "@/modules/identity";
import { allPermissions, type Permission, type RoleScope } from "@/shared/domain/permissions";
import { issueTicket } from "@/shared/two-factor-ticket";
import { STAFF_ACCESS, type StaffAccessPort } from "../src/core/auth/staff";
import {
  CABINET_BOOK_PORTS,
  CABINET_WEB_PORTS,
  IDENTITY_ACCOUNTS,
  IDENTITY_AUTH,
  MOBILE_DEVICES,
  type CabinetBookPorts,
  type CabinetWebPorts,
  type IdentityAccountsPort,
  type IdentityAuthPort,
  type MobileDevicesPort,
} from "../src/modules/identity/identity.tokens";
import { bootTestApp, sessionOf, testUser, type FakeLimiter } from "./app";

const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ID = "22222222-2222-4222-8222-222222222222";
const OWNER_STAFF_ID = "33333333-3333-4333-8333-333333333333";
const VIEW_STAFF_ID = "44444444-4444-4444-8444-444444444444";
const OWN_STAFF_ID = "55555555-5555-4555-8555-555555555555";
const GATED_STAFF_ID = "66666666-6666-4666-8666-666666666666";
const DISABLED_STAFF_ID = "77777777-7777-4777-8777-777777777777";
const BOOK_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_BOOK_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PHOTO_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const QUESTION_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const ORDER_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

const CLIENT = testUser(CLIENT_ID, { name: "Айгерим", email: "aigerim@example.kz", phone: "+77011112233", locale: "ru" });
const CLIENT_KK = testUser(OTHER_ID, { name: "Алия", email: "aliya@example.kz", phone: null, locale: "kk" });
const OWNER_STAFF = testUser(OWNER_STAFF_ID, { name: "Руководитель", email: "owner@mybook.kz", role: "admin", totpEnabledAt: new Date("2026-10-01T00:00:00Z"), totpSecret: "enc" });
const VIEW_STAFF = testUser(VIEW_STAFF_ID, { name: "Аналитик", email: "view@mybook.kz", role: "admin", totpEnabledAt: new Date("2026-10-01T00:00:00Z"), totpSecret: "enc" });
const OWN_STAFF = testUser(OWN_STAFF_ID, { name: "Менеджер", email: "mgr@mybook.kz", role: "admin", totpEnabledAt: new Date("2026-10-01T00:00:00Z"), totpSecret: "enc" });
const GATED_STAFF = testUser(GATED_STAFF_ID, { name: "Без2FA", email: "no2fa@mybook.kz", role: "admin" });
const DISABLED_STAFF = testUser(DISABLED_STAFF_ID, { name: "Уволенный", email: "off@mybook.kz", role: "admin", staffDisabled: true });

const as = (u: CurrentUser) => ({ cookie: `mb_session=${sessionOf(u)}` });
const bearer = (u: CurrentUser) => ({ authorization: `Bearer ${sessionOf(u)}` });
const DEVICE_TOKEN = "fcm_token_0123456789abcdefghijklmnopqrstuvwxyz";
const RESET_TOKEN = "reset_token_0123456789abcdefghij";

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

const shelfBookFixture: CabinetShelfSourceItem = {
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
  order: {
    id: ORDER_ID,
    number: 77,
    status: "paid",
    printed: true,
    statusLabel: "Оплачен",
    statusTone: "success",
  },
  ordered: false,
  writeSection: QUESTION_ID,
  deadline: { text: "До дня рождения 10 дней", tone: "calm" },
  updated: "Изменена 20 ноября 2026 г.",
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
  rows: [
    { key: "write", href: `/books/${BOOK_ID}/questions`, title: "Написать", value: "5 из 40", action: "Продолжить", bar: 13, status: "partial", fraction: 0.13, active: true },
  ],
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

const photosTabFixture = (editable: boolean): CabinetPhotosSource => ({
  book: { interior: "classic", blank: false, photoPlacement: "chapters", galleryTitle: "Альбом", editable },
  photos: [
    {
      id: PHOTO_ID,
      width: 1600,
      height: 1200,
      caption: "Лето",
      layout: "full",
      questionId: QUESTION_ID,
      chapter: null,
      opener: false,
      version: "v1",
      edited: false,
    },
  ],
  places: [[PHOTO_ID, { kind: "answer", questionId: QUESTION_ID, chapterKey: "childhood", auto: false, onCover: null }]],
  chapters: [{ key: "childhood", title: "Детство" }],
  answers: [{ id: QUESTION_ID, title: "Первый день", chapterKey: "childhood" }],
  losses: { [PHOTO_ID]: 0 },
  maxPhotos: 100,
});

const staffMatrix = (roleName: string, scope: RoleScope, perms: Permission[], isOwner: boolean, gate: "ip" | "2fa" | null = null) =>
  (user: CurrentUser) => ({
    context: new StaffContext(user.id, roleName, null, scope, new Set(perms), isOwner, { isPhoneEmail }),
    gate,
  });

const staffAccess: StaffAccessPort = {
  async resolve(user) {
    if (user.id === OWNER_STAFF_ID) return staffMatrix("Руководитель", "all", [...allPermissions], true)(user);
    if (user.id === VIEW_STAFF_ID) return staffMatrix("Аналитик", "all", ["clients.view"], false)(user);
    if (user.id === OWN_STAFF_ID) return staffMatrix("Менеджер", "own", ["clients.view", "clients.edit"], false)(user);
    if (user.id === GATED_STAFF_ID) return staffMatrix("Менеджер", "all", ["clients.view", "clients.edit"], false, "2fa")(user);
    return null;
  },
};

let freshUserState: CurrentUser = CLIENT;
let registrationIsOpen = true;
let bookOwnerManagerId: string | null = OWN_STAFF_ID;

const authPort = {
  login: vi.fn<IdentityAuthPort["login"]>(),
  completeSecondFactor: vi.fn<IdentityAuthPort["completeSecondFactor"]>(),
  logout: vi.fn<IdentityAuthPort["logout"]>(),
  openCompanionSession: vi.fn<IdentityAuthPort["openCompanionSession"]>(),
  register: vi.fn<IdentityAuthPort["register"]>(),
  requestPasswordReset: vi.fn<IdentityAuthPort["requestPasswordReset"]>(),
  linkInfo: vi.fn<IdentityAuthPort["linkInfo"]>(),
  redeemAccessLink: vi.fn<IdentityAuthPort["redeemAccessLink"]>(),
  resetPassword: vi.fn<IdentityAuthPort["resetPassword"]>(),
};

const accountsPort = {
  freshUserBySession: vi.fn<IdentityAccountsPort["freshUserBySession"]>(),
  updateProfile: vi.fn<IdentityAccountsPort["updateProfile"]>(),
  changePassword: vi.fn<IdentityAccountsPort["changePassword"]>(),
  setLocale: vi.fn<IdentityAccountsPort["setLocale"]>(),
  setReminders: vi.fn<IdentityAccountsPort["setReminders"]>(),
  deletionPreview: vi.fn<IdentityAccountsPort["deletionPreview"]>(),
  deleteClientAccount: vi.fn<IdentityAccountsPort["deleteClientAccount"]>(),
};

const devicesPort = {
  register: vi.fn<MobileDevicesPort["register"]>(),
  forget: vi.fn<MobileDevicesPort["forget"]>(),
  pushReady: vi.fn<MobileDevicesPort["pushReady"]>(),
  androidClientOptions: vi.fn<MobileDevicesPort["androidClientOptions"]>(),
};

const webPort = {
  syncRegistrationOpen: vi.fn<CabinetWebPorts["syncRegistrationOpen"]>(),
  shopWhatsappDigits: vi.fn<CabinetWebPorts["shopWhatsappDigits"]>(),
  webShelf: vi.fn<CabinetWebPorts["webShelf"]>(),
  startBook: vi.fn<CabinetWebPorts["startBook"]>(),
  deleteBook: vi.fn<CabinetWebPorts["deleteBook"]>(),
  inviteData: vi.fn<CabinetWebPorts["inviteData"]>(),
  healthStatus: vi.fn<CabinetWebPorts["healthStatus"]>(),
};

const bookPort = {
  bookOwnership: vi.fn<CabinetBookPorts["bookOwnership"]>(),
  visibleBook: vi.fn<CabinetBookPorts["visibleBook"]>(),
  shelfBooks: vi.fn<CabinetBookPorts["shelfBooks"]>(),
  bookHub: vi.fn<CabinetBookPorts["bookHub"]>(),
  photosTab: vi.fn<CabinetBookPorts["photosTab"]>(),
  helpThread: vi.fn<CabinetBookPorts["helpThread"]>(),
  helpAsk: vi.fn<CabinetBookPorts["helpAsk"]>(),
};

let app: NestFastifyApplication;
let limiter: FakeLimiter;
const call = (opts: InjectOptions) => app.inject(opts);

beforeAll(async () => {
  ({ app, limiter } = await bootTestApp({
    users: [CLIENT, CLIENT_KK, OWNER_STAFF, VIEW_STAFF, OWN_STAFF, GATED_STAFF, DISABLED_STAFF],
    overrides: [
      [STAFF_ACCESS, staffAccess],
      [IDENTITY_AUTH, authPort],
      [IDENTITY_ACCOUNTS, accountsPort],
      [MOBILE_DEVICES, devicesPort],
      [CABINET_WEB_PORTS, webPort],
      [CABINET_BOOK_PORTS, bookPort],
    ],
  }));
});

afterAll(() => app.close());

beforeEach(() => {
  vi.clearAllMocks();
  limiter.hits.length = 0;
  limiter.deny = false;
  freshUserState = { ...CLIENT };
  registrationIsOpen = true;
  bookOwnerManagerId = OWN_STAFF_ID;

  authPort.login.mockResolvedValue({ kind: "session", token: "tok-login-1", expiresAt: new Date("2026-12-26T10:00:00Z"), user: domainUser });
  authPort.completeSecondFactor.mockResolvedValue({ token: "tok-2fa-1", expiresAt: new Date("2026-12-26T10:00:00Z"), user: domainUser });
  authPort.logout.mockResolvedValue(undefined);
  authPort.openCompanionSession.mockResolvedValue({ token: "tok-web-1", expiresAt: new Date("2026-11-26T22:00:00Z") });
  authPort.register.mockResolvedValue({ token: "tok-reg-1", expiresAt: new Date("2026-12-26T10:00:00Z"), user: domainUser });
  authPort.requestPasswordReset.mockResolvedValue(undefined);
  authPort.linkInfo.mockResolvedValue({ purpose: "reset", valid: true });
  authPort.redeemAccessLink.mockResolvedValue({ token: "tok-acc-1", expiresAt: new Date("2026-12-26T10:00:00Z"), user: domainUser });
  authPort.resetPassword.mockResolvedValue({ kind: "session", token: "tok-rst-1", expiresAt: new Date("2026-12-26T10:00:00Z"), user: domainUser });

  accountsPort.freshUserBySession.mockImplementation(async (token) => (token === sessionOf(CLIENT) ? freshUserState : token === sessionOf(CLIENT_KK) ? CLIENT_KK : null));
  accountsPort.updateProfile.mockImplementation(async (_id, name, phone) => {
    freshUserState = { ...freshUserState, name, phone };
  });
  accountsPort.changePassword.mockResolvedValue(undefined);
  accountsPort.setLocale.mockImplementation(async (_id, locale) => {
    freshUserState = { ...freshUserState, locale };
  });
  accountsPort.setReminders.mockImplementation(async (_id, on) => {
    freshUserState = { ...freshUserState, emailOptOut: !on };
  });
  accountsPort.deletionPreview.mockResolvedValue({ confirm: "password", items: ["Профиль"], kept: ["Учёт"], keptOrders: [77] });
  accountsPort.deleteClientAccount.mockResolvedValue({ confirm: "password", items: ["Профиль"], kept: ["Учёт"], keptOrders: [] });

  devicesPort.register.mockResolvedValue(undefined);
  devicesPort.forget.mockResolvedValue(undefined);
  devicesPort.pushReady.mockImplementation((platform) => platform === "ios");
  devicesPort.androidClientOptions.mockReturnValue({ apiKey: "k", appId: "1:1:android:abc", projectId: "p", senderId: "1" });

  webPort.syncRegistrationOpen.mockImplementation(async () => registrationIsOpen);
  webPort.shopWhatsappDigits.mockResolvedValue("77019998877");
  webPort.webShelf.mockResolvedValue({
    books: [
      {
        ...shelfBookFixture,
        row: { ...shelfBookFixture.row, book: { ...shelfBookFixture.row.book, coverLines: true, coverPhotoExtra: null, coverDesign: null, namesOnCover: "" } },
        order: shelfBookFixture.order ? { ...shelfBookFixture.order, status: "paid", statusTone: "success" } : null,
        writeHref: `/books/${BOOK_ID}/questions?s=${QUESTION_ID}`,
      },
    ],
    agreement: null,
    agreementBooks: [],
  });
  webPort.startBook.mockResolvedValue({ id: BOOK_ID });
  webPort.deleteBook.mockResolvedValue(undefined);
  webPort.inviteData.mockResolvedValue({
    code: "MYBOOK10",
    link: "http://localhost:3000/r/MYBOOK10",
    friendPercent: 10,
    rewardPercent: 10,
    friends: 2,
    rewards: [],
  });
  webPort.healthStatus.mockResolvedValue({ ok: true, db: true, storage: true, redis: true, outbox: { pending: 0, failed: 0, oldestPendingSec: null } });

  bookPort.bookOwnership.mockImplementation(async (bookId) => (bookId === BOOK_ID ? { managerId: bookOwnerManagerId } : null));
  bookPort.visibleBook.mockImplementation(async (bookId, viewer) => {
    if (bookId !== BOOK_ID) return null;
    return viewer.isStaff || viewer.userId === sampleBook.userId ? sampleBook : null;
  });
  bookPort.shelfBooks.mockResolvedValue([shelfBookFixture]);
  bookPort.bookHub.mockResolvedValue(hubFixture);
  bookPort.photosTab.mockImplementation(async (_book, editable) => photosTabFixture(editable));
  bookPort.helpThread.mockResolvedValue({
    enabled: true,
    whatsapp: "https://wa.me/77019998877",
    messages: [{ id: "m1", from: "bot", at: "2026-11-26T09:00:00.000Z", text: "Привет!", place: "" }],
    hints: ["start"],
  });
  bookPort.helpAsk.mockResolvedValue({
    outcome: "answered",
    suggestions: ["Как добавить фото?"],
    messages: [{ id: "m2", from: "bot", at: "2026-11-26T10:00:00.000Z", text: "Готово", place: "" }],
  });
});

describe("Контекст 1 (Identity и кабинет): регистрация всех 33 маршрутов", () => {
  it("реестр /api/v1/__nest/routes содержит все 33 маршрута Контекста 1", async () => {
    const res = await call({ method: "GET", url: "/api/v1/__nest/routes" });
    expect(res.statusCode).toBe(200);
    const routes = res.json().routes as { method: string; path: string }[];
    const expected: [string, string][] = [
      ["POST", "/api/v1/auth/login"],
      ["POST", "/api/v1/auth/2fa"],
      ["POST", "/api/v1/auth/logout"],
      ["POST", "/api/v1/auth/web-session"],
      ["GET", "/api/v1/me"],
      ["GET", "/api/v1/me/account"],
      ["PATCH", "/api/v1/me/profile"],
      ["POST", "/api/v1/me/password"],
      ["PUT", "/api/v1/me/reminders"],
      ["PUT", "/api/v1/me/locale"],
      ["PUT", "/api/v1/me/devices"],
      ["POST", "/api/v1/me/devices/forget"],
      ["GET", "/api/v1/crm/push"],
      ["PUT", "/api/v1/crm/devices"],
      ["POST", "/api/v1/crm/devices/forget"],
      ["GET", "/api/v1/app-config"],
      ["GET", "/api/v1/me/deletion"],
      ["POST", "/api/v1/me/delete"],
      ["GET", "/api/v1/web/session"],
      ["POST", "/api/v1/web/auth/register"],
      ["POST", "/api/v1/web/auth/forgot"],
      ["GET", "/api/v1/web/auth/reset/:token"],
      ["POST", "/api/v1/web/auth/reset"],
      ["GET", "/api/v1/web/shelf"],
      ["POST", "/api/v1/web/books"],
      ["DELETE", "/api/v1/web/books/:bookId"],
      ["GET", "/api/v1/web/invite"],
      ["GET", "/api/v1/web/health"],
      ["GET", "/api/v1/cabinet/shelf"],
      ["GET", "/api/v1/cabinet/books/:bookId"],
      ["GET", "/api/v1/cabinet/books/:bookId/photos"],
      ["GET", "/api/v1/cabinet/books/:bookId/help"],
      ["POST", "/api/v1/cabinet/books/:bookId/help"],
    ];
    expect(expected).toHaveLength(33);
    for (const [method, path] of expected) {
      expect(routes, `${method} ${path}`).toContainEqual({ method, path });
    }
  });
});

describe("auth (5 маршрутов): вход, 2FA, выход, web-session, me", () => {
  it("POST /auth/login: сессия, 2FA-билет, 401 credentials, 429 tooManyLogins, 400 и 405", async () => {
    const ok = await call({ method: "POST", url: "/api/v1/auth/login", headers: { "x-real-ip": "10.0.0.1" }, payload: { login: "Aigerim@Example.kz", password: "secretpassword" } });
    expect(ok.statusCode).toBe(200);
    expect(ok.headers["cache-control"]).toBe("no-store");
    expect(v1.authLogin.response.parse(ok.json())).toMatchObject({ session: { token: "tok-login-1", user: { id: CLIENT_ID, isStaff: false } }, secondFactorTicket: null });
    expect(limiter.hits).toEqual(["login:10.0.0.1", "login:aigerim@example.kz"]);
    expect(authPort.login).toHaveBeenCalledWith({ login: "Aigerim@Example.kz", password: "secretpassword", locale: "ru" });

    authPort.login.mockResolvedValueOnce({ kind: "second_factor", userId: OWNER_STAFF_ID });
    const need2fa = await call({ method: "POST", url: "/api/v1/auth/login", payload: { login: "owner@mybook.kz", password: "secretpassword" } });
    expect(need2fa.statusCode).toBe(200);
    expect(need2fa.json().session).toBeNull();
    expect(typeof need2fa.json().secondFactorTicket).toBe("string");

    authPort.login.mockRejectedValueOnce(new IdentityError("credentials"));
    const badCreds = await call({ method: "POST", url: "/api/v1/auth/login", headers: { [LOCALE_HEADER]: "kk" }, payload: { login: "a@b.kz", password: "wrong" } });
    expect(badCreds.statusCode).toBe(401);
    expect(badCreds.json().code).toBe("credentials");

    limiter.deny = true;
    const limited = await call({ method: "POST", url: "/api/v1/auth/login", payload: { login: "a@b.kz", password: "secret" } });
    expect(limited.statusCode).toBe(429);
    expect(limited.json().code).toBe("tooManyLogins");

    limiter.deny = false;
    const invalid = await call({ method: "POST", url: "/api/v1/auth/login", payload: { login: "", password: "" } });
    expect(invalid.statusCode).toBe(400);

    const wrongMethod = await call({ method: "GET", url: "/api/v1/auth/login" });
    expect(wrongMethod.statusCode).toBe(405);
    expect(wrongMethod.headers.allow).toBe("POST");
  });

  it("POST /auth/2fa: билет → сессия, битый/просроченный билет → 401, неверный код → 401, лимит → 429", async () => {
    const ticket = issueTicket(OWNER_STAFF_ID);
    const ok = await call({ method: "POST", url: "/api/v1/auth/2fa", headers: { "x-real-ip": "10.0.0.2" }, payload: { ticket, code: "123456" } });
    expect(ok.statusCode).toBe(200);
    expect(v1.authSecondFactor.response.parse(ok.json()).token).toBe("tok-2fa-1");
    expect(limiter.hits).toEqual([`2fa:${OWNER_STAFF_ID}`, "2fa-ip:10.0.0.2"]);
    expect(authPort.completeSecondFactor).toHaveBeenCalledWith(OWNER_STAFF_ID, "123456", "ru");

    const badTicket = await call({ method: "POST", url: "/api/v1/auth/2fa", payload: { ticket: "invalid-ticket-string", code: "123456" } });
    expect(badTicket.statusCode).toBe(401);
    expect(badTicket.json().code).toBe("twoFactorExpired");

    authPort.completeSecondFactor.mockRejectedValueOnce(new IdentityError("twoFactorCode"));
    const badCode = await call({ method: "POST", url: "/api/v1/auth/2fa", payload: { ticket, code: "000000" } });
    expect(badCode.statusCode).toBe(401);
    expect(badCode.json().code).toBe("twoFactorCode");

    limiter.deny = true;
    const limited = await call({ method: "POST", url: "/api/v1/auth/2fa", payload: { ticket, code: "123456" } });
    expect(limited.statusCode).toBe(429);
    expect(limited.json().code).toBe("tooManyLogins");
  });

  it("POST /auth/logout, POST /auth/web-session и GET /me: вход, CSRF, ETag/304 и побочные эффекты", async () => {
    expect((await call({ method: "POST", url: "/api/v1/auth/logout" })).statusCode).toBe(401);
    const csrf = await call({ method: "POST", url: "/api/v1/auth/logout", headers: { ...as(CLIENT), origin: "https://evil.example" } });
    expect(csrf.statusCode).toBe(403);

    const out = await call({ method: "POST", url: "/api/v1/auth/logout", headers: bearer(CLIENT) });
    expect(out.statusCode).toBe(200);
    expect(out.json()).toEqual({ ok: true });
    expect(authPort.logout).toHaveBeenCalledWith(sessionOf(CLIENT));

    const ws = await call({ method: "POST", url: "/api/v1/auth/web-session", headers: as(CLIENT) });
    expect(ws.statusCode).toBe(200);
    expect(v1.authWebSession.response.parse(ws.json())).toEqual({
      cookie: "mb_session",
      token: "tok-web-1",
      expiresAt: "2026-11-26T22:00:00.000Z",
      baseUrl: "http://localhost:3000",
    });
    expect(authPort.openCompanionSession).toHaveBeenCalledWith(CLIENT_ID, 12 * 60 * 60_000);

    const meRes = await call({ method: "GET", url: "/api/v1/me", headers: as(OWNER_STAFF) });
    expect(meRes.statusCode).toBe(200);
    expect(v1.me.response.parse(meRes.json())).toMatchObject({ id: OWNER_STAFF_ID, isStaff: true });
    const me304 = await call({ method: "GET", url: "/api/v1/me", headers: { ...as(OWNER_STAFF), "if-none-match": String(meRes.headers.etag) } });
    expect(me304.statusCode).toBe(304);
  });
});

describe("me (13 маршрутов): аккаунт, профиль, пароль, напоминания, язык, устройства, CRM push, app-config, удаление", () => {
  it("GET /me/account, PATCH /me/profile, POST /me/password, PUT /me/reminders, PUT /me/locale", async () => {
    const acc = await call({ method: "GET", url: "/api/v1/me/account?locale=kk", headers: as(CLIENT) });
    expect(acc.statusCode).toBe(200);
    expect(v1.meAccount.response.parse(acc.json())).toMatchObject({ locale: "kk", remindersOn: true, notice: null });

    const badName = await call({ method: "PATCH", url: "/api/v1/me/profile", headers: as(CLIENT), payload: { name: "   ", phone: "" } });
    expect(badName.statusCode).toBe(200);
    expect(badName.json().notice).toMatchObject({ ok: false, field: "name" });
    expect(accountsPort.updateProfile).not.toHaveBeenCalled();

    const badPhone = await call({ method: "PATCH", url: "/api/v1/me/profile", headers: as(CLIENT), payload: { name: "Айгерим", phone: "abc" } });
    expect(badPhone.statusCode).toBe(200);
    expect(badPhone.json().notice).toMatchObject({ ok: false, field: "phone" });

    const okProfile = await call({ method: "PATCH", url: "/api/v1/me/profile", headers: as(CLIENT), payload: { name: "Айгерим К.", phone: "+77019998877" } });
    expect(okProfile.statusCode).toBe(200);
    expect(okProfile.json()).toMatchObject({ profile: { name: "Айгерим К.", phone: "+77019998877" }, notice: { ok: true, field: null } });
    expect(accountsPort.updateProfile).toHaveBeenCalledWith(CLIENT_ID, "Айгерим К.", "+77019998877");

    const okPwd = await call({ method: "POST", url: "/api/v1/me/password", headers: { ...as(CLIENT), "x-real-ip": "10.0.0.3" }, payload: { current: "oldpass123", next: "newpass123" } });
    expect(okPwd.statusCode).toBe(200);
    expect(okPwd.json().notice).toMatchObject({ ok: true, field: null });
    expect(accountsPort.changePassword).toHaveBeenCalledWith(CLIENT_ID, "oldpass123", "newpass123", sessionOf(CLIENT));
    expect(limiter.hits).toContain(`pwd:${CLIENT_ID}:10.0.0.3`);

    accountsPort.changePassword.mockRejectedValueOnce(new IdentityError("password"));
    const shortPwd = await call({ method: "POST", url: "/api/v1/me/password", headers: as(CLIENT), payload: { current: "oldpass123", next: "123" } });
    expect(shortPwd.statusCode).toBe(200);
    expect(shortPwd.json().notice).toMatchObject({ ok: false, field: "next" });

    accountsPort.changePassword.mockRejectedValueOnce(new IdentityError("credentials"));
    const wrongPwd = await call({ method: "POST", url: "/api/v1/me/password", headers: as(CLIENT), payload: { current: "bad", next: "newpass123" } });
    expect(wrongPwd.statusCode).toBe(200);
    expect(wrongPwd.json().notice).toMatchObject({ ok: false, field: "current" });

    limiter.deny = true;
    const pwdLimit = await call({ method: "POST", url: "/api/v1/me/password", headers: as(CLIENT), payload: { current: "old", next: "newpass123" } });
    expect(pwdLimit.statusCode).toBe(200);
    expect(pwdLimit.json().notice).toMatchObject({ ok: false, field: null });
    limiter.deny = false;

    const rem = await call({ method: "PUT", url: "/api/v1/me/reminders", headers: as(CLIENT), payload: { on: false } });
    expect(rem.statusCode).toBe(200);
    expect(rem.json()).toMatchObject({ remindersOn: false, notice: { ok: true, field: null } });
    expect(accountsPort.setReminders).toHaveBeenCalledWith(CLIENT_ID, false);

    const loc = await call({ method: "PUT", url: "/api/v1/me/locale", headers: as(CLIENT), payload: { locale: "kk" } });
    expect(loc.statusCode).toBe(200);
    expect(loc.json().locale).toBe("kk");
    expect(accountsPort.setLocale).toHaveBeenCalledWith(CLIENT_ID, "kk");
  });

  it("устройства клиента и CRM (PUT/POST), /crm/push (StaffGuard) и /app-config", async () => {
    const devPut = await call({ method: "PUT", url: "/api/v1/me/devices", headers: as(CLIENT), payload: { platform: "ios", token: DEVICE_TOKEN } });
    expect(devPut.statusCode).toBe(200);
    expect(devPut.json()).toEqual({ ok: true, serverReady: true });
    expect(devicesPort.register).toHaveBeenCalledWith(CLIENT_ID, { platform: "ios", token: DEVICE_TOKEN, environment: "production", app: "client" });

    const devDel = await call({ method: "POST", url: "/api/v1/me/devices/forget", headers: as(CLIENT), payload: { token: DEVICE_TOKEN } });
    expect(devDel.statusCode).toBe(200);
    expect(devicesPort.forget).toHaveBeenCalledWith(CLIENT_ID, DEVICE_TOKEN);

    // Маршруты CRM закрыты для обычного клиента и сотрудника без 2FA.
    expect((await call({ method: "GET", url: "/api/v1/crm/push", headers: as(CLIENT) })).statusCode).toBe(403);
    expect((await call({ method: "GET", url: "/api/v1/crm/push", headers: as(GATED_STAFF) })).statusCode).toBe(403);
    expect((await call({ method: "PUT", url: "/api/v1/crm/devices", headers: as(CLIENT), payload: { platform: "android", token: DEVICE_TOKEN } })).statusCode).toBe(403);

    const crmPush = await call({ method: "GET", url: "/api/v1/crm/push", headers: as(OWNER_STAFF) });
    expect(crmPush.statusCode).toBe(200);
    expect(v1.crmPushConfig.response.parse(crmPush.json())).toEqual({
      ios: true,
      android: { apiKey: "k", appId: "1:1:android:abc", projectId: "p", senderId: "1" },
    });

    const crmPut = await call({ method: "PUT", url: "/api/v1/crm/devices", headers: as(OWNER_STAFF), payload: { platform: "android", token: DEVICE_TOKEN, environment: "sandbox" } });
    expect(crmPut.statusCode).toBe(200);
    expect(crmPut.json()).toEqual({ ok: true, serverReady: false });
    expect(devicesPort.register).toHaveBeenCalledWith(OWNER_STAFF_ID, { platform: "android", token: DEVICE_TOKEN, environment: "sandbox", app: "crm" });

    const crmDel = await call({ method: "POST", url: "/api/v1/crm/devices/forget", headers: as(OWNER_STAFF), payload: { token: DEVICE_TOKEN } });
    expect(crmDel.statusCode).toBe(200);
    expect(devicesPort.forget).toHaveBeenCalledWith(OWNER_STAFF_ID, DEVICE_TOKEN);

    const cfg = await call({ method: "GET", url: "/api/v1/app-config?locale=kk" });
    expect(cfg.statusCode).toBe(200);
    expect(v1.appConfig.response.parse(cfg.json())).toMatchObject({
      privacyUrl: "http://localhost:3000/kk/privacy",
      termsUrl: "http://localhost:3000/kk/offer",
    });
  });

  it("GET /me/deletion и POST /me/delete: 200, 403 staffAccount, 400 wrongPassword, 429 tooMany", async () => {
    const info = await call({ method: "GET", url: "/api/v1/me/deletion?locale=ru", headers: as(CLIENT) });
    expect(info.statusCode).toBe(200);
    expect(v1.meDeletionInfo.response.parse(info.json())).toMatchObject({ confirm: "password", keptOrders: [77] });

    const staffDel = await call({ method: "POST", url: "/api/v1/me/delete", headers: as(OWNER_STAFF), payload: { password: "secretpassword" } });
    expect(staffDel.statusCode).toBe(403);
    expect(staffDel.json().code).toBe("staffAccount");

    limiter.deny = true;
    const rateDel = await call({ method: "POST", url: "/api/v1/me/delete", headers: as(CLIENT), payload: { password: "secretpassword" } });
    expect(rateDel.statusCode).toBe(429);
    expect(rateDel.json().code).toBe("tooMany");
    limiter.deny = false;

    accountsPort.deleteClientAccount.mockRejectedValueOnce(new IdentityError("credentials"));
    const wrongDel = await call({ method: "POST", url: "/api/v1/me/delete", headers: as(CLIENT), payload: { password: "wrongpassword" } });
    expect(wrongDel.statusCode).toBe(400);
    expect(wrongDel.json().code).toBe("wrongPassword");

    const okDel = await call({ method: "POST", url: "/api/v1/me/delete?locale=en", headers: { ...as(CLIENT), "x-real-ip": "10.0.0.4" }, payload: { password: "secretpassword" } });
    expect(okDel.statusCode).toBe(200);
    expect(v1.meDelete.response.parse(okDel.json())).toMatchObject({ ok: true, confirm: "password" });
    expect(accountsPort.deleteClientAccount).toHaveBeenCalledWith(CLIENT_ID, "secretpassword", "en");
    expect(limiter.hits).toContain(`del:${CLIENT_ID}:10.0.0.4`);
  });
});

describe("web-cabinet (10 маршрутов): сессия, регистрация, сброс, полка, книги, приглашения, здоровье", () => {
  it("GET /web/session и GET /web/health отдают cache-control: no-store без ETag", async () => {
    const anon = await call({ method: "GET", url: "/api/v1/web/session" });
    expect(anon.statusCode).toBe(200);
    expect(anon.headers["cache-control"]).toBe("no-store");
    expect(anon.headers.etag).toBeUndefined();
    expect(anon.json()).toEqual({ user: null });

    const authed = await call({ method: "GET", url: "/api/v1/web/session", headers: as(OWNER_STAFF) });
    expect(authed.statusCode).toBe(200);
    expect(authed.headers["cache-control"]).toBe("no-store");
    expect(v1.meWebSession.response.parse(authed.json()).user).toMatchObject({ id: OWNER_STAFF_ID, hasTotpSecret: true });

    const health = await call({ method: "GET", url: "/api/v1/web/health" });
    expect(health.statusCode).toBe(200);
    expect(health.headers["cache-control"]).toBe("no-store");
    expect(health.headers.etag).toBeUndefined();
    expect(v1.webHealth.response.parse(health.json())).toMatchObject({ ok: true, db: true, storage: true, time: "2026-11-26T10:00:00.000Z" });
  });

  it("POST /web/auth/register, POST /web/auth/forgot, GET /web/auth/reset/{token}, POST /web/auth/reset", async () => {
    const regBody = { name: "Айгерим", email: "new@example.kz", password: "password123", locale: "ru" as const };
    const regOk = await call({ method: "POST", url: "/api/v1/web/auth/register", headers: { "x-real-ip": "10.0.0.5" }, payload: regBody });
    expect(regOk.statusCode).toBe(200);
    expect(v1.webAuthRegister.response.parse(regOk.json()).token).toBe("tok-reg-1");
    expect(limiter.hits).toContain("register:10.0.0.5");

    authPort.register.mockRejectedValueOnce(new IdentityError("exists"));
    const dup = await call({ method: "POST", url: "/api/v1/web/auth/register", payload: regBody });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().code).toBe("exists");

    registrationIsOpen = false;
    const closed = await call({ method: "POST", url: "/api/v1/web/auth/register", payload: regBody });
    expect(closed.statusCode).toBe(403);
    expect(closed.json().code).toBe("registrationClosed");
    registrationIsOpen = true;

    limiter.deny = true;
    expect((await call({ method: "POST", url: "/api/v1/web/auth/register", payload: regBody })).statusCode).toBe(429);
    expect((await call({ method: "POST", url: "/api/v1/web/auth/forgot", payload: { email: "a@b.kz" } })).statusCode).toBe(429);
    limiter.deny = false;

    const forgotOk = await call({ method: "POST", url: "/api/v1/web/auth/forgot", payload: { email: "a@b.kz", locale: "kk" } });
    expect(forgotOk.statusCode).toBe(200);
    expect(authPort.requestPasswordReset).toHaveBeenCalledWith("a@b.kz", "kk");

    const info = await call({ method: "GET", url: `/api/v1/web/auth/reset/${RESET_TOKEN}` });
    expect(info.statusCode).toBe(200);
    expect(v1.webAuthResetInfo.response.parse(info.json())).toEqual({ valid: true, purpose: "reset", shopWhatsappDigits: "77019998877" });

    // Сброс пароля (обычная сессия)
    const rstOk = await call({ method: "POST", url: "/api/v1/web/auth/reset", payload: { token: RESET_TOKEN, password: "newpassword123" } });
    expect(rstOk.statusCode).toBe(200);
    expect(v1.webAuthResetComplete.response.parse(rstOk.json())).toMatchObject({ kind: "session", token: "tok-rst-1", access: false });

    // Сброс пароля сотрудника с 2FA
    authPort.resetPassword.mockResolvedValueOnce({ kind: "second_factor", userId: OWNER_STAFF_ID });
    const rst2fa = await call({ method: "POST", url: "/api/v1/web/auth/reset", payload: { token: RESET_TOKEN, password: "newpassword123" } });
    expect(rst2fa.statusCode).toBe(200);
    expect(rst2fa.json()).toMatchObject({ kind: "second_factor", token: null, access: false });

    // Ссылка доступа (purpose: "access") и её просрочка → 400 accessExpired
    authPort.linkInfo.mockResolvedValueOnce({ purpose: "access", valid: true });
    const accOk = await call({ method: "POST", url: "/api/v1/web/auth/reset", payload: { token: RESET_TOKEN, password: "newpassword123" } });
    expect(accOk.statusCode).toBe(200);
    expect(accOk.json()).toMatchObject({ kind: "session", token: "tok-acc-1", access: true });

    authPort.linkInfo.mockResolvedValueOnce({ purpose: "access", valid: false });
    authPort.redeemAccessLink.mockRejectedValueOnce(new IdentityError("resetExpired"));
    const accExp = await call({ method: "POST", url: "/api/v1/web/auth/reset", payload: { token: RESET_TOKEN, password: "newpassword123" } });
    expect(accExp.statusCode).toBe(400);
    expect(accExp.json().code).toBe("accessExpired");
  });

  it("GET /web/shelf, POST /web/books, DELETE /web/books/{bookId}, GET /web/invite", async () => {
    const shelf = await call({ method: "GET", url: "/api/v1/web/shelf?locale=ru", headers: as(CLIENT) });
    expect(shelf.statusCode).toBe(200);
    expect(v1.webShelf.response.parse(shelf.json()).books).toHaveLength(1);

    // Мастер книги: подарок без recipientName → 400 badData с текстом мастера
    const badBook = await call({
      method: "POST",
      url: "/api/v1/web/books",
      headers: as(CLIENT),
      payload: { theme: "mom", language: "ru", authorName: "Айгерим", authorGender: "f" },
    });
    expect(badBook.statusCode).toBe(400);
    expect(badBook.json().code).toBe("badData");

    const okBook = await call({
      method: "POST",
      url: "/api/v1/web/books",
      headers: as(CLIENT),
      payload: { theme: "mom", language: "ru", authorName: "Айгерим", authorGender: "f", recipientName: "Мама", recipientGender: "f" },
    });
    expect(okBook.statusCode).toBe(200);
    expect(okBook.json()).toEqual({ id: BOOK_ID });
    expect(webPort.startBook).toHaveBeenCalledWith(CLIENT_ID, expect.objectContaining({ theme: "mom", authorName: "Айгерим", recipientName: "Мама" }));

    // Удаление книги: владелец, сотрудник с clients.edit и доменная ошибка bookHasOrders → 409
    const delOwn = await call({ method: "DELETE", url: `/api/v1/web/books/${BOOK_ID}`, headers: as(CLIENT) });
    expect(delOwn.statusCode).toBe(200);
    expect(webPort.deleteBook).toHaveBeenCalledWith(BOOK_ID, { userId: CLIENT_ID, isStaff: false, staffEdits: false });

    const delStaff = await call({ method: "DELETE", url: `/api/v1/web/books/${BOOK_ID}`, headers: as(OWNER_STAFF) });
    expect(delStaff.statusCode).toBe(200);
    expect(webPort.deleteBook).toHaveBeenCalledWith(BOOK_ID, { userId: OWNER_STAFF_ID, isStaff: true, staffEdits: true });

    webPort.deleteBook.mockRejectedValueOnce(new AuthoringError("bookHasOrders"));
    const delConflict = await call({ method: "DELETE", url: `/api/v1/web/books/${BOOK_ID}`, headers: as(CLIENT) });
    expect(delConflict.statusCode).toBe(409);
    expect(delConflict.json().code).toBe("bookHasOrders");

    const inv = await call({ method: "GET", url: "/api/v1/web/invite?locale=kk", headers: as(CLIENT) });
    expect(inv.statusCode).toBe(200);
    expect(v1.webInvite.response.parse(inv.json()).code).toBe("MYBOOK10");
    expect(webPort.inviteData).toHaveBeenCalledWith(CLIENT_ID, "kk");
  });
});

describe("cabinet (5 маршрутов) и BookAccessGuard (владелец + матрица ролей CRM)", () => {
  it("GET /cabinet/shelf, /books/{id}, /photos, /help и POST /help", async () => {
    const shelf = await call({ method: "GET", url: "/api/v1/cabinet/shelf", headers: as(CLIENT) });
    expect(shelf.statusCode).toBe(200);
    expect(v1.cabinetShelf.response.parse(shelf.json()).books[0]).toMatchObject({ id: BOOK_ID, started: true });

    const book = await call({ method: "GET", url: `/api/v1/cabinet/books/${BOOK_ID}`, headers: as(CLIENT) });
    expect(book.statusCode).toBe(200);
    expect(v1.cabinetBook.response.parse(book.json())).toMatchObject({ id: BOOK_ID, editable: true });

    const photos = await call({ method: "GET", url: `/api/v1/cabinet/books/${BOOK_ID}/photos`, headers: as(CLIENT) });
    expect(photos.statusCode).toBe(200);
    expect(v1.cabinetPhotos.response.parse(photos.json())).toMatchObject({ editable: true, maxPhotos: 100 });

    const help = await call({ method: "GET", url: `/api/v1/cabinet/books/${BOOK_ID}/help?section=photos`, headers: as(CLIENT) });
    expect(help.statusCode).toBe(200);
    expect(v1.cabinetHelp.response.parse(help.json())).toMatchObject({ enabled: true });

    const ask = await call({ method: "POST", url: `/api/v1/cabinet/books/${BOOK_ID}/help`, headers: as(CLIENT), payload: { text: "Где мои фото?", human: false } });
    expect(ask.statusCode).toBe(200);
    expect(v1.cabinetHelpAsk.response.parse(ask.json())).toMatchObject({ outcome: "answered" });
    expect(bookPort.helpAsk).toHaveBeenCalledWith(sampleBook, CLIENT, { text: "Где мои фото?", place: null, human: false }, "ru");
  });

  it("права на книгу: чужой → 404, сотрудник clients.view (без edit) → editable:false, scope=own (свой/чужой клиент), gate=2fa и disabled → 404", async () => {
    // Чужой клиент → 404
    const foreign = await call({ method: "GET", url: `/api/v1/cabinet/books/${BOOK_ID}`, headers: as(CLIENT_KK) });
    expect(foreign.statusCode).toBe(404);
    expect(foreign.json().code).toBe("bookNotFound");

    // Невалидный UUID → 400 раньше BookAccessGuard
    const badUuid = await call({ method: "GET", url: "/api/v1/cabinet/books/not-a-uuid", headers: as(CLIENT_KK) });
    expect(badUuid.statusCode).toBe(400);

    // Сотрудник с clients.view (без clients.edit) видит фото, но editable=false
    const viewOnly = await call({ method: "GET", url: `/api/v1/cabinet/books/${BOOK_ID}/photos`, headers: as(VIEW_STAFF) });
    expect(viewOnly.statusCode).toBe(200);
    expect(viewOnly.json().editable).toBe(false);

    // Сотрудник scope=own видит книгу своего клиента (managerId === OWN_STAFF_ID) с editable=true
    bookOwnerManagerId = OWN_STAFF_ID;
    const ownAllowed = await call({ method: "GET", url: `/api/v1/cabinet/books/${BOOK_ID}/photos`, headers: as(OWN_STAFF) });
    expect(ownAllowed.statusCode).toBe(200);
    expect(ownAllowed.json().editable).toBe(true);

    // Сотрудник scope=own НЕ видит книгу чужого клиента → 404
    bookOwnerManagerId = OWNER_STAFF_ID;
    const ownDenied = await call({ method: "GET", url: `/api/v1/cabinet/books/${BOOK_ID}/photos`, headers: as(OWN_STAFF) });
    expect(ownDenied.statusCode).toBe(404);

    // Неизвестная книга у сотрудника scope=own → 404
    expect((await call({ method: "GET", url: `/api/v1/cabinet/books/${OTHER_BOOK_ID}`, headers: as(OWN_STAFF) })).statusCode).toBe(404);

    // Сотрудник с gate=2fa и отключённый сотрудник не получают прав сотрудника на чужую книгу → 404
    expect((await call({ method: "GET", url: `/api/v1/cabinet/books/${BOOK_ID}`, headers: as(GATED_STAFF) })).statusCode).toBe(404);
    expect((await call({ method: "GET", url: `/api/v1/cabinet/books/${BOOK_ID}`, headers: as(DISABLED_STAFF) })).statusCode).toBe(404);

    // Неверный метод → 405 Allow
    const wrong = await call({ method: "DELETE", url: `/api/v1/cabinet/books/${BOOK_ID}/help`, headers: as(CLIENT) });
    expect(wrong.statusCode).toBe(405);
    expect(wrong.headers.allow).toBe("GET, POST");
  });
});
