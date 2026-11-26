import { api, apiStaff, HttpError } from "@/server/api";
import { container } from "@/server/container";

/** Файл подборки — превью в настройках бота. */
export const GET = api(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  await apiStaff(req, "settings.manage");
  const { id } = await params;
  const file = await container().messaging.materialFile(id.slice(0, 40));
  if (!file) throw new HttpError(404, "notFound");
  const { data, material: m } = file;
  return new Response(new Uint8Array(data), { headers: { "Content-Type": m.mime, "Cache-Control": "private, max-age=3600", "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(m.name)}` } });
});
