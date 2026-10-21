import { NextResponse } from "next/server";
import { z } from "zod";
import { pinChatAction } from "@/app/admin/chats/actions";
import { apiStaff } from "@/server/api";
import { idParams } from "@/server/input";
import { mobile } from "@/server/mobile-api";

export const dynamic = "force-dynamic";

/** Закрепить чат вверху списка или открепить ({ pinned }): закрепление личное, у каждого сотрудника своё. */
export const POST = mobile(async (req, { params }: { params: Promise<{ id: string }> }) => {
  await apiStaff(req, "chats.view");
  const { id } = idParams(await params, "id");
  const { pinned } = z.object({ pinned: z.boolean() }).parse(await req.json());
  return NextResponse.json(await pinChatAction(id, pinned));
});
