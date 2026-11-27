import { Global, Module } from "@nestjs/common";
import { container, type Container } from "@/server/container";
import { CLOCK, RATE_LIMITER, UNIT_OF_WORK } from "../core/kernel/tokens";
import { AUTHORING_SITE_PORTS } from "../modules/authoring-site/authoring-site.tokens";
import { CRM_ADMIN_PORTS } from "../modules/crm-admin/crm-admin.tokens";
import { CRM_MOBILE_API_PORTS } from "../modules/crm-mobile-api/crm-mobile-api.tokens";
import { CRM_MOBILE_SITE_PORTS } from "../modules/crm-mobile-site/crm-mobile-site.tokens";
import { CRM_OPS_PORTS } from "../modules/crm-ops/crm-ops.tokens";
import { CRM_SITE_PORTS } from "../modules/crm-site/crm-site.tokens";
import { FEEDBACK_PORTS } from "../modules/feedback/feedback.tokens";
import { ORDERS_API_PORTS } from "../modules/orders/orders.tokens";
import { SITE_OPS_PORTS } from "../modules/site-ops/site-ops.tokens";
import { PUBLIC_PORTS } from "../modules/public/public.tokens";
import { OPS_PORTS } from "../modules/ops/ops.tokens";
import { legacyAuthoringExports, legacyAuthoringProviders } from "./authoring.ports";
import { legacyAuthoringSitePorts } from "./authoring-site.ports";
import { LEGACY_AUTHORING_STUDIO_TOKENS, legacyAuthoringStudioPorts } from "./authoring-studio.ports";
import { legacyCrmAdminPorts } from "./crm-admin.ports";
import { LEGACY_CRM_CORE_TOKENS, legacyCrmCorePorts } from "./crm-core.ports";
import { legacyCrmMobileApiPorts } from "./crm-mobile-api.ports";
import { legacyCrmMobileSitePorts } from "./crm-mobile-site.ports";
import { legacyCrmOpsPorts } from "./crm-ops.ports";
import { legacyCrmSitePorts } from "./crm-site.ports";
import { legacyFeedbackPorts } from "./feedback.ports";
import { legacyOrdersPorts } from "./orders.ports";
import { legacySiteOpsPorts } from "./site-ops.ports";
import { LEGACY_IDENTITY_TOKENS, legacyIdentityPorts } from "./identity.ports";
import { LEGACY_CONTAINER } from "./legacy.tokens";
import { legacyPublicPorts } from "./public.ports";
import { legacyOpsPorts } from "./ops.ports";

/**
 * Антикоррупционный слой переходного периода (ADR 0014, правило 9): единственное место, где бэкенд на Nest касается
 * старого корня композиции. Отсюда — общее ядро процесса (единица работы с outbox, часы, лимиты), чтобы события и лимиты
 * не раздваивались между mybook-api и бэкендом, и порты контекстов, которые ещё не переехали.
 * Когда переедут все контексты, модуль удаляется вместе с src/server/container.ts.
 */
@Global()
@Module({
  providers: [
    { provide: LEGACY_CONTAINER, useFactory: () => container() },
    { provide: UNIT_OF_WORK, useFactory: (c: Container) => c.uow, inject: [LEGACY_CONTAINER] },
    { provide: CLOCK, useFactory: (c: Container) => c.clock, inject: [LEGACY_CONTAINER] },
    { provide: RATE_LIMITER, useFactory: (c: Container) => c.rateLimiter, inject: [LEGACY_CONTAINER] },
    ...legacyAuthoringStudioPorts,
    legacyCrmAdminPorts,
    ...legacyCrmCorePorts,
    legacyCrmMobileApiPorts,
    legacyCrmSitePorts,
    legacyCrmMobileSitePorts,
    legacyFeedbackPorts,
    legacyOrdersPorts,
    legacySiteOpsPorts,
    ...legacyIdentityPorts,
    legacyPublicPorts,
    ...legacyAuthoringProviders,
    legacyAuthoringSitePorts,
    legacyCrmOpsPorts,
    legacyOpsPorts,
  ],
  exports: [
    LEGACY_CONTAINER,
    UNIT_OF_WORK,
    CLOCK,
    RATE_LIMITER,
    CRM_ADMIN_PORTS,
    CRM_MOBILE_API_PORTS,
    CRM_SITE_PORTS,
    CRM_MOBILE_SITE_PORTS,
    FEEDBACK_PORTS,
    ORDERS_API_PORTS,
    SITE_OPS_PORTS,
    ...LEGACY_IDENTITY_TOKENS,
    PUBLIC_PORTS,
    ...legacyAuthoringExports,
    ...LEGACY_AUTHORING_STUDIO_TOKENS,
    AUTHORING_SITE_PORTS,
    ...LEGACY_CRM_CORE_TOKENS,
    CRM_OPS_PORTS,
    OPS_PORTS,
  ],
})
export class LegacyModule {}
