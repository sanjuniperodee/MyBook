import { NextResponse } from "next/server";
import { z } from "zod";
import { api, apiBook, HttpError } from "@/server/api";
import { rateLimit } from "@/server/rateLimit";
import { misspelled } from "@/server/spell";

const schema = z.object({ words: z.array(z.string().min(2).max(40)).max(300) });

/** Орфография по словарю: какие из слов ответа написаны с ошибкой и как их исправить (русские книги). */
export const POST = api(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const { user, book } = await apiBook(req, id);
  if (!(await rateLimit(`spell:${user.id}`, 120, 60_000))) throw new HttpError(429, "proofreadRate");
  const { words } = schema.parse(await req.json());
  if (book.language !== "ru") return NextResponse.json({ wrong: {} });
  return NextResponse.json({ wrong: await misspelled(words) });
});
