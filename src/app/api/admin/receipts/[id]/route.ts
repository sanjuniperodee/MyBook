import { api, apiStaff, HttpError } from "@/server/api";
import { audit, canSeeAssigned } from "@/server/access";
import { container } from "@/server/container";

/** Чек об оплате: открывается в браузере (картинка или PDF), только сотруднику, который видит сделку. */
export const GET = api(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const staff = await apiStaff(req, "deals.view");
  const { id } = await params;
  const sales = container().sales;
  const receipt = await sales.receipts.find(id);
  if (!receipt) throw new HttpError(404, "notFound");
  const deal = await sales.deals.findById(receipt.dealId);
  if (!deal || !canSeeAssigned(staff, deal.assigneeId)) throw new HttpError(403, "forbidden");
  const data = await sales.receipts.read(receipt);
  await audit(staff, "receipt.view", "deal", deal.id, { receipt: receipt.id });
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": receipt.mime,
      // Имя может быть кириллицей — отдаём в виде filename*.
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(receipt.fileName)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
