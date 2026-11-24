/**
 * Обложка в API v1: настройки книги через тот же сервис, что у страницы обложки сайта (authoring.books.updateSettings),
 * каталог — тот же выбор (pickerCovers, без убранных), названия и миниатюры — те же функции, что у сайта.
 */
import type { z } from "zod";
import { COVER_TEXT_MAX, type Cover, type CoverTemplate } from "@mybook/contracts";
import { coverName } from "@/i18n/labels";
import { getLocale } from "@/i18n/server";
import { coverMoods, coverPhotoIds, coverPhotoSlots, getCoverTemplate, PICKER_SHOWN, pickerCovers, type CoverTemplate as Template } from "@/lib/book/covers";
import { BACK_PHOTO_SLOTS, backContent, backLayouts } from "@/lib/book/cover-back";
import { coverNames } from "@/lib/book/cover-names";
import { bookKind } from "@/lib/content/kinds";
import { getTheme } from "@/lib/content/themes";
import { isLocale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import { coverArtUrl } from "@/lib/urls";
import { isBookEditableBy, type BookRow, type BookViewer } from "@/modules/authoring";
import { apiBook } from "@/server/api";
import { container } from "@/server/container";
import { coverBackImagePath, coverImageVersion } from "@/server/cover-image";
import type { Handlers } from "../app";

const toTemplate = (t: Template, format: string, locale: "ru" | "kk"): z.output<typeof CoverTemplate> => ({
  id: t.id,
  name: coverName(t.id, locale),
  mood: t.mood,
  requiresPhoto: !!t.requiresPhoto,
  photoSlots: coverPhotoSlots(t),
  previewUrl: coverArtUrl(t, format, true),
});

const toCover = (b: BookRow, viewer: BookViewer): z.output<typeof Cover> => ({
  template: b.coverTemplate,
  lines: b.coverLines,
  title: b.title,
  subtitle: b.subtitle,
  namesOnCover: b.namesOnCover,
  hideRecipientOnCover: b.hideRecipientOnCover,
  authorName: b.authorName,
  recordedBy: b.recordedBy,
  recipientName: b.recipientName,
  kind: bookKind(b.theme),
  recipientLabel: getTheme(b.theme, isLocale(b.language) ? b.language : "ru").recipientLabel ?? null,
  autoNames: coverNames({ ...b, namesOnCover: "" }),
  year: backContent(b, [], new Date()).year ?? new Date().getFullYear(),
  photoIds: coverPhotoIds(b),
  backText: b.backText,
  backLayout: b.backLayout,
  backPhotoId: b.backPhotoId,
  hasDesign: b.coverDesign !== null,
  imageUrl: `/api/books/${b.id}/cover-image?v=${coverImageVersion(b)}`,
  backImageUrl: coverBackImagePath(b),
  editable: b.status === "draft" && isBookEditableBy(b.userId, viewer),
});

async function view(book: BookRow, viewer: BookViewer) {
  const locale = (await getLocale()) === "kk" ? "kk" : "ru";
  const m = messagesFor(locale);
  const moods = m.catalog.moods;
  const t = m.books.cover;
  const tb = t.back;
  const cover = toCover(book, viewer);
  const templates = pickerCovers().filter((x) => !x.hidden).map((x) => toTemplate(x, book.format, locale));
  const slots = coverPhotoSlots(getCoverTemplate(book.coverTemplate));
  const kind = cover.kind;
  const names = cover.namesOnCover.trim() || cover.autoNames;
  const author = book.authorName.trim();
  return {
    cover,
    templates,
    moods: [{ id: "all", label: moods.all }, ...coverMoods.map((id) => ({ id, label: moods[id] }))],
    // Варианты оборота — те же, что у сайта (BackSection): подписи и подсказки по виду книги, число фото — BACK_PHOTO_SLOTS.
    backLayouts: backLayouts.map((id) => {
      const photos = BACK_PHOTO_SLOTS[id] ?? 0;
      const text = id !== "minimal";
      return {
        id,
        name: tb.layouts[id].name,
        hint: tb.layouts[id].hint,
        label: text ? tb.label[id as keyof typeof tb.label] : null,
        placeholder: text ? ((kind !== "gift" ? tb.placeholderByKind[kind]?.[id] : undefined) ?? tb.placeholder[id as keyof typeof tb.placeholder]) : null,
        note: text ? null : tb.minimalNote(names || tb.namesFallback[kind], cover.year),
        photos,
        photosLabel: photos ? (photos > 1 ? tb.photosPick(photos) : tb.photo) : null,
      };
    }),
    limits: { ...COVER_TEXT_MAX },
    labels: {
      title: t.title,
      saving: m.common.actions.saving,
      sides: { front: t.side.front, back: t.side.back },
      tabs: { designs: m.design.ui.studio.cover.tabs.designs, photo: m.design.ui.studio.cover.tabs.photo, text: m.design.ui.studio.cover.tabs.text, variant: m.design.ui.studio.cover.tabs.variant },
      variants: m.common.count.variants(templates.length),
      shown: PICKER_SHOWN,
      showAll: t.showAllDesigns(templates.length),
      onCover: t.onCover,
      designActive: m.design.cover.active.text,
      readonly: m.design.cover.readonly,
      photo: { title: slots > 1 ? t.photos(slots) : t.photo, slots: Array.from({ length: slots }, (_, i) => t.frame.slot(i + 1)), slotsHint: t.photoSlotsHint, uploadFirst: t.uploadFirst, note: m.books.coverPhotos.note },
      text: {
        bookTitle: t.bookTitle,
        subtitle: t.subtitle,
        subtitlePlaceholder: t.subtitlePlaceholder,
        author: kind === "autobiography" ? t.narratorName : t.authorName,
        recordedBy: t.recordedBy,
        recordedByPlaceholder: t.recordedByPlaceholder,
        recipientNone: t.recipientNone,
        hideRecipient: t.hideRecipient,
        namesOnCover: t.namesOnCover,
        namesOnCoverText: t.namesOnCoverText,
        coverLines: t.coverLines,
        coverLinesHint: t.coverLinesHint,
      },
      back: { title: tb.title, text: tb.text, noPhotos: tb.noPhotos, signed: author ? tb.signed(author) : null },
    },
  };
}

export const coverHandlers: Pick<Handlers, "coverGet" | "coverUpdate"> = {
  async coverGet({ req, input }) {
    const { book, viewer } = await apiBook(req, input.bookId);
    return view(book, viewer);
  },

  async coverUpdate({ req, input }) {
    const { viewer } = await apiBook(req, input.bookId, { editable: true });
    const authoring = container().authoring;
    await authoring.books.updateSettings(input.bookId, viewer, input.body, authoring.photoRepository);
    const book = await authoring.queries.book(input.bookId);
    return view(book!, viewer);
  },
};
