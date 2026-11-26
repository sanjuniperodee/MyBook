import "server-only";
import { z } from "zod";
import { can, canSeeAssigned } from "@/server/access";
import { container } from "@/server/container";
import { uuid } from "@/server/input";
import { op } from "./op";

/** Сборщики страниц клиентов CRM (ADR 0012, A5 — Раздел 5): список с сегментами и карточка клиента. */
const opt = (max: number) => z.string().max(max).optional();

export const reads = {
  "clients.list": op(
    ["clients.view"],
    z.object({
      segment: z.string().max(40),
      q: opt(200),
      tag: opt(100),
      sort: z.string().max(20),
      ch: opt(60),
      page: z.number().int().min(1).max(100_000),
      size: z.number().int().min(1).max(500),
      onlyMine: z.boolean(),
      filters: z.record(z.string(), z.unknown()),
    }),
    async ({ segment, q, tag, sort, ch, page, size, onlyMine, filters }, staff) => {
      const { clientFiltersFrom } = await import("@/modules/reporting/ui/clientFilters");
      // Роль «только свои» видит своих клиентов и неразобранных (без ответственного).
      const scopeManagerId = staff.scope === "own" ? staff.user.id : null;
      const reporting = container().reporting;
      type Args = Parameters<typeof reporting.clients>[0];
      const [list, counts, admins, phoneHolder] = await Promise.all([
        reporting.clients({
          segment: segment as Args["segment"],
          q,
          tag,
          sort: sort as Args["sort"],
          channel: ch,
          limit: size,
          offset: (page - 1) * size,
          scopeManagerId: scopeManagerId ?? (onlyMine ? staff.user.id : null),
          onlyMine,
          filters: clientFiltersFrom((k) => (typeof filters[k] === "string" ? (filters[k] as string) : undefined)),
        }),
        reporting.segmentCounts(scopeManagerId),
        container().access.queries.allStaff(),
        container().messaging.phoneHolder(),
      ]);
      return { ...list, counts, admins, phoneHolder };
    },
  ),

  "clients.card": op(["clients.view"], z.object({ id: uuid }), async ({ id }, staff) => {
    const { listFields } = await import("@/modules/workspace");
    const client = await container().reporting.clientById(id);
    if (!client || !canSeeAssigned(staff, client.managerId)) return null;
    const [card, admins, clientFields, noMarketing, referrals] = await Promise.all([
      container().reporting.clientCard(id, { deals: can(staff, "deals.view") }),
      container().access.queries.allStaff(),
      listFields("client"),
      container().messaging.chats.noMarketingFor({ clientId: client.id, phones: [client.phone, ...client.extraPhones] }),
      container().reporting.clientReferrals(id),
    ]);
    return { client, card, admins, clientFields, noMarketing, referrals };
  }),
};
