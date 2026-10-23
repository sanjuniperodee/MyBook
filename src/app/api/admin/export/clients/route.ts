import { api, apiStaff } from "@/server/api";
import { audit } from "@/server/access";
import { clientSegments, type ClientSegment } from "@/shared/domain/segments";
import { toCsv } from "@/lib/csv";
import { container } from "@/server/container";
import { clientFiltersFrom } from "@/modules/reporting";
import { channelLabel, toAttribution } from "@/shared/domain/channels";
import { staffLabel } from "@/shared/domain/staff";
import { messagesFor } from "@/i18n/messages";

const occasions = messagesFor("ru").common.occasions as Record<string, { label: string }>;

export const GET = api(async (req) => {
  const staff = await apiStaff(req, "clients.view", "clients.export", "clients.contacts");
  await audit(staff, "export", "clients", null, Object.fromEntries(new URL(req.url).searchParams));
  const sp = new URL(req.url).searchParams;
  const segment = (sp.get("segment") && sp.get("segment")! in clientSegments ? sp.get("segment") : "all") as ClientSegment;
  // Как список клиентов: роль «только свои» выгружает своих и неразобранных, а не весь магазин.
  const scopeManagerId = staff.scope === "own" ? staff.user.id : null;
  const { rows } = await container().reporting.clients({ segment, q: sp.get("q") ?? undefined, tag: sp.get("tag") ?? undefined, sort: "new", limit: 50_000, offset: 0, scopeManagerId, filters: clientFiltersFrom((k) => sp.get(k)) });
  // Ответственный, канал, повод и дата последней книги (contacts-10) — для сегментов в таблице.
  const names = new Map((rows.length ? await container().access.queries.allStaff() : []).map((a) => [a.id, staffLabel(a)]));
  const csv = toCsv(
    ["Имя", "E-mail", "Телефон", "Теги", "Регистрация", "Последний визит", "Книг", "Лучший прогресс (ответов)", "Заказов", "LTV", "Последний заказ", "Ответственный", "Канал", "Повод", "Последняя книга"],
    rows.map((r) => [
      r.user.name,
      r.user.email,
      r.user.phone,
      r.user.tags.join(", "),
      r.user.createdAt,
      r.user.lastSeenAt,
      r.booksCount,
      r.bestAnswered,
      r.ordersCount,
      r.ltv,
      r.lastOrderAt,
      r.user.managerId ? (names.get(r.user.managerId) ?? "") : "",
      channelLabel(toAttribution(r.user.source)),
      r.occasion ? (occasions[r.occasion]?.label ?? r.occasion) : "",
      r.lastBookUpdate,
    ]),
  );
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="clients-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
});
