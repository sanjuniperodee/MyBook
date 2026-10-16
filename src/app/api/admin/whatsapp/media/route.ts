import { z } from "zod";
import { api, apiStaff, HttpError } from "@/server/api";
import { container } from "@/server/container";
import { isGowaMediaPath } from "@/modules/messaging/domain/gowa";

/** statics/media/<файл> или вложенный statics/media/<номер>/<дата>/<файл> — проверка по сегментам, без «..». */
const path = z.string().refine(isGowaMediaPath);

/** Вложение из WhatsApp (фото, голосовое, файл), скачанное шлюзом GOWA, — только сотрудникам с доступом к переписке. */
export const GET = api(async (req) => {
  await apiStaff(req, "chats.view");
  const parsed = path.safeParse(new URL(req.url).searchParams.get("path"));
  if (!parsed.success) throw new HttpError(404, "notFound");
  const file = await container().messaging.gowa.media(parsed.data).catch(() => null);
  if (!file) throw new HttpError(404, "notFound");
  return new Response(file.body, {
    headers: {
      "Content-Type": file.headers.get("content-type") ?? "application/octet-stream",
      "Cache-Control": "private, max-age=86400",
      "X-Content-Type-Options": "nosniff",
      // Файл от клиента: открываем как загрузку, а не страницу сайта (HTML/SVG внутри не исполнятся).
      "Content-Security-Policy": "sandbox",
    },
  });
});
