import { factorySeller, getSellerOverrides, registrationOpen } from "@/config/site";
import { PageHeader } from "@/components/admin/PageHeader";
import { requireStaff } from "@/server/access";
import { ensureCatalog } from "@/server/catalog";
import { SiteForm } from "./SiteForm";
import { SellerForm } from "./SellerForm";
import { MobileApkForm } from "./MobileApkForm";
import { hasMobileApk } from "@/server/mobile-apk";

export const metadata = { title: "Сайт" };

export default async function SitePage() {
  await requireStaff("settings.manage");
  await ensureCatalog();
  const apkUploaded = await hasMobileApk();
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader title="Сайт">Переключатели и реквизиты публичной части сайта. Применяются сразу.</PageHeader>
      <SiteForm registration={registrationOpen()} />
      <SellerForm values={getSellerOverrides()} factory={{ ...factorySeller }} />
      <MobileApkForm uploaded={apkUploaded} />
    </div>
  );
}
