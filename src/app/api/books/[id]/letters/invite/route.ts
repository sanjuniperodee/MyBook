import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { api, apiBook } from "@/lib/api";
import { db } from "@/lib/db";
import { books } from "@/lib/db/schema";

/** Включает/выключает приём писем от близких по публичной ссылке. */
export const POST = api(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const { book } = await apiBook(req, id, { editable: true });
  const { enabled, regenerate } = z.object({ enabled: z.boolean(), regenerate: z.boolean().optional() }).parse(await req.json());
  const token = enabled ? (regenerate || !book.inviteToken ? randomBytes(12).toString("base64url") : book.inviteToken) : null;
  await db.update(books).set({ inviteToken: token }).where(eq(books.id, book.id));
  return NextResponse.json({ token });
});
