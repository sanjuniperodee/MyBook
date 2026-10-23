import { NextResponse } from "next/server";
import { apiStaff } from "@/server/api";
import { mobile } from "@/server/mobile-api";
import { z } from "zod";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { createDealAction } from "@/app/admin/deals/actions";
import { mobileDeals } from "@/app/api/mobile/data";

export const dynamic = "force-dynamic";

/** Воронка и сделки: ?p=воронка&mine=1&a=ответственный|none&q=поиск&task=none|overdue&stale=дней. */
export const GET = mobile(async (req) => {
  const staff = await apiStaff(req, "deals.view");
  const url = new URL(req.url);
  const sp: Record<string, string | undefined> = {};
  for (const k of ["p", "mine", "a", "q", "task", "stale", "src"]) sp[k] = url.searchParams.get(k) ?? undefined;
  return NextResponse.json(await mobileDeals(staff, sp));
});

const create = z.object({
  title: z.string().min(2).max(200),
  contactName: z.string().max(120).optional(),
  contactPhone: z.string().max(40).optional(),
  amount: z.number().int().min(0).optional(),
  source: z.string().optional(),
  stageId: z.string().uuid().optional(),
  assigneeId: z.string().uuid().optional(),
  clientId: z.string().uuid().optional(),
});

/** Новая сделка вручную: { title, contactName?, contactPhone?, amount?, stageId?, assigneeId?, clientId? } → { id }. */
export const POST = mobile(async (req) => {
  await apiStaff(req, "deals.edit");
  const b = create.parse(await req.json());
  const form = new FormData();
  for (const [k, v] of Object.entries(b)) if (v !== undefined) form.set(k, String(v));
  try {
    const r = await createDealAction({}, form);
    return NextResponse.json(r, { status: 400 });
  } catch (err) {
    // Действие CRM заканчивается переходом на карточку сделки — оттуда берём id новой сделки.
    if (isRedirectError(err)) {
      const id = (err as { digest?: string }).digest?.split(";")[2]?.split("/").pop();
      if (id) return NextResponse.json({ ok: true, id });
    }
    throw err;
  }
});
