import { NextResponse } from "next/server";
import { z } from "zod";
import { api, apiViewer } from "@/server/api";
import { container } from "@/server/container";
import { idParams, uuid } from "@/server/input";

/** Ключ главы темы: латиница и цифры (у своей книги главы — uuid, но там перенос идёт через оглавление). */
const schema = z.object({ chapter: z.string().regex(/^[\w-]{1,80}$/), beforeId: uuid.nullable().optional() }).strict();

/** Перенос истории в другую главу или на другое место (книги с темой; «Страницы» → «Главы книги»). */
export const POST = api(async (req, { params }: { params: Promise<{ id: string; qid: string }> }) => {
  const { id, qid } = idParams(await params, "id", "qid");
  const { viewer } = await apiViewer(req, id);
  const input = schema.parse(await req.json());
  await container().authoring.questions.moveStory(id, viewer, { id: qid, ...input });
  return NextResponse.json({ ok: true });
});
