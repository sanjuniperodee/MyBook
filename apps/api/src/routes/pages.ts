/**
 * «Страницы» книги в API v1 (контракт packages/contracts/src/v1/pages.ts): то же, что PagesEditor сайта, — стиль,
 * пары шрифтов, посвящение, оглавление, последняя страница, — через тот же сервис настроек книги и те же каталоги.
 * Развороты — картинки вёрстки печати (src/server/pages-image.ts, /api/books/{id}/pages-image).
 */
import type { z } from "zod";
import { PAGES_TEXT_MAX, type PagesView } from "@mybook/contracts";
import { coverName } from "@/i18n/labels";
import { messagesFor } from "@/i18n/messages";
import { bookMessagesFor } from "@/i18n/messages/partial";
import { getLocale } from "@/i18n/server";
import { fontFile, type FontKey } from "@/lib/book/fonts";
import { getFormat } from "@/lib/book/formats";
import {
  getInteriorDesign,
  interiorDesigns,
  interiorDirection,
  interiorsForCover,
  isInteriorId,
  parseInteriorStyle,
  styleDirections,
  type FontPick,
  type InteriorStyle,
} from "@/lib/book/interiors";
import { fontPairs } from "@/lib/book/interiors/studio-presets";
import {
  countCustom,
  patchSection,
  resetStyle,
} from "@/lib/book/interiors/style-edit";
import { bookKind } from "@/lib/content/kinds";
import {
  PAGES_IMAGE_WIDTHS,
  PAGES_SPREADS,
  pagesVersion,
} from "@/modules/production";
import {
  isBookEditableBy,
  type BookRow,
  type BookViewer,
} from "@/modules/authoring";
import { apiBook, HttpError } from "@/server/api";
import { container } from "@/server/container";
import { pagesSampleOf, pagesSpreadsOf } from "@/server/pages-image";
import type { Handlers } from "../app";

type View = z.infer<typeof PagesView>;

/** Сколько стилей во «Всех» до «Показать все» — как STYLES_SHOWN у StylesTab сайта. */
const STYLES_SHOWN = 8;

const face = (pick: FontPick) => {
  const f = fontFile(pick.font as FontKey, pick.weight ?? 400, !!pick.italic);
  return {
    family: pick.font,
    weight: f.weight,
    italic: f.style === "italic",
    url: `/api/fonts/${f.file}`,
  };
};

async function view(book: BookRow, viewer: BookViewer): Promise<View> {
  const locale = await getLocale();
  const m = messagesFor(locale);
  const t = m.books.pages;
  const sx = m.design.ui.studio.pages;
  const dt = m.design.pages;
  const pp = m.books.pagesPhotos;
  const names = m.catalog.interiors;
  const dirNames = m.catalog.interiorDirections;
  const kind = bookKind(book.theme);
  const dedicationHint = t.dedicationByKind[kind] ?? {
    text: t.dedicationText,
    placeholder: t.dedicationPlaceholder,
  };
  const style = parseInteriorStyle(book.interiorStyle) as InteriorStyle;
  const interior = getInteriorDesign(book.interior).id;

  const sample = await pagesSampleOf(book.id);
  if (!sample) throw new HttpError(404, "bookNotFound");
  const v = pagesVersion(sample);
  const base = `/api/books/${book.id}/pages-image`;
  const kinds = pagesSpreadsOf(sample);
  const format = getFormat(book.format);

  const pairs = new Set(interiorsForCover(book.coverTemplate).map((d) => d.id));
  const used = new Set(interiorDesigns.map(interiorDirection));
  const cover = coverName(book.coverTemplate, locale);
  // Выбранный стиль — первым (как у сайта): сразу видно, что сейчас в книге.
  const ordered = [...interiorDesigns].sort(
    (a, b) => Number(b.id === interior) - Number(a.id === interior),
  );
  const own = style.fonts ?? {};
  const activePair = fontPairs.find((p) =>
    (Object.keys(p.fonts) as (keyof typeof p.fonts)[]).every(
      (r) => own[r]?.font === p.fonts[r]?.font,
    ),
  );

  return {
    bookId: book.id,
    editable: book.status === "draft" && isBookEditableBy(book.userId, viewer),
    state: {
      interior,
      dedication: book.dedication,
      showToc: book.showToc,
      endText: book.endText,
      titlePage: book.titlePage,
      photoPlacement: book.photoPlacement,
      customCount: countCustom(style),
    },
    imageWidths: [...PAGES_IMAGE_WIDTHS],
    spreadAspect: (2 * format.widthMm) / format.heightMm,
    spreads: PAGES_SPREADS.filter((k) => kinds.includes(k)).map((k) => ({
      kind: k,
      label: t.spreads[k],
      imageUrl: `${base}?kind=${k}&v=${v}`,
    })),
    limits: {
      dedication: PAGES_TEXT_MAX.dedication,
      endText: PAGES_TEXT_MAX.endText,
    },
    styles: {
      items: ordered.map((d) => ({
        id: d.id,
        name: names[d.id].name,
        description: names[d.id].description,
        direction: interiorDirection(d),
        directionLabel: dirNames[interiorDirection(d)],
        forCover: pairs.has(d.id),
        openerPhoto: d.opener.photo
          ? `${pp.badge} · ${m.editor.openerShape[d.opener.photo]}`
          : null,
        previewTitle: dt.styles.previewTitle(names[d.id].name),
        imageUrl: `${base}?kind=chapter&design=${d.id}&v=${v}`,
      })),
      filters: [
        { id: "all", label: dt.styles.all },
        ...(pairs.size
          ? [{ id: "cover", label: dt.styles.forCover(cover) }]
          : []),
        ...styleDirections
          .filter((d) => used.has(d))
          .map((d) => ({ id: d, label: dirNames[d] })),
      ],
      shown: STYLES_SHOWN,
    },
    fonts: {
      sample: book.title,
      pairs: fontPairs.map((p) => ({
        id: p.id,
        name:
          dt.fonts.pairNames[p.id as keyof typeof dt.fonts.pairNames] ?? p.id,
        display: face(p.fonts.display!),
        body: face(p.fonts.body!),
        upper: !!p.display?.upper,
        tracking: p.display?.tracking ?? 0,
        active: activePair?.id === p.id,
      })),
    },
    labels: {
      designSwitch: {
        cover: m.bookStudio.nav.designSwitch.cover,
        pages: m.bookStudio.nav.designSwitch.pages,
      },
      tabs: {
        content: sx.tabs.content,
        styles: dt.tabs.styles,
        fonts: dt.tabs.fonts,
      },
      content: {
        start: sx.start,
        front: sx.front,
        frontSet: sx.frontSet,
        frontEmpty: sx.frontEmpty,
        dedication: t.dedication,
        dedicationText: dedicationHint.text,
        dedicationPlaceholder: dedicationHint.placeholder,
        toc: t.toc,
        tocOn: sx.tocOn,
        tocOff: sx.tocOff,
        tocLabel: t.tocLabel,
        tocApprox: t.tocApprox,
        endTitle: t.endPage.title,
        endModes: (Object.keys(t.endPage.modes) as (keyof typeof t.endPage.modes)[]).map((id) => ({ id, label: t.endPage.modes[id] })),
        endLabel: t.endPage.label,
        endPlaceholder: t.endPage.placeholder,
        endHint: t.endPage.hint,
        endNoneHint: t.endPage.noneHint,
        endDefault: bookMessagesFor(book.language).theEnd,
        photos: t.photos,
        photosSummary: pp.summary[book.photoPlacement],
        photosLink: pp.summaryLink,
      },
      styles: {
        inBook: dt.styles.inBook,
        pairBadge: t.pairBadge,
        open: dt.styles.open,
        apply: dt.styles.apply,
        current: dt.styles.current,
        previewText: dt.styles.previewText,
        showAll: dt.styles.showAll(interiorDesigns.length),
        empty: dt.styles.empty,
        search: dt.styles.search,
        reset: dt.styles.keptNotice,
      },
      fonts: { pairs: dt.fonts.pairs, pairsText: dt.fonts.pairsText },
    },
  };
}

export const pagesHandlers: Pick<Handlers, "pagesGet" | "pagesUpdate"> = {
  async pagesGet({ req, input }) {
    const { book, viewer } = await apiBook(req, input.bookId);
    return view(book, viewer);
  },

  async pagesUpdate({ req, input }) {
    const { book, viewer } = await apiBook(req, input.bookId, {
      editable: true,
    });
    const { interior, fontPair, ...rest } = input.body;
    let style = parseInteriorStyle(book.interiorStyle) as InteriorStyle;
    const patch: Parameters<
      ReturnType<typeof container>["authoring"]["books"]["updateSettings"]
    >[2] = { ...rest };
    if (interior !== undefined) {
      if (!isInteriorId(interior)) throw new HttpError(400, "badRequest");
      // Как pickStyle сайта: свои шрифты и интервалы подбирались к прежнему стилю — новый показываем как он задуман.
      if (
        interior !== getInteriorDesign(book.interior).id &&
        countCustom(style) > 0
      )
        style = resetStyle(style);
      patch.interior = interior;
      patch.interiorStyle = style as Record<string, unknown>;
    }
    if (fontPair !== undefined) {
      const p = fontPairs.find((x) => x.id === fontPair);
      if (!p) throw new HttpError(400, "badRequest");
      style = patchSection(style, "fonts", p.fonts);
      if (p.display) style = patchSection(style, "display", p.display);
      patch.interiorStyle = style as Record<string, unknown>;
    }
    const authoring = container().authoring;
    await authoring.books.updateSettings(
      input.bookId,
      viewer,
      patch,
      authoring.photoRepository,
    );
    return view((await authoring.queries.book(input.bookId))!, viewer);
  },
};
