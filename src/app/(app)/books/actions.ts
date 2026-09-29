"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createBook } from "@/lib/books";
import { isThemeId } from "@/lib/content/themes";

export interface CreateState {
  error?: string;
}

const schema = z.object({
  theme: z.string().refine(isThemeId, "Выберите, кому книга"),
  authorName: z.string().trim().min(1, "Укажите ваше имя").max(60),
  authorGender: z.enum(["m", "f"], { message: "Укажите, от чьего лица вы пишете" }),
  recipientName: z.string().trim().min(1, "Укажите имя получателя").max(60),
  recipientGender: z.enum(["m", "f"]).default("m"),
  title: z.string().trim().max(80).optional(),
});

export async function createBookAction(_: CreateState, form: FormData): Promise<CreateState> {
  const user = await requireUser();
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  const book = await createBook(user.id, {
    theme: d.theme as never,
    authorName: d.authorName,
    authorGender: d.authorGender,
    recipientName: d.recipientName,
    recipientGender: d.recipientGender,
    title: d.title,
  });
  redirect(`/books/${book.id}`);
}
