import "reflect-metadata";
import { Test } from "@nestjs/testing";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { StaffContext } from "@/modules/access/domain/StaffContext";
import { isPhoneEmail, type CurrentUser } from "@/modules/identity";
import type { RateLimiter } from "@/shared/application/RateLimiter";
import { allPermissions } from "@/shared/domain/permissions";
import { AppModule } from "../src/app.module";
import { configureApp, createAdapter } from "../src/bootstrap";
import { APP_CONFIG, loadConfig } from "../src/core/config/app-config";
import { SESSION_USERS, type SessionUsers } from "../src/core/auth/session";
import { STAFF_ACCESS, type StaffAccessPort } from "../src/core/auth/staff";
import { CLOCK, RATE_LIMITER, UNIT_OF_WORK } from "../src/core/kernel/tokens";
import { LEGACY_CONTAINER } from "../src/legacy/legacy.tokens";
import {
  AUTHORING,
  AUTHORING_ASSISTANT,
  AUTHORING_BOOK_OWNERSHIP,
  AUTHORING_ORDERING,
  AUTHORING_PHOTO_LIMIT,
  AUTHORING_PHOTO_RENDERER,
  AUTHORING_PREVIEWS,
} from "../src/modules/authoring/authoring.tokens";
import {
  ANSWER_FILES_PORTS,
  PAGES_PORTS,
  type AnswerFilesPorts,
  type PagesPorts,
} from "../src/modules/authoring-studio/authoring-studio.tokens";
import { FEEDBACK_PORTS } from "../src/modules/feedback/feedback.tokens";
import {
  CABINET_BOOK_PORTS,
  CABINET_WEB_PORTS,
  IDENTITY_ACCOUNTS,
  IDENTITY_AUTH,
  MOBILE_DEVICES,
} from "../src/modules/identity/identity.tokens";
import { PUBLIC_PORTS, type PublicPorts } from "../src/modules/public/public.tokens";

/** Токен сессии в тестах (формат как у настоящего: base64url, 20+ символов). */
export const sessionOf = (user: Pick<CurrentUser, "id">) => `test-session-${user.id}`.padEnd(24, "x");

export const testUser = (id: string, extra: Partial<CurrentUser> = {}) =>
  ({
    id,
    name: "Айгерим",
    email: `${id}@example.kz`,
    phone: null,
    role: "user",
    tags: [],
    lastSeenAt: null,
    remindedAt: null,
    emailOptOut: false,
    locale: "ru",
    source: null,
    crmRoleId: null,
    managerId: null,
    sipExtension: null,
    notifyPrefs: {},
    onShift: true,
    extraPhones: [],
    customFields: {},
    staffDisabled: false,
    totpEnabledAt: null,
    totpSecret: null,
    totpBackup: [],
    deletedAt: null,
    purgedAt: null,
    createdAt: new Date("2026-10-01T10:00:00Z"),
    updatedAt: new Date("2026-10-01T10:00:00Z"),
    passwordHash: "",
    ...extra,
  }) as unknown as CurrentUser;

const defaultStaffAccess: StaffAccessPort = {
  async resolve(user) {
    if (user.role !== "admin" || user.staffDisabled) return null;
    return { context: new StaffContext(user.id, "Руководитель", "owner", "all", new Set(allPermissions), true, { isPhoneEmail }), gate: null };
  },
};

const defaultPagesPorts: PagesPorts = {
  book: async () => null,
  sampleMeta: async () => null,
  studioChapters: async () => [],
  chapterCandidates: async () => [],
  updateSettings: async () => {},
  moveChapter: async () => {},
  aiInfo: async () => ({ allowance: { remaining: 5, limit: 5, credits: 0 }, hasPhotos: false }),
  runAi: async () => {
    throw new Error("PAGES_PORTS.runAi не подменён в тесте");
  },
  storePreview: async () => "preview-stub",
};

const defaultAnswerFilesPorts: AnswerFilesPorts = {
  questions: async () => [],
  editQuestionMedia: async () => {},
  bookFileQuota: async () => ({ minutes: 30, usedSec: 0, leftSec: 1800, files: 0, maxFiles: 40 }),
  listBookFiles: async () => [],
  findBookFile: async () => null,
  mediaPackOffers: async () => [],
  kaspiAvailable: async () => false,
  startUpload: async () => {
    throw new Error("ANSWER_FILES_PORTS.startUpload не подменён в тесте");
  },
  appendChunk: async () => 0,
  finishUpload: async () => {
    throw new Error("ANSWER_FILES_PORTS.finishUpload не подменён в тесте");
  },
  kickWorker: () => {},
  removeFile: async () => {},
  ensureCatalog: async () => {},
  createMediaPurchase: async () => {
    throw new Error("ANSWER_FILES_PORTS.createMediaPurchase не подменён в тесте");
  },
  findMediaPurchase: async () => null,
  kaspiPaymentProps: async () => null,
  payMediaPack: async () => {
    throw new Error("ANSWER_FILES_PORTS.payMediaPack не подменён в тесте");
  },
  kaspiStatus: async () => {
    throw new Error("ANSWER_FILES_PORTS.kaspiStatus не подменён в тесте");
  },
};

const defaultPublicPorts: PublicPorts = {
  readCatalogSettings: async () => ({ overrides: null, registration: true, giftNote: true, seller: {} }),
  ensureCatalog: async () => {},
  widgetConfig: async () => ({ enabled: false, chat: false, whatsapp: "" }),
  shopWhatsapp: async () => "",
  reviewsShowcase: async () => [],
  reviewsSummary: async () => ({ count: 0, average: 0 }),
  reviewPhoto: async () => null,
  reviewPhotoFile: async () => new Uint8Array(),
  orderDetails: async () => null,
  isOrderOwner: async () => false,
  openReview: async () => ({ order: { name: "" }, review: null }),
  submitReview: async () => ({ status: "new", thankYouCode: null, hasPhoto: false }),
  inviteWelcome: async () => null,
  followShortLink: async () => null,
  giftByToken: async () => null,
  giftPaymentProps: async () => ({ online: null, manual: null, kaspi: null }),
  redeemUrl: (code, locale) => `http://localhost:3000/${locale}/redeem?code=${code}`,
  purchaseGift: async () => ({ token: "", amount: 0 }),
  claimGiftPayment: async () => null,
  checkPromo: async () => ({ ok: false, error: "notFound" }),
  giftByPromo: async () => null,
  giftPdf: async () => null,
  bookByInviteToken: async () => null,
  submitLetter: async () => {},
  isValidUnsubscribeLink: () => false,
  unsubscribe: async () => {},
  publicAnswerFile: async () => null,
  siteMessages: async () => [],
  postSiteChat: async () => {},
  requestCallback: async () => {},
  calendarFeed: async () => null,
  chatAvatarFile: async () => null,
};

const defaultAuthoringStub = {
  books: {},
  questions: {},
  photos: {},
  letters: {},
  photoRepository: {},
  photoFile: async () => Buffer.alloc(0),
  queries: {
    book: async () => null,
    visibleBook: async () => null,
    userBooks: async () => [],
    questions: async () => [],
    chapters: async () => [],
    photos: async () => [],
    editedPhotoIds: async () => new Set<string>(),
    letters: async () => [],
    approvedLetters: async () => [],
    stats: async () => ({ answered: 0, total: 0, words: 0, photos: 0, estimatedPages: 32, printedPages: 32, emptyChapters: 0 }),
    bundle: async () => null,
    photoFor: async () => null,
  },
};

/** Лимитер в памяти: сколько раз звали с каким ключом; `deny` — следующий вызов вернёт «лимит исчерпан». */
export class FakeLimiter implements RateLimiter {
  readonly hits: string[] = [];
  deny = false;
  async hit(key: string) {
    this.hits.push(key);
    return !this.deny;
  }
  async peek() {
    return null;
  }
  async reset() {}
}

/**
 * Приложение целиком (ядро, guard-ы, фильтр, контроллеры), а инфраструктура — подменена: БД, старый контейнер, сессии и
 * лимиты. Запросы — через Fastify inject, без порта.
 */
export async function bootTestApp(opts: { users: CurrentUser[]; overrides?: [token: unknown, value: unknown][]; env?: NodeJS.ProcessEnv; extraModules?: Parameters<typeof Test.createTestingModule>[0]["imports"] }) {
  const limiter = new FakeLimiter();
  const sessions: SessionUsers = { user: async (token) => opts.users.find((u) => sessionOf(u) === token) ?? null };
  let builder = Test.createTestingModule({ imports: [AppModule, ...(opts.extraModules ?? [])] })
    .overrideProvider(LEGACY_CONTAINER).useValue({})
    .overrideProvider(UNIT_OF_WORK).useValue({ run: (fn: () => unknown) => fn() })
    .overrideProvider(CLOCK).useValue({ now: () => new Date("2026-11-26T10:00:00Z") })
    .overrideProvider(RATE_LIMITER).useValue(limiter)
    .overrideProvider(FEEDBACK_PORTS).useValue({ promos: { issue: async () => null }, alerts: { lowRating: async () => {} } })
    .overrideProvider(IDENTITY_AUTH).useValue({
      login: async () => {
        throw new Error("IDENTITY_AUTH.login не подменён в тесте");
      },
      completeSecondFactor: async () => {
        throw new Error("IDENTITY_AUTH.completeSecondFactor не подменён в тесте");
      },
      logout: async () => {},
      openCompanionSession: async () => ({ token: "companion-token", expiresAt: new Date("2026-11-26T22:00:00Z") }),
      register: async () => {
        throw new Error("IDENTITY_AUTH.register не подменён в тесте");
      },
      requestPasswordReset: async () => {},
      linkInfo: async () => null,
      redeemAccessLink: async () => {
        throw new Error("IDENTITY_AUTH.redeemAccessLink не подменён в тесте");
      },
      resetPassword: async () => {
        throw new Error("IDENTITY_AUTH.resetPassword не подменён в тесте");
      },
    })
    .overrideProvider(IDENTITY_ACCOUNTS).useValue({
      freshUserBySession: (token: string) => sessions.user(token),
      updateProfile: async () => {},
      changePassword: async () => {},
      setLocale: async () => {},
      setReminders: async () => {},
      deletionPreview: async () => ({ confirm: "password" as const, items: [], kept: [], keptOrders: [] }),
      deleteClientAccount: async () => ({ confirm: "password" as const, items: [], kept: [], keptOrders: [] }),
    })
    .overrideProvider(MOBILE_DEVICES).useValue({
      register: async () => {},
      forget: async () => {},
      pushReady: () => false,
      androidClientOptions: () => null,
    })
    .overrideProvider(CABINET_WEB_PORTS).useValue({
      syncRegistrationOpen: async () => true,
      shopWhatsappDigits: async () => "77000000000",
      webShelf: async () => ({ books: [], agreement: null, agreementBooks: [] }),
      startBook: async () => ({ id: "00000000-0000-4000-8000-000000000000" }),
      deleteBook: async () => {},
      inviteData: async () => ({ code: "INV", link: "http://localhost:3000/r/INV", friendPercent: 10, rewardPercent: 10, friends: 0, rewards: [] }),
      healthStatus: async () => ({ ok: true, db: true, storage: true, redis: null, outbox: null }),
    })
    .overrideProvider(CABINET_BOOK_PORTS).useValue({
      bookOwnership: async () => null,
      visibleBook: async () => null,
      shelfBooks: async () => [],
      bookHub: async () => {
        throw new Error("CABINET_BOOK_PORTS.bookHub не подменён в тесте");
      },
      photosTab: async () => {
        throw new Error("CABINET_BOOK_PORTS.photosTab не подменён в тесте");
      },
      helpThread: async () => ({ enabled: false, whatsapp: "", messages: [], hints: [] }),
      helpAsk: async () => ({ outcome: "answered", suggestions: [], messages: [] }),
    })
    .overrideProvider(PAGES_PORTS).useValue(defaultPagesPorts)
    .overrideProvider(ANSWER_FILES_PORTS).useValue(defaultAnswerFilesPorts)
    .overrideProvider(PUBLIC_PORTS).useValue(defaultPublicPorts)
    .overrideProvider(AUTHORING).useValue(defaultAuthoringStub)
    .overrideProvider(AUTHORING_BOOK_OWNERSHIP).useValue({ bookOwnership: async () => null })
    .overrideProvider(AUTHORING_ORDERING).useValue({ userOrders: async () => [], lastOrderOfBook: async () => null, agreementFor: async () => null })
    .overrideProvider(AUTHORING_PREVIEWS).useValue({ current: async () => null, build: async () => null, progressOf: () => null })
    .overrideProvider(AUTHORING_ASSISTANT).useValue({ dictate: async () => ({ text: "", by: "stub" }), proofreadConfigured: async () => false, writerConfigured: async () => false })
    .overrideProvider(AUTHORING_PHOTO_LIMIT).useValue({ maxPhotos: async () => 100 })
    .overrideProvider(AUTHORING_PHOTO_RENDERER).useValue({ probeOriginal: async () => ({ width: 1000, height: 800, suggestedLevels: { black: 0, white: 1, gamma: 1 } }), renderEdit: async () => Buffer.alloc(0) })
    .overrideProvider(SESSION_USERS).useValue(sessions)
    .overrideProvider(STAFF_ACCESS).useValue(defaultStaffAccess);
  if (opts.env) builder = builder.overrideProvider(APP_CONFIG).useValue(loadConfig(opts.env));
  for (const [token, value] of opts.overrides ?? []) builder = builder.overrideProvider(token).useValue(value);
  const moduleRef = await builder.compile();
  const app = await configureApp(moduleRef.createNestApplication<NestFastifyApplication>(createAdapter(), { logger: false }));
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return { app, limiter };
}
