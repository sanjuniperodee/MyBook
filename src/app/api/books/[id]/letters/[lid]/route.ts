import { NextResponse } from "next/server";
import { z } from "zod";
import { api, apiViewer } from "@/server/api";
import { container } from "@/server/container";

type Ctx = { params: Promise<{ id: string; lid: string }> };

const schema = z
  .object({
    status: z.enum(["pending", "approved", "hidden"]),
    authorName: z.string().trim().min(1).max(80),
    relation: z.string().trim().max(80),
    text: z.string().trim().min(1).max(8000),
  })
  .partial()
  .strict();

export const PATCH = api(async (req, { params }: Ctx) => {
  const { id, lid } = await params;
  const { viewer } = await apiViewer(req);
  const authoring = container().authoring;
  await authoring.letters.edit(id, viewer, lid, schema.parse(await req.json()));
  return NextResponse.json({ letter: (await authoring.queries.letters(id)).find((l) => l.id === lid) });
});

export const DELETE = api(async (req, { params }: Ctx) => {
  const { id, lid } = await params;
  const { viewer } = await apiViewer(req);
  await container().authoring.letters.delete(id, viewer, lid);
  return NextResponse.json({ ok: true });
});
