import { NextResponse } from "next/server";
import { z } from "zod";
import { idParams, uuid } from "@/server/input";
import { api, apiViewer } from "@/server/api";
import { isLocale } from "@/i18n/config";
import { container } from "@/server/container";
import { MAX_EXTRA_PHOTOS } from "@/modules/authoring/domain/Book";
import { NAMES_ON_COVER_MAX } from "@/lib/book/cover-names";
import { RECORDED_BY_MAX } from "@/lib/content/kinds";
import { TOC_LINES_MAX, TOC_MODES, TOC_TITLE_MAX } from "@/lib/book/toc";

const patchSchema = z
  .object({
    title: z.string().trim().max(80),
    subtitle: z.string().trim().max(80),
    authorName: z.string().trim().max(60),
    authorGender: z.enum(["m", "f"]),
    // Автобиография: кто записал со слов рассказчика (у остальных книг домен поле пропускает).
    recordedBy: z.string().trim().max(RECORDED_BY_MAX),
    recipientName: z.string().trim().max(60),
    recipientGender: z.enum(["m", "f"]),
    hideRecipientOnCover: z.boolean(),
    namesOnCover: z.string().trim().max(NAMES_ON_COVER_MAX),
    coverTemplate: z.string().max(40),
    coverPhotoId: uuid.nullable(),
    coverPhotoExtra: z.array(uuid).max(MAX_EXTRA_PHOTOS),
    backText: z.string().trim().max(400),
    backLayout: z.string().max(20),
    backPhotoId: uuid.nullable(),
    backPhotoExtra: z.array(uuid).max(MAX_EXTRA_PHOTOS),
    // Кадры фото на обложке: форму и числа проверяет домен (parseFrames), здесь — только размер.
    photoFrames: z.record(z.string().max(12), z.object({ zoom: z.number(), x: z.number(), y: z.number() })).refine((o) => Object.keys(o).length <= 12),
    dedication: z.string().trim().max(600),
    interior: z.string().max(40),
    format: z.string().max(20),
    photoPlacement: z.enum(["chapters", "end"]),
    showToc: z.boolean(),
    tocMode: z.enum(TOC_MODES),
    // Строки оглавления: вид ключей и длину названий проверяет домен (parseTocLines), здесь — только размер.
    tocLines: z
      .record(z.string().max(90), z.object({ title: z.string().max(TOC_TITLE_MAX).optional(), hidden: z.boolean().optional() }))
      .refine((o) => Object.keys(o).length <= TOC_LINES_MAX),
    occasion: z.string().max(40).nullable(),
    occasionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    language: z.string().refine(isLocale, "unknownLanguage"),
  })
  .partial()
  .strict();

/** Настройки книги из редактора. Каталоги обложек, оформлений и поводов проверяет домен. */
export const PATCH = api(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = idParams(await params, "id");
  const { viewer } = await apiViewer(req);
  const { language, ...rest } = patchSchema.parse(await req.json());
  const authoring = container().authoring;
  await authoring.books.updateSettings(id, viewer, { ...rest, language: language && isLocale(language) ? language : undefined }, authoring.photoRepository);
  return NextResponse.json({ book: await authoring.queries.book(id) });
});

export const DELETE = api(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = idParams(await params, "id");
  const { viewer } = await apiViewer(req);
  await container().authoring.books.delete(id, viewer);
  return NextResponse.json({ ok: true });
});
