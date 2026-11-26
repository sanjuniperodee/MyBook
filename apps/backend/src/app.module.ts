import { Module } from "@nestjs/common";
import { CoreModule } from "./core/core.module";
import { LegacyModule } from "./legacy/legacy.module";
import { FeedbackApiModule } from "./modules/feedback/feedback.module";

/** Корень бэкенда: ядро, переходный слой и контексты — по одному, по мере переезда (ADR 0014). */
@Module({ imports: [CoreModule, LegacyModule, FeedbackApiModule] })
export class AppModule {}
