import { NextResponse } from "next/server";
import { z } from "zod";
import { addNoteAction } from "@/app/admin/actions";
import { apiStaff } from "@/server/api";
import { idParams } from "@/server/input";
import { mobile } from "@/server/mobile-api";

export const dynamic = "force-dynamic";

/** Заметка в сделке. */
export const POST = mobile(async (req, { params }: { params: Promise<{ id: string }> }) => {
  await apiStaff(req, "deals.edit");
  const { id } = idParams(await params, "id");
  const { text } = z.object({ text: z.string().min(1).max(5000) }).parse(await req.json());
  const form = new FormData();
  form.set("dealId", id);
  form.set("text", text);
  const r = await addNoteAction({}, form);
  return NextResponse.json(r, { status: r.error ? 400 : 200 });
});
