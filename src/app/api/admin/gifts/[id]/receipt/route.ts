import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { api, apiStaff, HttpError } from "@/server/api";
import { audit } from "@/server/access";
import { container } from "@/server/container";
import { idParams } from "@/server/input";
import { RECEIPT_MAX_BYTES, receiptProblem } from "@/shared/domain/receipt";
import { receiptProblemError } from "@/server/payment-errors";
import { staffLabel } from "@/shared/domain/staff";

export const maxDuration = 60;

/**
 * «Оплачен» у сертификата (analytics-d8): multipart с file — чек перевода (скриншот, фото или PDF до 12 МБ). Без чека
 * код не выпускается; подтверждение — в журнал.
 */
export const POST = api(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const staff = await apiStaff(req, "gifts.manage");
  const { id } = idParams(await params, "id");
  const file = (await req.formData()).get("file");
  if (!(file instanceof File) || !file.size) throw new HttpError(400, "receiptRequired");
  if (file.size > RECEIPT_MAX_BYTES) throw receiptProblemError("tooBig");
  const bytes = Buffer.from(await file.arrayBuffer());
  const problem = receiptProblem(bytes);
  if (problem) throw receiptProblemError(problem);
  const gift = await container().ordering.gifts.confirmManual(id, { bytes, fileName: file.name }, { label: `admin:${staffLabel(staff.user)}`, userId: staff.user.id });
  if (!gift) throw new HttpError(409, "giftNotPending");
  const receipt = gift.snapshot().receipt;
  await audit(staff, "gift.paid", "gift", id, { number: gift.number, amount: gift.snapshot().amount, receipt: receipt?.fileName });
  revalidatePath("/admin/gifts");
  return NextResponse.json({ ok: true });
});

/** Чек ручного подтверждения сертификата — тем, кто ведёт сертификаты; просмотр — в журнал. */
export const GET = api(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const staff = await apiStaff(req, "gifts.manage");
  const { id } = idParams(await params, "id");
  const file = await container().ordering.gifts.receipt(id);
  if (!file) throw new HttpError(404, "notFound");
  await audit(staff, "receipt.view", "gift", id, { number: file.gift.number });
  return new Response(new Uint8Array(file.bytes), {
    headers: {
      "Content-Type": file.receipt.mime,
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(file.receipt.fileName)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox",
    },
  });
});
