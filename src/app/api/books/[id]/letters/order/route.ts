import { LettersOrder } from "@mybook/contracts";
import { NextResponse } from "next/server";
import { api, apiViewer } from "@/server/api";
import { container } from "@/server/container";
import { idParams } from "@/server/input";

/** Порядок писем близких (так они печатаются в конце книги): id в нужной очерёдности. Схема — из контракта API v1 (LettersOrder). */
export const PUT = api(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = idParams(await params, "id");
  const { viewer } = await apiViewer(req, id);
  const { ids } = LettersOrder.parse(await req.json());
  await container().authoring.letters.reorder(id, viewer, ids);
  return NextResponse.json({ ok: true });
});
