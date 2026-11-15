import { NextResponse } from "next/server";
import { z } from "zod";
import { MAX_LETTERS } from "@/modules/authoring/domain";
import { api, apiViewer } from "@/server/api";
import { container } from "@/server/container";
import { idParams, uuid } from "@/server/input";

/** Порядок писем близких (так они печатаются в конце книги): id в нужной очерёдности. */
export const PUT = api(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = idParams(await params, "id");
  const { viewer } = await apiViewer(req, id);
  const { ids } = z.object({ ids: z.array(uuid).max(MAX_LETTERS) }).strict().parse(await req.json());
  await container().authoring.letters.reorder(id, viewer, ids);
  return NextResponse.json({ ok: true });
});
