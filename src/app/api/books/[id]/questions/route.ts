import { NextResponse } from "next/server";
import { z } from "zod";
import { idParams, uuid } from "@/server/input";
import { api, apiViewer } from "@/server/api";
import { container } from "@/server/container";

const schema = z.object({
  afterId: uuid,
  prompt: z.string().trim().min(3, "questionEmpty").max(200),
});

/** Добавляет собственный вопрос сразу после указанного, в ту же главу. */
export const POST = api(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = idParams(await params, "id");
  const { viewer } = await apiViewer(req);
  const { afterId, prompt } = schema.parse(await req.json());
  const authoring = container().authoring;
  const qid = await authoring.questions.addCustom(id, viewer, afterId, prompt);
  const question = (await authoring.queries.questions(id)).find((q) => q.id === qid);
  return NextResponse.json({ question });
});
