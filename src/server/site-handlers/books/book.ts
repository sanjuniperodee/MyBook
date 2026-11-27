import "server-only";
import { z } from "zod";
import { CoverFields } from "@mybook/contracts";
import { PAGES_TEXT_MAX } from "@mybook/contracts/limits";
import { idParams } from "@/server/input";
import { api, apiViewer } from "@/server/api";
import { isLocale } from "@/i18n/config";
import { container } from "@/server/container";
import { INVITE_TEXT_MAX } from "@/lib/content/letter-invite";
import { END_TEXT_MAX } from "@/lib/book/end-page";
import { CHAPTER_STARTS } from "@/lib/book/chapter-head";
import { TOC_EPIGRAPH_MAX, TOC_LINES_MAX, TOC_MODES, TOC_TITLE_MAX } from "@/lib/book/toc";

const patchSchema = z
  .object({
    // Поля обложки — из контракта API v1 (CoverFields): те же, что у PATCH /api/v1/books/{id}/cover.
    ...CoverFields.shape,
    authorGender: z.enum(["m", "f"]),
    recipientGender: z.enum(["m", "f"]),
    // Кадры фото на обложке: форму и числа проверяет домен (parseFrames), здесь — только размер.
    photoFrames: z.record(z.string().max(12), z.object({ zoom: z.number(), x: z.number(), y: z.number() })).refine((o) => Object.keys(o).length <= 12),
    dedication: z.string().trim().max(PAGES_TEXT_MAX.dedication),
    interior: z.string().max(40),
    // Настройки дизайнера страниц и обложка из слоёв: поля и числа проверяет домен (parseInteriorStyle, parseCoverDesign),
    // здесь — только что это объект разумного размера.
    // Свои рисунки ИИ-дизайнера (эмблема страниц, слои-рисунки обложки) — самая тяжёлая часть: потолки выше прежних.
    interiorStyle: z.record(z.string(), z.unknown()).refine((o) => JSON.stringify(o).length <= 56_000, "tooLarge"),
    coverDesign: z
      .record(z.string(), z.unknown())
      .nullable()
      .refine((o) => o === null || JSON.stringify(o).length <= 150_000, "tooLarge"),
    coverBack: z
      .record(z.string(), z.unknown())
      .nullable()
      .refine((o) => o === null || JSON.stringify(o).length <= 150_000, "tooLarge"),
    format: z.string().max(20),
    photoPlacement: z.enum(["chapters", "end", "none"]),
    showToc: z.boolean(),
    // «Глава всегда с левой страницы» (books.pagination_rev 2 / 1).
    openersLeft: z.boolean(),
    // Как начинается глава: своя страница, название над текстом или чистый лист.
    chapterStart: z.enum(CHAPTER_STARTS),
    // Печатать титульный лист (books.title_page).
    titlePage: z.boolean(),
    tocMode: z.enum(TOC_MODES),
    // Строки оглавления: вид ключей и длину названий проверяет домен (parseTocLines), здесь — только размер.
    // noOpenerPhoto — «глава без фото» (решение автора для редактора, в вёрстку не идёт).
    tocLines: z
      .record(z.string().max(90), z.object({ title: z.string().max(TOC_TITLE_MAX).optional(), hidden: z.boolean().optional(), epigraph: z.string().max(TOC_EPIGRAPH_MAX).optional(), noOpenerPhoto: z.boolean().optional() }))
      .refine((o) => Object.keys(o).length <= TOC_LINES_MAX),
    // Свой текст приглашения близких (страница письма и сообщение со ссылкой); пусто — по умолчанию.
    inviteText: z.string().trim().max(INVITE_TEXT_MAX),
    // Фраза последней страницы: null — «Продолжение следует…», пусто — без фразы.
    endText: z.string().trim().max(END_TEXT_MAX).nullable(),
    occasion: z.string().max(40).nullable(),
    occasionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    language: z.string().refine(isLocale, "unknownLanguage"),
  })
  .partial()
  .strict();

/** Настройки книги из редактора. Каталоги обложек, оформлений и поводов проверяет домен. */
export const PATCH = api(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = idParams(await params, "id");
  const { viewer } = await apiViewer(req, id);
  const { language, ...rest } = patchSchema.parse(await req.json());
  const authoring = container().authoring;
  await authoring.books.updateSettings(id, viewer, { ...rest, language: language && isLocale(language) ? language : undefined }, authoring.photoRepository);
  return Response.json({ book: await authoring.queries.book(id) });
});

export const DELETE = api(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = idParams(await params, "id");
  const { viewer } = await apiViewer(req, id);
  await container().authoring.books.delete(id, viewer);
  return Response.json({ ok: true });
});
