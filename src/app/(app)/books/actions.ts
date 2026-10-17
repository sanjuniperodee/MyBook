"use server";

import { getMessages, lredirect } from "@/i18n/server";
import { isLocale } from "@/i18n/config";
import { z } from "zod";
import { requireUser } from "@/server/auth";
import { container } from "@/server/container";
import { queueEvent } from "@/server/track";
import { isThemeId } from "@/lib/content/themes";
import { CHAPTER_TITLE_MAX, RECORDED_BY_MAX, bookKind, recipientPolicy } from "@/lib/content/kinds";
import { getOccasion } from "@/lib/occasions";

export interface CreateState {
  error?: string;
}

type WizardErrors = Awaited<ReturnType<typeof getMessages>>["books"]["wizard"]["errors"];
/**
 * Мастер новой книги. Получатель обязателен только у подарка (recipientPolicy): у автобиографии его нет,
 * у своей книги — по желанию. recordedBy — автобиография, firstChapterTitle — своя книга (пусто — по умолчанию темы).
 */
const schema = (e: WizardErrors) =>
  z
    .object({
      theme: z.string().refine(isThemeId, e.theme),
      language: z.string().refine(isLocale).default("ru"),
      authorName: z.string().trim().min(1, e.authorName).max(60),
      authorGender: z.enum(["m", "f"], { message: e.authorGender }),
      recipientName: z.string().trim().max(60).default(""),
      recipientGender: z.enum(["m", "f"]).default("m"),
      recordedBy: z.string().trim().max(RECORDED_BY_MAX).optional(),
      firstChapterTitle: z.string().trim().max(CHAPTER_TITLE_MAX).optional(),
      title: z.string().trim().max(80).optional(),
      occasion: z
        .string()
        .refine((v) => !v || !!getOccasion(v))
        .optional(),
      occasionDate: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).optional(),
    })
    .refine((d) => recipientPolicy(d.theme) !== "required" || d.recipientName.length > 0, { message: e.recipientName, path: ["recipientName"] });

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
    recordedBy: d.recordedBy,
    firstChapterTitle: d.firstChapterTitle,
    title: d.title,
    occasion: d.occasion || null,
    occasionDate: d.occasion ? d.occasionDate || null : null,
  });
  await queueEvent("book_created", undefined, { kind: bookKind(d.theme) });
  return lredirect(`/books/${book.id}`);
}
