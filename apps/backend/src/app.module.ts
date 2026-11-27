import { Module } from "@nestjs/common";
import { CoreModule } from "./core/core.module";
import { LegacyModule } from "./legacy/legacy.module";
import { AuthoringApiModule } from "./modules/authoring/authoring.module";
import { AuthoringSiteModule } from "./modules/authoring-site/authoring-site.module";
import { AuthoringStudioApiModule } from "./modules/authoring-studio/authoring-studio.module";
import { CrmAdminApiModule } from "./modules/crm-admin/crm-admin.module";
import { CrmCoreApiModule } from "./modules/crm-core/crm-core.module";
import { CrmMobileApiModule } from "./modules/crm-mobile-api/crm-mobile-api.module";
import { CrmMobileSiteModule } from "./modules/crm-mobile-site/crm-mobile-site.module";
import { CrmOpsApiModule } from "./modules/crm-ops/crm-ops.module";
import { CrmSiteModule } from "./modules/crm-site/crm-site.module";
import { FeedbackApiModule } from "./modules/feedback/feedback.module";
import { IdentityApiModule } from "./modules/identity/identity.module";
import { OrdersApiModule } from "./modules/orders/orders.module";
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
    CrmAdminApiModule,
    CrmMobileSiteModule,
    CrmOpsApiModule,
    CrmSiteModule,
    OrdersApiModule,
  ],
})
export class AppModule {}
