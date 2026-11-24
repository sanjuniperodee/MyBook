import { container } from "@/server/container";

export const dynamic = "force-dynamic";

/**
 * Личная iCal-лента сотрудника (/api/calendar/<токен>.ics): подписка в Google, Apple или Outlook Календаре, только
 * чтение. В событиях — название карточки и ссылка на неё, без данных клиента. Отозванная ссылка — 404.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token.replace(/\.ics$/i, "");
  const ics = await container().boards.calendar.feed(token);
  if (!ics) return new Response("Not found", { status: 404 });
  return new Response(ics, { headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "private, max-age=300", "Content-Disposition": 'inline; filename="mybooks-crm.ics"' } });
}
