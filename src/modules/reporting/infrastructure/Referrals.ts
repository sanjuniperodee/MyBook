import "server-only";
import { sql } from "drizzle-orm";
import { executor } from "@/shared/infrastructure/database";

export interface InvitedFriend {
  friendId: string | null;
  name: string;
  /** Заказ сайта или покупка из чата (сделка). */
  kind: "order" | "deal";
  refId: string;
  number: number;
  rewardCode: string | null;
  rewardUsed: boolean;
  at: Date;
}

export interface ClientReferralsData {
  code: { code: string; active: boolean } | null;
  friends: InvitedFriend[];
  invitedBy: { id: string; name: string } | null;
}

/**
 * Приглашения в карточке клиента (contacts-d7): его код для друзей, друзья, за чьи покупки он получил награду, и кто
 * пригласил его самого — по награде или по меткам первого визита (ссылка /r/<код>).
 */
export async function clientReferrals(clientId: string): Promise<ClientReferralsData> {
  const db = executor();
  const [code, friends, by] = await Promise.all([
    db.execute<{ code: string; active: boolean }>(sql`select p.code, p.active from promo_codes p where p.owner_user_id = ${clientId} order by p.created_at limit 1`),
    db.execute<{ friend_id: string | null; name: string; order_id: string | null; deal_id: string | null; number: number; code: string | null; used: boolean; at: Date }>(sql`
      select r.friend_id, coalesce(nullif(u.name, ''), nullif(d.contact_name, ''), '') as name, r.order_id, r.deal_id, r.order_number as number, r.code,
        coalesce((select p.used_count > 0 from promo_codes p where p.code = r.code), false) as used, r.created_at as at
      from referral_rewards r left join users u on u.id = r.friend_id left join crm_deals d on d.id = r.deal_id
      where r.referrer_id = ${clientId} order by r.created_at desc limit 50`),
    db.execute<{ id: string; name: string }>(sql`
      select o.id, o.name from (
        select r.referrer_id as owner_id, 0 as pri from referral_rewards r where r.friend_id = ${clientId}
        union all
        select p.owner_user_id, 1 from users c join promo_codes p on upper(p.code) = upper(c.source->>'campaign')
        where c.id = ${clientId} and c.source->>'source' = 'invite' and p.owner_user_id is not null
      ) x join users o on o.id = x.owner_id order by x.pri limit 1`),
  ]);
  return {
    code: code.rows[0] ?? null,
    friends: friends.rows.map((r): InvitedFriend => ({ friendId: r.friend_id, name: r.name, kind: r.order_id ? "order" : "deal", refId: (r.order_id ?? r.deal_id)!, number: r.number, rewardCode: r.code, rewardUsed: r.used, at: r.at })),
    invitedBy: by.rows[0] ?? null,
  };
}
