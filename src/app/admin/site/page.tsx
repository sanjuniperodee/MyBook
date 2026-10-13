import { registrationOpen } from "@/config/site";
import { requireStaff } from "@/server/access";
import { ensureCatalog } from "@/server/catalog";
import { SiteForm } from "./SiteForm";

export const metadata = { title: "Сайт" };

export default async function SitePage() {
  await requireStaff("settings.manage");
  await ensureCatalog();
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Сайт</h1>
        <p className="mt-1 text-sm text-muted">Переключатели публичной части сайта. Применяются сразу.</p>
      </div>
      <SiteForm registration={registrationOpen()} />
    </div>
  );
}
