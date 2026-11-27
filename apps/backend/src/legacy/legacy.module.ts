import { Global, Module } from "@nestjs/common";
import { container, type Container } from "@/server/container";
import { CLOCK, RATE_LIMITER, UNIT_OF_WORK } from "../core/kernel/tokens";
import { AUTHORING_SITE_PORTS } from "../modules/authoring-site/authoring-site.tokens";
import { CRM_MOBILE_API_PORTS } from "../modules/crm-mobile-api/crm-mobile-api.tokens";
import { CRM_OPS_PORTS } from "../modules/crm-ops/crm-ops.tokens";
import { FEEDBACK_PORTS } from "../modules/feedback/feedback.tokens";
import { PUBLIC_PORTS } from "../modules/public/public.tokens";
import { legacyAuthoringExports, legacyAuthoringProviders } from "./authoring.ports";
import { legacyAuthoringSitePorts } from "./authoring-site.ports";
import { LEGACY_AUTHORING_STUDIO_TOKENS, legacyAuthoringStudioPorts } from "./authoring-studio.ports";
import { LEGACY_CRM_CORE_TOKENS, legacyCrmCorePorts } from "./crm-core.ports";
import { legacyCrmMobileApiPorts } from "./crm-mobile-api.ports";
import { legacyCrmOpsPorts } from "./crm-ops.ports";
import { legacyFeedbackPorts } from "./feedback.ports";
import { LEGACY_IDENTITY_TOKENS, legacyIdentityPorts } from "./identity.ports";
import { LEGACY_CONTAINER } from "./legacy.tokens";
import { legacyPublicPorts } from "./public.ports";

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
    ...legacyCrmCorePorts,
    legacyCrmMobileApiPorts,
    legacyFeedbackPorts,
    ...legacyIdentityPorts,
    legacyPublicPorts,
    ...legacyAuthoringProviders,
    legacyAuthoringSitePorts,
    legacyCrmOpsPorts,
  ],
  exports: [
    LEGACY_CONTAINER,
    UNIT_OF_WORK,
    CLOCK,
    RATE_LIMITER,
    CRM_MOBILE_API_PORTS,
    FEEDBACK_PORTS,
    ...LEGACY_IDENTITY_TOKENS,
    PUBLIC_PORTS,
    ...legacyAuthoringExports,
    ...LEGACY_AUTHORING_STUDIO_TOKENS,
    AUTHORING_SITE_PORTS,
    ...LEGACY_CRM_CORE_TOKENS,
    CRM_OPS_PORTS,
  ],
})
export class LegacyModule {}
