import { NextResponse } from "next/server";
import { idParams } from "@/server/input";
import { api, apiViewer } from "@/server/api";
import { container } from "@/server/container";

/**
 * Перевод книги на правила раскладки фото 2 перед первой правкой мест (редактор зовёт его сам, права — как у правки
 * фото, только черновик): в ответ — версия правил после него и все строки фото книги, чтобы редактор заменил свои.
 * Перевод не повторил вёрстку — версия прежняя, строки те же: правка идёт по правилам 1.
 */
export const POST = api(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = idParams(await params, "id");
  const { viewer } = await apiViewer(req, id);
  const authoring = container().authoring;
  const layoutRev = await authoring.photos.upgradeLayout(id, viewer);
  return NextResponse.json({ layoutRev, photos: await authoring.queries.photos(id) });
});
