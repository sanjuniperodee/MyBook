import { NextResponse } from "next/server";
import { z } from "zod";
import { CHAPTER_TITLE_MAX } from "@/lib/content/kinds";
import { idParams, uuid } from "@/server/input";
import { api, apiViewer } from "@/server/api";
import { container } from "@/server/container";

const schema = z
  .object({
    title: z.string().trim().max(CHAPTER_TITLE_MAX, "chapterTitleTooLong"),
    afterKey: uuid.nullish(),
  })
  .strict();

/** Своя книга: новая глава (после afterKey или в конец) с пустым разделом. Ответ — ключ главы, id раздела и оглавление. */
export const POST = api(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = idParams(await params, "id");
  const { viewer } = await apiViewer(req, id);
  const input = schema.parse(await req.json());
  return NextResponse.json(await container().authoring.outline.addChapter(id, viewer, input));
});
