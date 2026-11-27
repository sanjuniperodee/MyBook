import { Module } from "@nestjs/common";
import { CoreModule } from "./core/core.module";
import { LegacyModule } from "./legacy/legacy.module";
import { AuthoringApiModule } from "./modules/authoring/authoring.module";
import { AuthoringSiteModule } from "./modules/authoring-site/authoring-site.module";
import { AuthoringStudioApiModule } from "./modules/authoring-studio/authoring-studio.module";
import { CrmCoreApiModule } from "./modules/crm-core/crm-core.module";
import { CrmMobileApiModule } from "./modules/crm-mobile-api/crm-mobile-api.module";
import { FeedbackApiModule } from "./modules/feedback/feedback.module";
import { IdentityApiModule } from "./modules/identity/identity.module";
import { PublicApiModule } from "./modules/public/public.module";

/** Корень бэкенда: ядро, переходный слой и контексты — по одному, по мере переезда (ADR 0014). */
@Module({
  imports: [
    CoreModule,
    LegacyModule,
    FeedbackApiModule,
    IdentityApiModule,
    PublicApiModule,
    AuthoringApiModule,
    AuthoringStudioApiModule,
    AuthoringSiteModule,
    CrmCoreApiModule,
    CrmMobileApiModule,
  ],
})
export class AppModule {}
