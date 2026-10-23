import "server-only";
import { sql } from "drizzle-orm";
import { executor } from "@/shared/infrastructure/database";
import type { FriendPurchases } from "../application";

/**
 * Покупки из чата глазами приглашений — антикоррупционный слой над сделками (Sales) и метками клиента (Identity):
 * код-приглашение — из меток сделки или первого визита клиента, если источник — приглашение (source=invite).
 */
export const drizzleFriendPurchases: FriendPurchases = {
  async deal(dealId) {
    const r = await executor().execute<{ number: number; name: string; client_id: string | null; invite_code: string | null; repeat: boolean }>(sql`
      select d.number, coalesce(nullif(d.contact_name, ''), u.name, '') as name, d.client_id, d.repeat_count > 0 as repeat,
        coalesce(
          case when d.utm->>'source' = 'invite' then nullif(d.utm->>'campaign', '') end,
          case when u.source->>'source' = 'invite' then nullif(u.source->>'campaign', '') end
        ) as invite_code
      from crm_deals d left join users u on u.id = d.client_id
      where d.id = ${dealId}`);
    const row = r.rows[0];
    return row ? { number: row.number, name: row.name, clientId: row.client_id, inviteCode: row.invite_code, repeat: row.repeat } : null;
  },
};
