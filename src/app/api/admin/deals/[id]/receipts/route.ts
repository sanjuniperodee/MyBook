import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { api, apiStaff, HttpError } from "@/server/api";
import { audit, can, canSeeAssigned } from "@/server/access";
import { container } from "@/server/container";
import { formatPrice } from "@/config/site";
import { ReceiptError, RECEIPT_MAX_BYTES } from "@/modules/sales";

export const maxDuration = 60;

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

/** Приложить чек об оплате к сделке: multipart — file (фото, скриншот или PDF до 12 МБ) и amount (сумма платежа, ₸). */
export const POST = api(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const staff = await apiStaff(req, "deals.edit");
  const { id } = await params;
  const deal = await container().sales.deals.findById(id);
  if (!deal) return bad("Сделка не найдена", 404);
  if (!canSeeAssigned(staff, deal.assigneeId)) throw new HttpError(403, "forbidden");

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) return bad("Выберите файл чека");
  if (file.size > RECEIPT_MAX_BYTES) return bad("Файл больше 12 МБ");
  const amount = Number(form.get("amount") ?? 0);
  if (!Number.isFinite(amount) || amount < 0 || amount > 100_000_000) return bad("Проверьте сумму");

  try {
    const row = await container().sales.receipts.add({ dealId: deal.id, clientId: deal.clientId, bytes: Buffer.from(await file.arrayBuffer()), fileName: file.name, amount, uploadedById: staff.user.id });
    const actor = { userId: staff.user.id, name: staff.user.name || staff.user.email, seesAll: staff.scope === "all", allTasks: can(staff, "tasks.all") };
    await container().clients.notes.add(actor, { kind: "note", text: `Приложен чек${row.amount ? ` на ${formatPrice(row.amount)}` : ""}: ${row.fileName}`, dealId: deal.id, clientId: deal.clientId ?? undefined });
    await audit(staff, "receipt.add", "deal", deal.id, { receipt: row.id, amount: row.amount });
    revalidatePath(`/admin/deals/${deal.id}`);
    return NextResponse.json({ receipt: { id: row.id, fileName: row.fileName, amount: row.amount, mime: row.mime, size: row.size, createdAt: row.createdAt } });
  } catch (err) {
    if (err instanceof ReceiptError) return bad(err.code === "type" ? "Нужен файл JPG, PNG, WEBP или PDF" : err.code === "tooBig" ? "Файл больше 12 МБ" : "Файл пустой");
    throw err;
  }
});
