"use server";

import { getMessages, lredirect } from "@/i18n/server";
import { isLocale } from "@/i18n/config";
import { z } from "zod";
import { requireUser } from "@/server/auth";
import { container } from "@/server/container";
import { queueEvent } from "@/lib/track";
import { isThemeId } from "@/lib/content/themes";
import { getOccasion } from "@/lib/occasions";

export interface CreateState {
  error?: string;
}

type WizardErrors = Awaited<ReturnType<typeof getMessages>>["books"]["wizard"]["errors"];
const schema = (e: WizardErrors) =>
  z.object({
    theme: z.string().refine(isThemeId, e.theme),
    language: z.string().refine(isLocale).default("ru"),
    authorName: z.string().trim().min(1, e.authorName).max(60),
    authorGender: z.enum(["m", "f"], { message: e.authorGender }),
    recipientName: z.string().trim().min(1, e.recipientName).max(60),
    recipientGender: z.enum(["m", "f"]).default("m"),
    title: z.string().trim().max(80).optional(),
    occasion: z
      .string()
      .refine((v) => !v || !!getOccasion(v))
      .optional(),
    occasionDate: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).optional(),
  });

export async function createBookAction(_: CreateState, form: FormData): Promise<CreateState> {
  const user = await requireUser();
  const m = await getMessages();
  const parsed = schema(m.books.wizard.errors).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  const book = await container().authoring.books.start(user.id, {
    theme: d.theme,
    language: isLocale(d.language) ? d.language : "ru",
    authorName: d.authorName,
    authorGender: d.authorGender,
    recipientName: d.recipientName,
    recipientGender: d.recipientGender,
    title: d.title,
    occasion: d.occasion || null,
    occasionDate: d.occasion ? d.occasionDate || null : null,
  });
  await queueEvent("book_created");
  return lredirect(`/books/${book.id}`);
}
