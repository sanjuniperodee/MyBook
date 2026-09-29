"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createBook } from "@/lib/books";
import { queueEvent } from "@/lib/track";
import { isThemeId } from "@/lib/content/themes";
import { getOccasion } from "@/lib/occasions";

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
  occasion: z.string().refine((v) => !v || !!getOccasion(v)).optional(),
  occasionDate: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).optional(),
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
    occasion: d.occasion || null,
    occasionDate: d.occasion ? d.occasionDate || null : null,
  });
  await queueEvent("book_created");
  redirect(`/books/${book.id}`);
}
