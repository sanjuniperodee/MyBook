import { Global, Module } from "@nestjs/common";
import { container, type Container } from "@/server/container";
import { CLOCK, RATE_LIMITER, UNIT_OF_WORK } from "../core/kernel/tokens";
import { FEEDBACK_PORTS } from "../modules/feedback/feedback.tokens";
import { legacyFeedbackPorts } from "./feedback.ports";
import { LEGACY_IDENTITY_TOKENS, legacyIdentityPorts } from "./identity.ports";
import { LEGACY_CONTAINER } from "./legacy.tokens";

/**
 * Антикоррупционный слой переходного периода (ADR 0014, правило 9): единственное место, где бэкенд на Nest касается
 * старого корня композиции. Отсюда — общее ядро процесса (единица работы с outbox, часы, лимиты), чтобы события и лимиты
 * не раздваивались между mybook-api и бэкендом, и порты контекстов, которые ещё не переехали (feedback.adapters.ts).
 * Когда переедут все контексты, модуль удаляется вместе с src/server/container.ts.
 */
@Global()
@Module({
  providers: [
    { provide: LEGACY_CONTAINER, useFactory: () => container() },
    { provide: UNIT_OF_WORK, useFactory: (c: Container) => c.uow, inject: [LEGACY_CONTAINER] },
    { provide: CLOCK, useFactory: (c: Container) => c.clock, inject: [LEGACY_CONTAINER] },
    { provide: RATE_LIMITER, useFactory: (c: Container) => c.rateLimiter, inject: [LEGACY_CONTAINER] },
    legacyFeedbackPorts,
    ...legacyIdentityPorts,
  ],
  exports: [LEGACY_CONTAINER, UNIT_OF_WORK, CLOCK, RATE_LIMITER, FEEDBACK_PORTS, ...LEGACY_IDENTITY_TOKENS],
})
export class LegacyModule {}
