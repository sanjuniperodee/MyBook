import "server-only";
import { sql } from "drizzle-orm";
import { executor } from "@/shared/infrastructure/database";
import type { DealInvoiceLifecycleStore } from "../../application/DealInvoiceLifecycle";
import type { DealInvoice } from "../../domain";
import { DrizzleDealInvoiceRepository } from "./DrizzleDealInvoiceRepository";

const isUuid = (id: string) => /^[0-9a-f-]{36}$/i.test(id);
const uuidList = (ids: string[]) => sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `);

/** Счета сделки в её жизни (слияние, удаление): поверх обычного хранилища счетов. */
export class DrizzleDealInvoiceLifecycleStore extends DrizzleDealInvoiceRepository implements DealInvoiceLifecycleStore {
  async lockAllFor(dealIds: string[]) {
    const ids = [...new Set(dealIds)].filter(isUuid).sort();
    if (!ids.length) return [];
    await executor().execute(sql`select id from deal_invoices where deal_id in (${uuidList(ids)}) order by (status = 'pending_payment'), id for update`);
    const out: DealInvoice[] = [];
    for (const id of ids) out.push(...(await this.listFor(id)));
    return out;
  }

  async moveDeal(from: string, to: string) {
    await executor().execute(sql`update deal_invoices set deal_id = ${to}, updated_at = now() where deal_id = ${from}`);
  }

  async deleteClosed(dealId: string) {
    await executor().execute(sql`delete from deal_invoices where deal_id = ${dealId} and status in ('cancelled', 'expired')`);
  }

  async withPendingKaspi(invoiceIds: string[]) {
    const ids = invoiceIds.filter(isUuid);
    if (!ids.length) return [];
    const { rows } = await executor().execute<{ id: string }>(sql`select distinct target_id::text as id from payment_invoices where target_kind = 'deal_invoice' and status = 'pending' and target_id in (${uuidList(ids)})`);
    return rows.map((r) => r.id);
  }
}
