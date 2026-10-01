import { NextResponse } from "next/server";
import { z } from "zod";
import { api, apiViewer } from "@/server/api";
import { container } from "@/server/container";

const schema = z
  .object({
    answer: z.string().max(40_000, "answerTooLong"),
    displayText: z.string().trim().max(200).nullable(),
    hideHeading: z.boolean(),
  })
  .partial()
  .strict();

type Ctx = { params: Promise<{ id: string; qid: string }> };

/** Автосохранение ответа и заголовка вопроса. */
export const PATCH = api(async (req, { params }: Ctx) => {
  const { id, qid } = await params;
  const { viewer } = await apiViewer(req);
  await container().authoring.questions.edit(id, viewer, qid, schema.parse(await req.json()));
  return NextResponse.json({ ok: true, updatedAt: new Date() });
});

export const DELETE = api(async (req, { params }: Ctx) => {
  const { id, qid } = await params;
  const { viewer } = await apiViewer(req);
  await container().authoring.questions.deleteCustom(id, viewer, qid);
  return NextResponse.json({ ok: true });
});
