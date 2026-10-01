import { NextResponse } from "next/server";
import { z } from "zod";
import { api, apiViewer } from "@/server/api";
import { container } from "@/server/container";

type Ctx = { params: Promise<{ id: string; pid: string }> };

const schema = z
  .object({
    caption: z.string().trim().max(200),
    layout: z.enum(["full", "bleed", "half"]),
    questionId: z.string().uuid().nullable(),
    inline: z
      .object({
        width: z.number().min(25).max(100),
        align: z.enum(["left", "center", "right"]),
        anchor: z.number().int().min(-1).max(10_000).nullable(),
        aspect: z.enum(["original", "1:1", "4:3", "3:4", "16:9"]),
        focusX: z.number().min(0).max(1),
        focusY: z.number().min(0).max(1),
        frame: z.enum(["none", "line", "polaroid", "round"]),
      })
      .strict()
      .nullable(),
  })
  .partial()
  .strict();

const row = async (bookId: string, photoId: string) => (await container().authoring.queries.photos(bookId)).find((p) => p.id === photoId);

export const PATCH = api(async (req, { params }: Ctx) => {
  const { id, pid } = await params;
  const { viewer } = await apiViewer(req);
  await container().authoring.photos.update(id, viewer, pid, schema.parse(await req.json()));
  return NextResponse.json({ photo: await row(id, pid) });
});

export const DELETE = api(async (req, { params }: Ctx) => {
  const { id, pid } = await params;
  const { viewer } = await apiViewer(req);
  await container().authoring.photos.delete(id, viewer, pid);
  return NextResponse.json({ ok: true });
});
