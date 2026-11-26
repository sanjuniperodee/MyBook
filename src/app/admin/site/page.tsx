import { factorySeller, getSellerOverrides, giftNoteEnabled, registrationOpen } from "@/config/site";
import { PageHeader } from "@/components/admin/PageHeader";
import { requireStaff } from "@/web/access";
import { ensureCatalog } from "@/web/catalog";
import { SettingsFrame } from "../settings/frame";
import { GiftNoteForm, MaxPhotosForm, SiteForm } from "./SiteForm";
import { MAX_PHOTOS_CEILING } from "@/modules/authoring/domain/Photo";
import { SellerForm } from "./SellerForm";
import { MobileApkForm } from "./MobileApkForm";
import { crmRead } from "@/web/crm";

export const metadata = { title: "Сайт" };

const ANCHORS = [
  { id: "registration", label: "Регистрация клиентов" },
  { id: "gift-note", label: "Открытка к заказу" },
  { id: "max-photos", label: "Фото в книге" },
  { id: "seller", label: "Реквизиты продавца" },
  { id: "apk", label: "Приложение продажника" },
];

export default async function SitePage() {
  await requireStaff("settings.manage");
  await ensureCatalog();
  const { apkUploaded, maxPhotos } = await crmRead("pages.site", {});
  return (
    <div className="flex max-w-6xl flex-col gap-5">
      <PageHeader title="Сайт">Переключатели и реквизиты публичной части сайта. Применяются сразу.</PageHeader>
      <SettingsFrame anchors={ANCHORS}>
        <SiteForm registration={registrationOpen()} />
        <GiftNoteForm enabled={giftNoteEnabled()} />
        <MaxPhotosForm value={maxPhotos} ceiling={MAX_PHOTOS_CEILING} />
        <SellerForm values={getSellerOverrides()} factory={{ ...factorySeller }} />
        <MobileApkForm uploaded={apkUploaded} />
      </SettingsFrame>
    </div>
  );
}
