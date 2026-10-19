import { NextResponse } from "next/server";
import { z } from "zod";
import { MAX_QUESTIONS } from "@/modules/authoring/domain/Question";
import { idParams, uuid } from "@/server/input";
import { api, apiViewer } from "@/server/api";
import { container } from "@/server/container";

const schema = z.object({ sections: z.array(z.object({ id: uuid, chapter: uuid }).strict()).max(MAX_QUESTIONS) }).strict();

/**
 * Полный порядок разделов своей книги с их главами (перенос раздела выше, ниже и в другую главу): тот же набор id
 * и существующие главы, иначе 409 outlineOutdated. Ответ — актуальное оглавление.
 */
export const PUT = api(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = idParams(await params, "id");
  const { viewer } = await apiViewer(req);
  const { sections } = schema.parse(await req.json());
  const outline = await container().authoring.outline.reorderSections(id, viewer, sections);
  return NextResponse.json({ outline });
});
