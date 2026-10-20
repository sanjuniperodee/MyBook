import { NextResponse } from "next/server";
import { z } from "zod";
import { MAX_CHAPTERS } from "@/lib/content/kinds";
import { idParams, uuid } from "@/server/input";
import { api, apiViewer } from "@/server/api";
import { container } from "@/server/container";

/** Полный порядок глав своей книги: тот же набор ключей (иначе 409 outlineOutdated). Ответ — актуальное оглавление. */
export const PUT = api(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = idParams(await params, "id");
  const { viewer } = await apiViewer(req, id);
  const { keys } = z.object({ keys: z.array(uuid).max(MAX_CHAPTERS) }).strict().parse(await req.json());
  const outline = await container().authoring.outline.reorderChapters(id, viewer, keys);
  return NextResponse.json({ outline });
});
