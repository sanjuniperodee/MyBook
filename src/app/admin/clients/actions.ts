"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { uuid } from "@/server/input";
import { assertStaff, audit, canSeeAssigned } from "@/server/access";
import { REPEAT_SALE_MAX, repeatSale, repeatSaleDeps } from "@/server/repeat-sale";

const schema = z.object({
  title: z.string().trim().min(3, "Название сделки — хотя бы пара слов").max(120),
  text: z.string().trim().min(10, "Текст клиенту — хотя бы одно предложение").max(1500),
  textKk: z.string().trim().max(1500).optional(),
  tag: z.string().trim().toLowerCase().max(30).optional(),
});

/**
 * «Повторная продажа» по выбранным клиентам (contacts-14): сделка, готовый текст в истории сделки и задача написать —
 * клиентам CRM ничего не отправляет. «Только свои» — по своим клиентам и клиентам без ответственного.
 */
export async function repeatSaleAction(clientIds: string[], input: z.input<typeof schema>): Promise<{ ok: true; message: string } | { ok: false; message: string }> {
  const staff = await assertStaff("clients.edit", "deals.edit");
  const ids = z.array(uuid).max(REPEAT_SALE_MAX, `За раз — не больше ${REPEAT_SALE_MAX} клиентов`).safeParse(clientIds);
  if (!ids.success) return { ok: false, message: ids.error.issues[0].message };
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const deps = repeatSaleDeps();
  const client = deps.client;
  // Чужого клиента «только свои» не видит — как будто его нет.
  deps.client = async (id) => {
    const c = await client(id);
    return c && (staff.scope === "all" || canSeeAssigned(staff, c.managerId)) ? c : null;
  };
  const d = parsed.data;
  const res = await repeatSale(deps, { clientIds: ids.data, title: d.title, text: d.text, textKk: d.textKk, tag: d.tag || undefined, actorId: staff.user.id });
  await audit(staff, "client.repeat_sale", "client", null, { title: d.title, tag: d.tag ?? null, selected: ids.data.length, ...res });
  revalidatePath("/admin/clients");
  revalidatePath("/admin/deals");
  const skipped = [res.skipped.noMarketing ? `просили не писать первым: ${res.skipped.noMarketing}` : null, res.skipped.openDeal ? `уже в работе: ${res.skipped.openDeal}` : null, res.skipped.notFound ? `не найдены: ${res.skipped.notFound}` : null].filter(Boolean);
  return { ok: true, message: `Сделок заведено: ${res.created}${skipped.length ? ` · пропущено — ${skipped.join(", ")}` : ""}` };
}
