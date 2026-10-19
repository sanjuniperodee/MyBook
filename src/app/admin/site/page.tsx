import { factorySeller, getSellerOverrides, registrationOpen } from "@/config/site";
import { requireStaff } from "@/server/access";
import { ensureCatalog } from "@/server/catalog";
import { SiteForm } from "./SiteForm";
import { SellerForm } from "./SellerForm";

export const metadata = { title: "Сайт" };

export default async function SitePage() {
  await requireStaff("settings.manage");
  await ensureCatalog();
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Сайт</h1>
        <p className="mt-1 text-sm text-muted">Переключатели и реквизиты публичной части сайта. Применяются сразу.</p>
      </div>
      <SiteForm registration={registrationOpen()} />
      <SellerForm values={getSellerOverrides()} factory={{ ...factorySeller }} />
    </div>
  );
}
