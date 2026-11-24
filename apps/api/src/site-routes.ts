/**
 * Маршруты сайта, которые обслуживает mybook-api (ADR 0012): те же модули маршрутов src/app/api — тот же код, права и
 * ответы; адреса те же. nginx направляет их сюда, при недоступности api — на сайт (upstream mybook_api_first).
 *   - вебхуки провайдеров (A6): без входа, формат задаёт провайдер, подпись проверяет маршрут;
 *   - JSON-маршруты страниц сайта (A5, душитель): по одному, начиная с самых частых; вход — cookie сайта.
 * Код маршрута пока живёт в src/app/api (его же обслуживает Next как запасной путь); перенос в apps/api — когда
 * сайт перестанет быть запасным.
 */
import * as kaspi from "@/app/api/payments/kaspi/webhook/route";
import * as cloudpayments from "@/app/api/payments/cloudpayments/[event]/route";
import * as gowa from "@/app/api/integrations/gowa/route";
import * as zadarma from "@/app/api/integrations/zadarma/route";
import * as google from "@/app/api/integrations/google/webhook/route";
import * as questionSave from "@/app/api/books/[id]/questions/[qid]/route";
import * as live from "@/app/api/admin/live/route";
import * as chatsInbox from "@/app/api/admin/chats/inbox/route";
import * as spell from "@/app/api/books/[id]/proofread/spell/route";
import * as build from "@/app/api/books/[id]/build/route";
import * as buildProgress from "@/app/api/books/[id]/build-progress/route";

/** Обработчик маршрута Next: второй аргумент — { params } своего вида у каждого маршрута. */
type RouteHandler = (req: Request, ctx: never) => Promise<Response> | Response;
type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
type RouteModule = Partial<Record<Method, RouteHandler>>;

/** Путь с параметрами в фигурных скобках → модуль маршрута сайта. */
const table: [string, RouteModule][] = [
  ["/api/payments/kaspi/webhook", kaspi as RouteModule],
  ["/api/payments/cloudpayments/{event}", cloudpayments as RouteModule],
  ["/api/integrations/gowa", gowa as RouteModule],
  ["/api/integrations/zadarma", zadarma as RouteModule],
  ["/api/integrations/google/webhook", google as RouteModule],
  // Автосохранение ответа и удаление своего раздела — самый частый маршрут редактора (~17 тыс. в сутки).
  ["/api/books/{id}/questions/{qid}", questionSave as RouteModule],
  // Частые JSON-маршруты (лог nginx 23–25.11): счётчики CRM (~9 тыс./сутки), орфография редактора (~3,5 тыс.),
  // входящие чатов, экранная сборка и её ход. Сборка и ход — вместе: ход живёт в памяти процесса, который начал
  // сборку, а приложение уже собирает через api (bookBuild).
  ["/api/admin/live", live as RouteModule],
  ["/api/admin/chats/inbox", chatsInbox as RouteModule],
  ["/api/books/{id}/proofread/spell", spell as RouteModule],
  ["/api/books/{id}/build", build as RouteModule],
  ["/api/books/{id}/build-progress", buildProgress as RouteModule],
];

const compiled = table.map(([path, module]) => ({ path, module, re: new RegExp(`^${path.replace(/\{(\w+)\}/g, "(?<$1>[^/]+)")}$`) }));

/** Адреса — для nginx и проверки выкатки. */
export const siteRoutePaths = table.map(([path]) => path);

/** Ответ маршрута сайта; null — это не его адрес. */
export async function handleSiteRoute(req: Request): Promise<Response | null> {
  const { pathname } = new URL(req.url);
  for (const { module, re } of compiled) {
    const m = re.exec(pathname);
    if (!m) continue;
    const handler = module[req.method as Method];
    if (!handler) return new Response(null, { status: 405, headers: { allow: Object.keys(module).filter((k) => /^(GET|POST|PUT|PATCH|DELETE)$/.test(k)).join(", ") } });
    return handler(req, { params: Promise.resolve({ ...m.groups }) } as never);
  }
  return null;
}
