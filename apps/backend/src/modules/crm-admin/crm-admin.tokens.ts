import type { Locale } from "@/i18n/config";
import type { CatalogCollection, StoredProduct } from "@/modules/messaging";
import type { StaffMember } from "../../core/auth/staff";

/** Порты Контекста 5A-2 («CRM-2, часть 2: каталог, маркетинг/ИИ-дизайнер и админка — 35 маршрутов»). */
export const CRM_ADMIN_PORTS = Symbol("CrmAdminPorts");

/** Контекст текущего запроса сотрудника для переходного слоя legacy (без обращения к next/headers). */
export interface CrmAdminRequestContext {
  staff: StaffMember;
  token: string | null;
  ip: string;
  locale: Locale;
}

export type CrmCatalogActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export interface CrmFormState {
  ok?: string;
  error?: string;
}

export interface CrmPricingFormState extends CrmFormState {
  warning?: string;
}

export interface CrmMessageResult {
  ok: boolean;
  message: string;
}

export interface CrmMarketingLinkRecord {
  id: string;
  name: string;
  slug: string;
  kind: "site" | "whatsapp";
  targetPath: string;
  waText: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  utmContent: string;
  archived: boolean;
  createdAt: Date;
}

export interface CrmPromoStatRow {
  promo: {
    id: string;
    code: string;
    kind: "percent" | "fixed";
    value: number;
    active: boolean;
    usedCount: number;
    maxUses: number | null;
    expiresAt: Date | null;
    note: string | null;
  };
  revenue: number;
  paid: number;
}

export interface CrmGiftRecord {
  id: string;
  number: number;
  status: "pending_payment" | "paid" | "cancelled";
  amount: number;
  plan: string;
  buyerName: string | null;
  buyerEmail: string | null;
  buyerPhone: string | null;
  recipientName: string;
  recipientEmail: string | null;
  sentAt: Date | null;
  sendAt: string | null;
  createdAt: Date;
  paymentClaimedAt: Date | null;
  promo: { code: string; usedCount: number } | null;
  receiptStorageKey: string | null;
}

export type CrmReviewFilter = "new" | "published" | "hidden" | "all";
export type CrmReviewModerationAction = "publish" | "hide" | "feature" | "unfeature";

export interface CrmReviewRecord {
  id: string;
  status: "new" | "published" | "hidden";
  rating: number;
  text: string;
  authorName: string | null;
  city: string | null;
  theme: string;
  locale: string;
  featured: boolean | null;
  consent: boolean;
  photo: { width: number; height: number } | null;
  orderId: string | null;
  orderNumber: number | null;
  thankYouCode: string | null;
  createdAt: Date;
}

export interface CrmReviewCounts {
  new?: number;
  published?: number;
  hidden?: number;
}

export interface CrmReviewSummary {
  count: number;
  average: number;
}

export interface CrmRoleRecord {
  id: string;
  name: string;
  key: string | null;
}

export interface CrmTeamRow {
  user: {
    id: string;
    name: string;
    email: string;
    crmRoleId: string | null;
    sipExtension: string | null;
    phone: string | null;
    staffDisabled: boolean;
    onShift: boolean;
    lastSeenAt: Date | null;
  };
  openDeals: number;
  calls7d: number;
}

export interface CrmSharedTemplateRecord {
  id: string;
  title: string;
  text: string;
}

export type CrmCatalogProduct = Pick<
  StoredProduct,
  "id" | "name" | "description" | "price" | "currency" | "retailerId" | "url" | "hidden" | "review" | "imageUrls" | "videoUrls"
>;

export interface CrmDesignAiStats {
  totals: { ok: number; failed: number; users: number; free: number; credit: number; costUsd: number; avgMs: number | null };
  people: { used: number; hitLimit: number; withCredits: number; creditsLeft: number };
  purchases: { paid: number; paidAmount: number; pending: number; pendingAmount: number };
  byMode: { key: string; requests: number; costUsd: number }[];
  byDay: { day: string; requests: number; users: number }[];
  topUsers: { userId: string; name: string; email: string; requests: number; free: number; credit: number; credits: number; lastAt: Date }[];
}

export interface CrmMarketingMetrics {
  clicks: number;
  leads: number;
  registrations: number;
  startedBook: number;
  sales: number;
  revenue: number;
  spend?: number;
}

export interface CrmMarketingLinkMetrics {
  clicks: number;
  leads: number;
  registrations: number;
  sales: number;
  revenue: number;
}

export interface CrmMarketingReport {
  total: CrmMarketingMetrics;
  channels: (CrmMarketingMetrics & { key: string; label: string })[];
  links: ReadonlyMap<string, CrmMarketingLinkMetrics>;
}

export interface CrmAdminPorts {
  // Каталог WhatsApp (8 маршрутов)
  catalogSyncIfStale(maxAgeMs: number): Promise<string | null>;
  catalogList(): Promise<CrmCatalogProduct[]>;
  catalogLastSyncedAt(): Promise<Date | null>;
  gowaCachedPhone(): Promise<string | null>;
  catalogCollections(): Promise<CatalogCollection[]>;
  syncCatalog(ctx: CrmAdminRequestContext): Promise<CrmCatalogActionResult<{ total: number; removed: number }>>;
  createProduct(ctx: CrmAdminRequestContext, form: FormData): Promise<CrmCatalogActionResult<{ id: string }>>;
  updateProduct(ctx: CrmAdminRequestContext, id: string, form: FormData): Promise<CrmCatalogActionResult>;
  setProductHidden(ctx: CrmAdminRequestContext, id: string, hidden: boolean): Promise<CrmCatalogActionResult>;
  deleteProduct(ctx: CrmAdminRequestContext, id: string): Promise<CrmCatalogActionResult>;
  saveCollection(ctx: CrmAdminRequestContext, id: string | null, input: { name: string; productIds: string[] }): Promise<CrmCatalogActionResult>;
  deleteCollection(ctx: CrmAdminRequestContext, id: string): Promise<CrmCatalogActionResult>;

  // ИИ-дизайнер (3 маршрута)
  designAiFreeLimit(): Promise<number>;
  designAiStats(days: number, freeLimit: number): Promise<CrmDesignAiStats>;
  designAiSettings(): Promise<{ enabled: boolean }>;
  grantDesignAiCredits(ctx: CrmAdminRequestContext, form: FormData): Promise<CrmFormState>;
  saveDesignAiFreeLimit(ctx: CrmAdminRequestContext, form: FormData): Promise<CrmFormState>;

  // Маркетинг: каналы и ссылки (3 маршрута)
  marketingReport(periodDays: number | null): Promise<CrmMarketingReport>;
  marketingLinks(): Promise<CrmMarketingLinkRecord[]>;
  marketingLinkTarget(link: CrmMarketingLinkRecord): Promise<string>;
  marketingShortUrl(slug: string): string;
  createMarketingLink(ctx: CrmAdminRequestContext, form: FormData): Promise<CrmFormState>;
  archiveMarketingLink(ctx: CrmAdminRequestContext, id: string, archived: boolean): Promise<void>;

  // Промокоды (3 маршрута)
  promoStats(): Promise<CrmPromoStatRow[]>;
  createPromo(ctx: CrmAdminRequestContext, form: FormData): Promise<CrmFormState>;
  togglePromo(ctx: CrmAdminRequestContext, id: string): Promise<void>;

  // Подарочные сертификаты (4 маршрута)
  recentGifts(): Promise<CrmGiftRecord[]>;
  confirmGiftPayment(ctx: CrmAdminRequestContext, id: string, file: { bytes: Buffer; fileName: string }): Promise<boolean>;
  resendGift(ctx: CrmAdminRequestContext, id: string): Promise<void>;
  cancelGift(ctx: CrmAdminRequestContext, id: string): Promise<void>;

  // Отзывы (2 маршрута)
  reviewList(filter: CrmReviewFilter): Promise<CrmReviewRecord[]>;
  reviewCounts(): Promise<CrmReviewCounts>;
  reviewSummary(): Promise<CrmReviewSummary>;
  moderateReview(ctx: CrmAdminRequestContext, id: string, action: CrmReviewModerationAction): Promise<void>;

  // Админка: сайт, цены, команда, общие шаблоны (12 маршрутов)
  syncCatalogFromSettings(): Promise<void>;
  maxPhotos(): Promise<number>;
  setRegistration(ctx: CrmAdminRequestContext, form: FormData): Promise<CrmFormState>;
  setGiftNote(ctx: CrmAdminRequestContext, form: FormData): Promise<CrmFormState>;
  setMaxPhotos(ctx: CrmAdminRequestContext, form: FormData): Promise<CrmFormState>;
  saveSeller(ctx: CrmAdminRequestContext, form: FormData): Promise<CrmFormState>;
  savePricing(ctx: CrmAdminRequestContext, form: FormData): Promise<CrmPricingFormState>;
  listRoles(): Promise<CrmRoleRecord[]>;
  listTeam(): Promise<CrmTeamRow[]>;
  createStaff(ctx: CrmAdminRequestContext, form: FormData): Promise<CrmFormState>;
  setStaffRole(ctx: CrmAdminRequestContext, userId: string, roleId: string): Promise<void>;
  setStaffExtension(ctx: CrmAdminRequestContext, userId: string, extension: string): Promise<void>;
  setStaffPhone(ctx: CrmAdminRequestContext, userId: string, phone: string): Promise<CrmMessageResult>;
  setStaffDisabled(ctx: CrmAdminRequestContext, userId: string, disabled: boolean): Promise<void>;
  revokeStaff(ctx: CrmAdminRequestContext, userId: string): Promise<void>;
  resetStaffPassword(ctx: CrmAdminRequestContext, userId: string): Promise<CrmMessageResult>;
  listSharedTemplates(): Promise<CrmSharedTemplateRecord[]>;
  saveSharedTemplate(ctx: CrmAdminRequestContext, form: FormData): Promise<CrmFormState>;
  deleteSharedTemplate(ctx: CrmAdminRequestContext, id: string): Promise<void>;
}
