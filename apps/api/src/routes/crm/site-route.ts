/**
 * Маршрут сайта с файлом (чек оплаты, возврата, к сделке) — из обработчика v1: те же поля формы и файл, тот же вход
 * (заголовок Authorization текущего запроса), та же логика денег. Ошибка — его ответ как есть, успех — его JSON.
 */
type SiteRoute = (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

export async function siteFileRoute(route: SiteRoute, req: Request, id: string, fields: Record<string, string | undefined>, file: Blob | undefined) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) if (v !== undefined && v !== "") form.set(k, v);
  if (file) form.set("file", file, (file as File).name || "receipt");
  const res = await route(new Request(req.url, { method: "POST", headers: { authorization: req.headers.get("authorization") ?? "" }, body: form }), { params: Promise.resolve({ id }) });
  return { res, data: res.ok ? ((await res.clone().json()) as Record<string, unknown>) : null };
}
