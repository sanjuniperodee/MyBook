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
import { AUTHORING_SITE_PORTS, type AuthoringSitePorts } from "../src/modules/authoring-site/authoring-site.tokens";
import { CRM_ADMIN_PORTS, type CrmAdminPorts } from "../src/modules/crm-admin/crm-admin.tokens";
import { CRM_MOBILE_API_PORTS, type CrmMobileApiPorts } from "../src/modules/crm-mobile-api/crm-mobile-api.tokens";
import { CRM_SITE_PORTS, type CrmSitePorts } from "../src/modules/crm-site/crm-site.tokens";
import { ORDERS_API_PORTS } from "../src/modules/orders/orders.tokens";
import { SITE_OPS_PORTS } from "../src/modules/site-ops/site-ops.tokens";
import { CRM_MOBILE_SITE_PORTS, type CrmMobileSitePorts } from "../src/modules/crm-mobile-site/crm-mobile-site.tokens";
import {
  CRM_CHATS_PORTS,
  CRM_CLIENTS_PORTS,
  CRM_DEALS_PORTS,
  CRM_LISTS_PORTS,
  type CrmChatsPorts,
  type CrmClientsPorts,
  type CrmDealsPorts,
  type CrmListsPorts,
} from "../src/modules/crm-core/crm-core.tokens";
import { CRM_OPS_PORTS, type CrmOpsPorts } from "../src/modules/crm-ops/crm-ops.tokens";
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
  recordLandingVisit: async () => {},
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
  outline: {},
  photos: {},
  letters: {},
  photoRepository: {},
  photoFile: async () => Buffer.alloc(0),
  photoViewFile: async () => Buffer.alloc(0),
  photoStream: async () => null,
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
    photoBookId: async () => null,
  },
};

const defaultAuthoringSitePorts: AuthoringSitePorts = {
  bookFileQuota: async () => ({ minutes: 30, usedSec: 0, leftSec: 1800, files: 0, maxFiles: 40 }),
  listBookFiles: async () => [],
  findBookFile: async () => null,
  findAnswerFileByToken: async () => null,
  fileView: (f) => ({
    id: f.id,
    token: f.token,
    url: `http://localhost:3000/v/${f.token}`,
    kind: f.kind,
    status: f.status as "ready",
    name: f.name,
    durationSec: f.durationSec,
    sourceBytes: f.sourceBytes,
    receivedBytes: f.receivedBytes,
    error: null,
    poster: f.hasPoster ? `/api/v/${f.token}?poster=1` : null,
  }),
  mediaPackOffers: async () => [],
  startUpload: async () => {
    throw new Error("AUTHORING_SITE_PORTS.startUpload не подменён в тесте");
  },
  appendChunk: async () => 0,
  finishUpload: async (f) => f,
  removeFile: async () => {},
  kickAnswerFiles: () => {},
  createMediaPurchase: async () => {
    throw new Error("AUTHORING_SITE_PORTS.createMediaPurchase не подменён в тесте");
  },
  serveAnswerPoster: async () => null,
  serveAnswerMedia: async () => null,
  ensureCatalog: async () => {},
  kaspiAvailable: async () => false,
  kaspiPaymentProps: async () => null,
  createDesignAiPurchase: async () => {
    throw new Error("AUTHORING_SITE_PORTS.createDesignAiPurchase не подменён в тесте");
  },
  manuscript: async () => null,
  previewPdf: async () => null,
  pageImage: async () => null,
  pagesSpreadImage: async () => null,
  coverImage: async () => null,
  coverTemplateThumb: async () => null,
  helpThread: async () => ({ enabled: false, whatsapp: "", messages: [], hints: [] }),
  helpAsk: async () => ({ outcome: "answered", handoff: false, suggestions: [], messages: [] }),
  helpApply: async () => ({ outcome: "answered", proposal: null, messages: [] }),
  designAiInfo: async () => ({ allowance: { limit: 5, used: 0, remaining: 5, credits: 0, total: 5 }, packs: [], theme: "love", hasPhotos: false }),
  runDesignAi: async () => ({ mode: "edit", reply: "", patch: {} }),
  hitClientAi: async () => "ok",
  proofreadConfigured: async () => false,
  proofreadCheck: async () => [],
  writerConfigured: async () => false,
  writerRewrite: async () => "",
  misspelled: async () => ({}),
  servePhotoFile: async () => null,
  coverArt: async () => null,
  coverPhotoResized: async () => Buffer.alloc(0),
  readFontFile: async () => null,
  fetchYoutubeTitle: async () => ({ ok: true, title: null }),
};

const defaultCrmMobileApiPorts: CrmMobileApiPorts = {
  autoShiftOnVisit: async () => true,
  setShift: async () => {},
  live: async () => ({ counters: { attention: 0, tasks: 0, chats: 0, calls: 0, deals: 0, reviews: 0, finance: 0 }, unread: 0 }),
  dashboard: async () => ({
    cur: { sum: 0, n: 0 },
    prev: { sum: 0, n: 0 },
    newUsers: { cur: 0, prev: 0 },
    daily: [],
    funnelRows: { rows: [] },
    byPlan: [],
    attention: [],
    deadlines: [],
    dealDeadlines: [],
  }),
  stageCounts: async () => [],
  listStages: async () => [],
  listTemplates: async () => [],
  saveMyTemplate: async () => ({ ok: true, id: "00000000-0000-4000-8000-000000000000" }),
  deleteMyTemplate: async () => ({ ok: true }),
  duplicateTemplate: async () => ({ ok: true }),
  reorderMyTemplates: async () => ({ ok: true }),
  aiTemplateDraft: async () => ({ ok: true, title: "", text: "", replaced: [], ai: false }),
  callDial: async () => ({ ok: true }),
  markCallHandled: async () => ({ ok: true }),
  chatProducts: async () => ({ ok: true, enabled: false, products: [] }),
  sendProduct: async () => ({ ok: true }),
  sendCatalogLink: async () => ({ ok: true }),
  orderItems: async () => ({ ok: true, items: [], total: null, currency: "KZT" }),
  openChat: async () => ({ ok: true, id: "00000000-0000-4000-8000-000000000000" }),
  forwardTargets: async () => [],
  assignConversation: async () => {},
  createDealFromChat: async () => ({ id: "00000000-0000-4000-8000-000000000000" }),
  forwardMessage: async () => ({ sent: 1, failed: [] }),
  sendInternalNote: async () => ({ id: "00000000-0000-4000-8000-000000000000" }),
  pinChat: async () => ({ ok: true }),
  markRead: async () => {},
  setConversationStatus: async () => {},
  sendMessage: async () => ({ id: "00000000-0000-4000-8000-000000000000", status: "sent", error: null }),
  findConversation: async () => null,
  convertAudio: async () => null,
  sendUpload: async () => ({ id: "00000000-0000-4000-8000-000000000000", status: "sent", error: null }),
  editMessage: async () => ({ ok: true }),
  deleteMessage: async () => ({ ok: true }),
  resendMessage: async () => ({ ok: true }),
  transcribeMessage: async () => ({ text: "" }),
  createDeal: async () => ({ error: "CRM_MOBILE_API_PORTS.createDeal не подменён в тесте" }),
  acceptDeal: async () => ({ ok: true }),
  assignDeal: async () => ({ ok: true }),
  moveDeal: async () => ({ ok: true }),
  addNote: async () => ({}),
  rejectDeal: async () => ({ requested: false, message: "Отклонено", deleted: true }),
  createTask: async () => ({}),
  taskDetail: async () => null,
  updateTask: async () => ({}),
  deleteTask: async () => ({}),
  completeTask: async () => ({}),
  snoozeTask: async () => ({}),
  toggleTask: async () => ({}),
  moveOrder: async () => ({}),
};

const defaultCrmListsPorts: CrmListsPorts = {
  today: async () => ({
    counts: { tasks: 0, overdueTasks: 0, waiting: 0, missed: 0, unsorted: 0, openDeals: 0, openDealsSum: 0, noNextStep: 0 },
    plan: null,
    tasks: [],
    waiting: [],
    missed: [],
  }),
  tasks: async () => [],
  calls: async () => ({ stats: { total: 0, answered: 0, missed: 0, talk: 0 }, calls: [] }),
  clients: async () => ({ total: 0, page: 1, pageSize: 40, clients: [] }),
  clientCard: async () => {
    throw new Error("CRM_LISTS_PORTS.clientCard не подменён в тесте");
  },
  staffList: async () => ({ canAssignOthers: false, staff: [] }),
  notifications: async () => [],
  markNotificationsRead: async () => {},
  chats: async () => [],
  chatDetail: async () => {
    throw new Error("CRM_LISTS_PORTS.chatDetail не подменён в тесте");
  },
  conversation: async () => null,
  chatMessages: async () => ({ messages: [], more: false }),
  deals: async () => ({ pipelines: [], pipeline: null, stages: [], deals: [] }),
  dealDetail: async () => {
    throw new Error("CRM_LISTS_PORTS.dealDetail не подменён в тесте");
  },
  orders: async () => ({ canEdit: false, statuses: [], orders: [] }),
  orderDetail: async () => {
    throw new Error("CRM_LISTS_PORTS.orderDetail не подменён в тесте");
  },
};

const defaultCrmDealsPorts: CrmDealsPorts = {
  findDeal: async () => null,
  dealById: async () => null,
  listFields: async () => [],
  agreedPlan: async () => null,
  agreedGifts: async () => [],
  discountLimit: async () => null,
  updateDeal: async () => ({ ok: "Сохранено" }),
  setAgreedPlan: async () => ({ ok: true }),
  setAgreedGifts: async () => ({ ok: true }),
  duplicates: async () => ({ open: [], past: [] }),
  findClientByPhone: async () => null,
  clientBrief: async () => null,
  listPipelines: async () => [],
  listStages: async () => [],
  createClientFromDeal: async () => ({ error: "CRM_DEALS_PORTS.createClientFromDeal не подменён в тесте" }),
  linkDealClient: async () => ({ ok: true }),
  mergeDeal: async () => {},
  movePipeline: async () => {},
  deleteDeal: async () => {},
};

const defaultCrmClientsPorts: CrmClientsPorts = {
  clientById: async () => null,
  listFields: async () => [],
  noMarketingFor: async () => false,
  allStaff: async () => [],
  listStages: async () => [],
  listPipelines: async () => [],
  discountLimit: async () => null,
  payFormOptions: async () => [],
  issueClientAccess: async () => ({ error: "CRM_CLIENTS_PORTS.issueClientAccess не подменён в тесте" }),
  remindClient: async () => ({ ok: true, message: "Напоминание отправлено" }),
  setClientPhones: async () => ({ ok: true }),
  updateClientTags: async () => {},
  setClientFields: async () => ({ ok: "Сохранено" }),
  setClientNoMarketing: async () => ({ ok: true }),
  setClientLocale: async () => ({ ok: true }),
  setClientChannel: async () => ({ ok: true }),
  setClientManager: async () => ({ ok: true }),
  createClient: async () => ({ error: "CRM_CLIENTS_PORTS.createClient не подменён в тесте" }),
  uploadDealReceipt: async () => ({ ok: true }),
};

const defaultCrmChatsPorts: CrmChatsPorts = {
  conversation: async () => null,
  botTrace: async () => ({ error: "След хода не найден" }),
  botTraces: async () => [],
  startBot: async () => {},
  stopBot: async () => {},
  chatOffers: async () => ({ order: null, book: null, maxDiscount: 0 }),
  sendOffer: async () => ({ ok: true, message: "Отправлено" }),
};

const defaultCrmOpsPorts: CrmOpsPorts = {
  listBoards: async () => [],
  viewBoard: async () => {
    throw new Error("CRM_OPS_PORTS.viewBoard не подменён в тесте");
  },
  createCard: async () => {
    throw new Error("CRM_OPS_PORTS.createCard не подменён в тесте");
  },
  cardSummary: async () => {
    throw new Error("CRM_OPS_PORTS.cardSummary не подменён в тесте");
  },
  cardDetail: async () => {
    throw new Error("CRM_OPS_PORTS.cardDetail не подменён в тесте");
  },
  updateCard: async () => {},
  removeCard: async () => {},
  moveCard: async () => {},
  setCardDone: async () => {},
  archiveCard: async () => {},
  setCardAssignees: async () => {},
  setCardWatching: async () => {},
  setCardLabel: async () => {},
  addChecklist: async () => "00000000-0000-4000-8000-000000000001",
  addChecklistItem: async () => "00000000-0000-4000-8000-000000000002",
  updateChecklistItem: async () => {},
  deleteChecklistItem: async () => {},
  commentCard: async () => "00000000-0000-4000-8000-000000000003",
  attachCardFile: async () => "00000000-0000-4000-8000-000000000004",
  calendarRange: async () => [],
  runCrmOp: async () => null,
  runCrmAction: async () => null,
  bookList: async () => [],
  remindMany: async () => ({ sent: 0, skipped: 0 }),
  supportList: async () => [],
  supportCounts: async () => ({ new: 0, in_progress: 0, waiting: 0, done: 0, rejected: 0 }),
  supportTicketByNumber: async () => null,
  supportUpdate: async () => ({ ok: true, notified: null }),
  supportNotify: async () => ({ ok: true, notified: true }),
  allStaff: async () => [],
  getSetting: async () => "",
  listFields: async () => [],
  salesRegister: async () => [],
  setPayForm: async () => ({ ok: true }),
  loadSalesAnalytics: async () => {
    throw new Error("CRM_OPS_PORTS.loadSalesAnalytics не подменён в тесте");
  },
  leadStats: async () => ({ deals: [], payments: [], invoices: [], spend: [] }),
  mergeClosedDays: async () => 30,
  saveCrmSettings: async () => ({ ok: "Сохранено" }),
  saveBot: async () => ({ ok: "Сохранено" }),
  rolesWithMembers: async () => [],
  saveRole: async () => ({ ok: "Роль сохранена" }),
  deleteRole: async () => {},
  twoFactorStatus: async () => [],
  beginTwoFactor: async () => ({ secret: "TESTSECRET", otpauthUrl: "otpauth://totp/MyBooks:test?secret=TESTSECRET&issuer=MyBooks" }),
  confirmTwoFactor: async () => ({ ok: true, codes: [] }),
  newBackupCodes: async () => ({ ok: true, codes: [] }),
  disableTwoFactor: async () => ({ ok: true }),
  saveSecurity: async () => ({ ok: "Сохранено" }),
  resetStaffTwoFactor: async () => ({ ok: true }),
};

const defaultCrmAdminPorts: CrmAdminPorts = {
  catalogSyncIfStale: async () => null,
  catalogList: async () => [],
  catalogLastSyncedAt: async () => null,
  gowaCachedPhone: async () => null,
  catalogCollections: async () => [],
  syncCatalog: async () => ({ ok: true, total: 0, removed: 0 }),
  createProduct: async () => ({ ok: true, id: "1001" }),
  updateProduct: async () => ({ ok: true }),
  setProductHidden: async () => ({ ok: true }),
  deleteProduct: async () => ({ ok: true }),
  saveCollection: async () => ({ ok: true }),
  deleteCollection: async () => ({ ok: true }),
  designAiFreeLimit: async () => 5,
  designAiStats: async () => ({
    totals: { ok: 0, failed: 0, users: 0, free: 0, credit: 0, costUsd: 0, avgMs: null },
    people: { used: 0, hitLimit: 0, withCredits: 0, creditsLeft: 0 },
    purchases: { paid: 0, paidAmount: 0, pending: 0, pendingAmount: 0 },
    byMode: [],
    byDay: [],
    topUsers: [],
  }),
  designAiSettings: async () => ({ enabled: true }),
  grantDesignAiCredits: async () => ({ ok: "+5" }),
  saveDesignAiFreeLimit: async () => ({ ok: "Сохранено" }),
  marketingReport: async () => ({
    total: { clicks: 0, leads: 0, registrations: 0, startedBook: 0, sales: 0, revenue: 0, spend: 0 },
    channels: [],
    links: new Map(),
  }),
  marketingLinks: async () => [],
  marketingLinkTarget: async () => "https://mybooks.kz/",
  marketingShortUrl: (slug) => `https://mybooks.kz/go/${slug}`,
  createMarketingLink: async () => ({ ok: "Ссылка создана" }),
  archiveMarketingLink: async () => {},
  promoStats: async () => [],
  createPromo: async () => ({ ok: "Промокод создан" }),
  togglePromo: async () => {},
  recentGifts: async () => [],
  confirmGiftPayment: async () => true,
  resendGift: async () => {},
  cancelGift: async () => {},
  reviewList: async () => [],
  reviewCounts: async () => ({ new: 0, published: 0, hidden: 0 }),
  reviewSummary: async () => ({ count: 0, average: 0 }),
  moderateReview: async () => {},
  syncCatalogFromSettings: async () => {},
  maxPhotos: async () => 100,
  setRegistration: async () => ({ ok: "Сохранено" }),
  setGiftNote: async () => ({ ok: "Сохранено" }),
  setMaxPhotos: async () => ({ ok: "Сохранено" }),
  saveSeller: async () => ({ ok: "Сохранено" }),
  savePricing: async () => ({ ok: "Цены сохранены" }),
  listRoles: async () => [],
  listTeam: async () => [],
  createStaff: async () => ({ ok: "Сотрудник добавлен" }),
  setStaffRole: async () => {},
  setStaffExtension: async () => {},
  setStaffPhone: async () => ({ ok: true, message: "Телефон сохранён" }),
  setStaffDisabled: async () => {},
  revokeStaff: async () => {},
  resetStaffPassword: async () => ({ ok: true, message: "Новый пароль отправлен" }),
  listSharedTemplates: async () => [],
  saveSharedTemplate: async () => ({ ok: "Сохранено" }),
  deleteSharedTemplate: async () => {},
};

const defaultCrmSitePorts: CrmSitePorts = {
  chatsInbox: async () => [],
  findConversation: async () => null,
  chatMessages: async () => [],
  sensitiveFor: async () => [],
  sendChatUpload: async () => ({ id: "00000000-0000-4000-8000-000000000000", status: "sent", error: null }),
  convertAudio: async () => null,
  findMessageMedia: async () => null,
  findDealById: async () => null,
  openMessageMedia: async () => null,
  addBotMaterial: async () => {
    throw new Error("CRM_SITE_PORTS.addBotMaterial не подменён в тесте");
  },
  botMaterialFile: async () => null,
  boardsDispatch: async () => Response.json({ error: "Не найдено", code: "notFound" }, { status: 404 }),
  boardCardFile: async () => {
    throw new Error("CRM_SITE_PORTS.boardCardFile не подменён в тесте");
  },
  serveBoardFile: async () => null,
  createSupportTicket: async () => {
    throw new Error("CRM_SITE_PORTS.createSupportTicket не подменён в тесте");
  },
  linkSupportChat: async () => {},
  processSupportTicket: async () => {},
  scheduleBackground: (fn) => {
    void Promise.resolve().then(fn);
  },
  findSupportTicket: async () => null,
  findSupportAttachment: async () => null,
  serveSupportAttachment: async () => null,
  isReleaseTokenValid: () => false,
  markSupportReleased: async () => [],
  catalogRemoteImage: async () => null,
  catalogProductImage: async () => null,
  liveState: async () => ({
    counters: { attention: 0, tasks: 0, chats: 0, calls: 0, deals: 0, reviews: 0, finance: 0 },
    unread: 0,
    notifications: [],
    ringing: [],
  }),
  subscribeLive: async () => () => {},
  markNotificationsRead: async () => {},
  syncMobileBadge: async () => {},
  vapidKeys: async () => ({ publicKey: "" }),
  subscribePush: async () => {},
  unsubscribePush: async () => {},
  findOrderDetails: async () => null,
  canSeeOrder: async () => false,
  preparePrintPackage: async (orderId) => ({ orderId, bookId: orderId, number: 0 }),
  getPrintFile: async () => Buffer.alloc(0),
  audit: async () => {},
  allStaff: async () => [],
  getSetting: async () => null,
  exportClients: async () => ({ rows: [], total: 0 }),
  exportExpenses: async () => [],
  exportFinance: async () => ({ money: [], deals: [], orders: [], unrecorded: [], review: [], resolutions: [] }),
  exportLeadStats: async () => ({ deals: [], payments: [], invoices: [], spend: [] }),
  exportOrders: async () => [],
  exportPayments: async () => [],
  exportProfit: async () => ({
    money: [],
    expenses: [],
    counts: { leads: 0, buyers: 0, buyersFirstSum: 0, buyersAgreed: 0, orders: 0, books: 0 },
    prevCounts: { leads: 0, buyers: 0, buyersFirstSum: 0, buyersAgreed: 0, orders: 0, books: 0 },
    forms: {},
  }),
  exportSalesRegister: async () => [],
  exportVcard: async () => [],
};

/** Порты Контекста 6 (сайт мобильного CRM): по умолчанию — «ничего нет», тесты подменяют нужное. */
const defaultCrmMobileSitePorts: CrmMobileSitePorts = {
  hasMobileApk: async () => false,
  readMobileApk: async () => Buffer.alloc(0),
  saveMobileApk: async () => {},
  iosEnrollProfile: () => "",
  iosStatus: async () => ({ build: null, devices: [] }),
  readIosToken: () => null,
  iosBuild: async () => null,
  readIosIpa: async () => Buffer.alloc(0),
  installManifest: () => "",
  parseIosDevice: () => null,
  saveIosDevice: async () => {},
  scheduleIosResign: () => {},
  invoiceFormInfo: async () => ({ ok: false, message: "Нет данных" }),
  issueInvoice: async () => ({ ok: false, message: "Не подменено в тесте" }),
  cancelInvoice: async () => ({ ok: false, message: "Не подменено в тесте" }),
  resendInvoice: async () => ({ ok: false, message: "Не подменено в тесте" }),
  findMediaAttachment: async () => null,
  findDealAssignee: async () => null,
  chatAudioFile: async () => null,
  serveAudioFile: async () => new Response(null, { status: 404 }),
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
    .overrideProvider(CRM_ADMIN_PORTS).useValue(defaultCrmAdminPorts)
    .overrideProvider(CRM_MOBILE_API_PORTS).useValue(defaultCrmMobileApiPorts)
    .overrideProvider(CRM_SITE_PORTS).useValue(defaultCrmSitePorts)
    .overrideProvider(SITE_OPS_PORTS).useValue({
      handle: async (_meta: unknown, route: string) => {
        throw new Error(`SITE_OPS_PORTS.handle(${route}) не подменён в тесте`);
      },
    })
    .overrideProvider(ORDERS_API_PORTS).useValue({
      run: async (_meta: unknown, name: string) => {
        throw new Error(`ORDERS_API_PORTS.run(${name}) не подменён в тесте`);
      },
    })
    .overrideProvider(CRM_MOBILE_SITE_PORTS).useValue(defaultCrmMobileSitePorts)
    .overrideProvider(CRM_LISTS_PORTS).useValue(defaultCrmListsPorts)
    .overrideProvider(CRM_DEALS_PORTS).useValue(defaultCrmDealsPorts)
    .overrideProvider(CRM_CLIENTS_PORTS).useValue(defaultCrmClientsPorts)
    .overrideProvider(CRM_CHATS_PORTS).useValue(defaultCrmChatsPorts)
    .overrideProvider(PUBLIC_PORTS).useValue(defaultPublicPorts)
    .overrideProvider(AUTHORING).useValue(defaultAuthoringStub)
    .overrideProvider(AUTHORING_BOOK_OWNERSHIP).useValue({ bookOwnership: async () => null })
    .overrideProvider(AUTHORING_ORDERING).useValue({ userOrders: async () => [], lastOrderOfBook: async () => null, agreementFor: async () => null })
    .overrideProvider(AUTHORING_PREVIEWS).useValue({ current: async () => null, build: async () => null, progressOf: () => null })
    .overrideProvider(AUTHORING_ASSISTANT).useValue({ dictate: async () => ({ text: "", by: "stub" }), proofreadConfigured: async () => false, writerConfigured: async () => false })
    .overrideProvider(AUTHORING_PHOTO_LIMIT).useValue({ maxPhotos: async () => 100 })
    .overrideProvider(AUTHORING_PHOTO_RENDERER).useValue({ probeOriginal: async () => ({ width: 1000, height: 800, suggestedLevels: { black: 0, white: 1, gamma: 1 } }), renderEdit: async () => Buffer.alloc(0) })
    .overrideProvider(AUTHORING_SITE_PORTS).useValue(defaultAuthoringSitePorts)
    .overrideProvider(CRM_OPS_PORTS).useValue(defaultCrmOpsPorts)
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
