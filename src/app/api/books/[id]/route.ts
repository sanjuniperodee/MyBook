import { NextResponse } from "next/server";
import { z } from "zod";
import { api, apiViewer } from "@/server/api";
import { isLocale } from "@/i18n/config";
import { container } from "@/server/container";
import { MAX_EXTRA_PHOTOS } from "@/modules/authoring/domain/Book";

const patchSchema = z
  .object({
    title: z.string().trim().max(80),
    subtitle: z.string().trim().max(80),
    authorName: z.string().trim().max(60),
    authorGender: z.enum(["m", "f"]),
    recipientName: z.string().trim().max(60),
    recipientGender: z.enum(["m", "f"]),
    hideRecipientOnCover: z.boolean(),
    coverTemplate: z.string().max(40),
    coverPhotoId: z.string().uuid().nullable(),
    coverPhotoExtra: z.array(z.string().uuid()).max(MAX_EXTRA_PHOTOS),
    backText: z.string().trim().max(400),
    backLayout: z.string().max(20),
    backPhotoId: z.string().uuid().nullable(),
    backPhotoExtra: z.array(z.string().uuid()).max(MAX_EXTRA_PHOTOS),
    dedication: z.string().trim().max(600),
    interior: z.string().max(40),
    format: z.string().max(20),
    photoPlacement: z.enum(["chapters", "end"]),
    showToc: z.boolean(),
    occasion: z.string().max(40).nullable(),
    occasionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    language: z.string().refine(isLocale, "unknownLanguage"),
  })
  .partial()
  .strict();

/** Настройки книги из редактора. Каталоги обложек, оформлений и поводов проверяет домен. */
export const PATCH = api(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const { viewer } = await apiViewer(req);
  const { language, ...rest } = patchSchema.parse(await req.json());
  const authoring = container().authoring;
  await authoring.books.updateSettings(id, viewer, { ...rest, language: language && isLocale(language) ? language : undefined }, authoring.photoRepository);
  return NextResponse.json({ book: await authoring.queries.book(id) });
});

export const DELETE = api(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const { viewer } = await apiViewer(req);
  await container().authoring.books.delete(id, viewer);
  return NextResponse.json({ ok: true });
});
