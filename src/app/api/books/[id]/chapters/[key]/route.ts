import { NextResponse } from "next/server";
import { z } from "zod";
import { CHAPTER_EPIGRAPH_MAX, CHAPTER_TITLE_MAX } from "@/lib/content/kinds";
import { idParams } from "@/server/input";
import { api, apiViewer } from "@/server/api";
import { container } from "@/server/container";

const schema = z
  .object({
    title: z.string().trim().max(CHAPTER_TITLE_MAX, "chapterTitleTooLong"),
    epigraph: z.string().trim().max(CHAPTER_EPIGRAPH_MAX),
  })
  .partial()
  .strict()
  .refine((p) => p.title !== undefined || p.epigraph !== undefined);

/** Ключ главы своей книги — uuid (параметр пути проверяется как id). */
type Ctx = { params: Promise<{ id: string; key: string }> };

/** Название и эпиграф главы своей книги. Ответ — актуальное оглавление. */
export const PATCH = api(async (req, { params }: Ctx) => {
  const { id, key } = idParams(await params, "id", "key");
  const { viewer } = await apiViewer(req, id);
  const outline = await container().authoring.outline.renameChapter(id, viewer, key, schema.parse(await req.json()));
  return NextResponse.json({ outline });
});

/** Глава удаляется вместе с разделами; фото разделов остаются в книге среди общих. Ответ — актуальное оглавление. */
export const DELETE = api(async (req, { params }: Ctx) => {
  const { id, key } = idParams(await params, "id", "key");
  const { viewer } = await apiViewer(req, id);
  const outline = await container().authoring.outline.deleteChapter(id, viewer, key);
  return NextResponse.json({ outline });
});
