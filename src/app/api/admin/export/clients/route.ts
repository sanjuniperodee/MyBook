import { api, apiStaff } from "@/server/api";
import { audit } from "@/server/access";
import { clientSegments, type ClientSegment } from "@/modules/clients/domain/segments";
import { toCsv } from "@/lib/csv";
import { container } from "@/server/container";

export const GET = api(async (req) => {
  const staff = await apiStaff(req, "clients.view", "clients.export", "clients.contacts");
  await audit(staff, "export", "clients", null, Object.fromEntries(new URL(req.url).searchParams));
  const sp = new URL(req.url).searchParams;
  const segment = (sp.get("segment") && sp.get("segment")! in clientSegments ? sp.get("segment") : "all") as ClientSegment;
  const { rows } = await container().reporting.clients({ segment, q: sp.get("q") ?? undefined, tag: sp.get("tag") ?? undefined, sort: "new", limit: 50_000, offset: 0 });
  const csv = toCsv(
    ["Имя", "E-mail", "Телефон", "Теги", "Регистрация", "Последний визит", "Книг", "Лучший прогресс (ответов)", "Заказов", "LTV", "Последний заказ"],
    rows.map((r) => [r.user.name, r.user.email, r.user.phone, r.user.tags.join(", "), r.user.createdAt, r.user.lastSeenAt, r.booksCount, r.bestAnswered, r.ordersCount, r.ltv, r.lastOrderAt]),
  );
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="clients-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
});
