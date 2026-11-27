import type { Provider } from "@nestjs/common";
import { audit } from "@/server/access";
import { syncCatalogFromSettings } from "@/server/catalog";
import type { Container } from "@/server/container";
import { createPromoAction, togglePromoAction } from "@/server/crm-actions/admin";
import { grantCreditsAction, saveFreeLimitAction } from "@/server/crm-actions/ai-designer";
import {
  createProductAction,
  deleteCollectionAction,
  deleteProductAction,
  saveCollectionAction,
  setProductHiddenAction,
  syncCatalogAction,
  updateProductAction,
} from "@/server/crm-actions/catalog";
import { cancelGiftAction, resendGiftAction } from "@/server/crm-actions/gifts";
import { archiveLinkAction, createLinkAction } from "@/server/crm-actions/marketing";
import { savePricingAction } from "@/server/crm-actions/pricing";
import { moderateReviewAction } from "@/server/crm-actions/reviews";
import { deleteTemplateAction, saveTemplateAction } from "@/server/crm-actions/settings-crm";
import { saveSellerAction, setGiftNoteAction, setMaxPhotosAction, setRegistrationAction } from "@/server/crm-actions/site";
import {
  createStaffAction,
  resetStaffPasswordAction,
  revokeStaffAction,
  setStaffDisabledAction,
  setStaffExtensionAction,
  setStaffPhoneAction,
  setStaffRoleAction,
} from "@/server/crm-actions/team";
import { designAiStats } from "@/server/designAiStats";
import { designAiFreeLimit } from "@/server/designAiStore";
import { maxPhotos } from "@/server/photoLimit";
import { staffLabel } from "@/shared/domain/staff";
import { CRM_ADMIN_PORTS, type CrmAdminPorts, type CrmAdminRequestContext } from "../modules/crm-admin/crm-admin.tokens";
import { runInLegacyRequest, toLegacyStaff } from "./legacy-request";
import { LEGACY_CONTAINER } from "./legacy.tokens";

const inRequest = <T>(ctx: CrmAdminRequestContext, fn: () => T): T =>
  runInLegacyRequest({ staff: ctx.staff, token: ctx.token, ip: ctx.ip, locale: ctx.locale }, fn);

/**
 * Адаптер портов Контекста 5A-2 («CRM-2, часть 2: каталог, маркетинг/ИИ-дизайнер и админка»)
 * к старому контейнеру и действиям `src/server/crm-actions/*`. Все вызовы действий и аудита
 * обёрнуты в `runInLegacyRequest` — ноль обращений к `next/headers`.
 */
export const legacyCrmAdminPorts: Provider<CrmAdminPorts> = {
  provide: CRM_ADMIN_PORTS,
  useFactory: (c: Container): CrmAdminPorts => ({
    // Каталог WhatsApp
    catalogSyncIfStale: (maxAgeMs) => c.messaging.catalog.syncIfStale(maxAgeMs),
    catalogList: () => c.messaging.catalog.list(),
    catalogLastSyncedAt: () => c.messaging.catalog.lastSyncedAt(),
    gowaCachedPhone: async () => (await c.messaging.gowa.cachedStatus()).phone ?? null,
    catalogCollections: () => c.messaging.catalog.collections(),
    syncCatalog: (ctx) => inRequest(ctx, () => syncCatalogAction()),
    createProduct: (ctx, form) => inRequest(ctx, () => createProductAction(form)),
    updateProduct: (ctx, id, form) => inRequest(ctx, () => updateProductAction(id, form)),
    setProductHidden: (ctx, id, hidden) => inRequest(ctx, () => setProductHiddenAction(id, hidden)),
    deleteProduct: (ctx, id) => inRequest(ctx, () => deleteProductAction(id)),
    saveCollection: (ctx, id, input) => inRequest(ctx, () => saveCollectionAction(id, input)),
    deleteCollection: (ctx, id) => inRequest(ctx, () => deleteCollectionAction(id)),

    // ИИ-дизайнер
    designAiFreeLimit: () => designAiFreeLimit(),
    designAiStats: (days, freeLimit) => designAiStats(days, freeLimit),
    designAiSettings: () => c.assistant.designSettings(),
    grantDesignAiCredits: (ctx, form) => inRequest(ctx, () => grantCreditsAction({}, form)),
    saveDesignAiFreeLimit: (ctx, form) => inRequest(ctx, () => saveFreeLimitAction({}, form)),

    // Маркетинг: каналы и ссылки
    marketingReport: (periodDays) => c.marketing.service.report(periodDays),
    marketingLinks: () => c.marketing.links.all(),
    marketingLinkTarget: (link) => c.marketing.service.target(link),
    marketingShortUrl: (slug) => c.marketing.service.shortUrl(slug),
    createMarketingLink: (ctx, form) => inRequest(ctx, () => createLinkAction({}, form)),
    archiveMarketingLink: (ctx, id, archived) => inRequest(ctx, () => archiveLinkAction(id, archived)),

    // Промокоды
    promoStats: () => c.ordering.queries.promoStats(),
    createPromo: (ctx, form) => inRequest(ctx, () => createPromoAction({}, form)),
    togglePromo: (ctx, id) => inRequest(ctx, () => togglePromoAction(id)),

    // Подарочные сертификаты
    recentGifts: () => c.ordering.queries.recentGifts(),
    confirmGiftPayment: (ctx, id, file) =>
      inRequest(ctx, async () => {
        const legacyStaff = toLegacyStaff(ctx.staff);
        const gift = await c.ordering.gifts.confirmManual(id, file, {
          label: `admin:${staffLabel(ctx.staff.user)}`,
          userId: ctx.staff.user.id,
        });
        if (!gift) return false;
        const receipt = gift.snapshot().receipt;
        await audit(legacyStaff, "gift.paid", "gift", id, {
          number: gift.number,
          amount: gift.snapshot().amount,
          receipt: receipt?.fileName,
        });
        return true;
      }),
    resendGift: (ctx, id) => inRequest(ctx, () => resendGiftAction(id)),
    cancelGift: (ctx, id) => inRequest(ctx, () => cancelGiftAction(id)),

    // Отзывы
    reviewList: (filter) => c.feedback.queries.list(filter),
    reviewCounts: () => c.feedback.queries.counts(),
    reviewSummary: () => c.feedback.queries.summary(),
    moderateReview: (ctx, id, action) => inRequest(ctx, () => moderateReviewAction(id, action)),

    // Админка: сайт, цены, команда, шаблоны
    syncCatalogFromSettings: () => syncCatalogFromSettings(),
    maxPhotos: () => maxPhotos(),
    setRegistration: (ctx, form) => inRequest(ctx, () => setRegistrationAction({}, form)),
    setGiftNote: (ctx, form) => inRequest(ctx, () => setGiftNoteAction({}, form)),
    setMaxPhotos: (ctx, form) => inRequest(ctx, () => setMaxPhotosAction({}, form)),
    saveSeller: (ctx, form) => inRequest(ctx, () => saveSellerAction({}, form)),
    savePricing: (ctx, form) => inRequest(ctx, () => savePricingAction({}, form)),
    listRoles: () => c.access.queries.roles(),
    listTeam: () => c.access.queries.team(),
    createStaff: (ctx, form) => inRequest(ctx, () => createStaffAction({}, form)),
    setStaffRole: (ctx, userId, roleId) => inRequest(ctx, () => setStaffRoleAction(userId, roleId)),
    setStaffExtension: (ctx, userId, extension) => inRequest(ctx, () => setStaffExtensionAction(userId, extension)),
    setStaffPhone: (ctx, userId, phone) => inRequest(ctx, () => setStaffPhoneAction(userId, phone)),
    setStaffDisabled: (ctx, userId, disabled) => inRequest(ctx, () => setStaffDisabledAction(userId, disabled)),
    revokeStaff: (ctx, userId) => inRequest(ctx, () => revokeStaffAction(userId)),
    resetStaffPassword: (ctx, userId) => inRequest(ctx, () => resetStaffPasswordAction(userId)),
    listSharedTemplates: () => c.workspace.templates.list(),
    saveSharedTemplate: (ctx, form) => inRequest(ctx, () => saveTemplateAction({}, form)),
    deleteSharedTemplate: (ctx, id) => inRequest(ctx, () => deleteTemplateAction(id)),
  }),
  inject: [LEGACY_CONTAINER],
};
