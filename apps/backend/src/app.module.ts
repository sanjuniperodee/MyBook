import { Module } from "@nestjs/common";
import { CoreModule } from "./core/core.module";
import { LegacyModule } from "./legacy/legacy.module";
import { FeedbackApiModule } from "./modules/feedback/feedback.module";
import { IdentityApiModule } from "./modules/identity/identity.module";
import { PublicApiModule } from "./modules/public/public.module";

/** Корень бэкенда: ядро, переходный слой и контексты — по одному, по мере переезда (ADR 0014). */
@Module({ imports: [CoreModule, LegacyModule, FeedbackApiModule, IdentityApiModule, PublicApiModule] })
export class AppModule {}
