import { z } from "zod";
import { COVER_TEXT_MAX } from "@mybook/contracts";
import { isLocale } from "@/i18n/config";
import type { getMessages } from "@/i18n/server";
import { isThemeId } from "@/lib/content/themes";
import { bookKind, CHAPTER_TITLE_MAX, RECORDED_BY_MAX, recipientPolicy } from "@/lib/content/kinds";
import { getOccasion } from "@/lib/occasions";

type WizardErrors = Awaited<ReturnType<typeof getMessages>>["books"]["wizard"]["errors"];

export const DEDICATION_MAX = 600;

/**
 * Мастер новой книги. Правила — по виду книги (recipientPolicy):
 * - подарок: получатель обязателен, род получателя принимается;
 * - автобиография: получателя нет (имя сбрасывается), recordedBy и dedication («кому посвящаете») — только у неё;
 * - своя книга: получатель по желанию, название обязательно, firstChapterTitle — только у неё (пусто — по умолчанию темы).
 * Род получателя принимается только у подарка — у остальных видов в книгу пишется «m».
 */
export const createBookSchema = (e: WizardErrors) =>
  z
    .object({
      theme: z.string().refine(isThemeId, e.theme),
      language: z.string().refine(isLocale).default("ru"),
      authorName: z.string().trim().min(1, e.authorName).max(COVER_TEXT_MAX.authorName),
      authorGender: z.enum(["m", "f"], { message: e.authorGender }),
      recipientName: z.string().trim().max(COVER_TEXT_MAX.recipientName).default(""),
      recipientGender: z.enum(["m", "f"]).default("m"),
      recordedBy: z.string().trim().max(RECORDED_BY_MAX).default(""),
      firstChapterTitle: z.string().trim().max(CHAPTER_TITLE_MAX).default(""),
      dedication: z.string().trim().max(DEDICATION_MAX).default(""),
      title: z.string().trim().max(COVER_TEXT_MAX.title).default(""),
      occasion: z
        .string()
        .refine((v) => !v || !!getOccasion(v))
        .optional(),
      occasionDate: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).optional(),
    })
    .superRefine((d, ctx) => {
      const policy = recipientPolicy(d.theme);
      if (policy === "required" && !d.recipientName) ctx.addIssue({ code: "custom", message: e.recipientName, path: ["recipientName"] });
      if (bookKind(d.theme) === "blank" && !d.title) ctx.addIssue({ code: "custom", message: e.title, path: ["title"] });
    })
    .transform((d) => {
      const kind = bookKind(d.theme);
      const policy = recipientPolicy(d.theme);
      return {
        ...d,
        recipientName: policy === "none" ? "" : d.recipientName,
        recipientGender: policy === "required" ? d.recipientGender : ("m" as const),
        recordedBy: kind === "autobiography" ? d.recordedBy : "",
        dedication: kind === "autobiography" ? d.dedication : "",
        firstChapterTitle: kind === "blank" ? d.firstChapterTitle : "",
      };
    });

/** Разобранные данные мастера → вход BookService.start (общий для server action сайта и API v1). */
export function startBookInput(d: z.output<ReturnType<typeof createBookSchema>>) {
  return {
    theme: d.theme,
    language: isLocale(d.language) ? d.language : ("ru" as const),
    authorName: d.authorName,
    authorGender: d.authorGender,
    recipientName: d.recipientName,
    recipientGender: d.recipientGender,
    recordedBy: d.recordedBy,
    firstChapterTitle: d.firstChapterTitle,
    dedication: d.dedication,
    title: d.title,
    occasion: d.occasion || null,
    occasionDate: d.occasion ? d.occasionDate || null : null,
  };
}
