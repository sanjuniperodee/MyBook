/**
 * HTML-страницы книги по дизайну оформления — та же вёрстка, что в PDF для типографии
 * (modules/production/infrastructure/pdf/interior/): те же кегли и отбивки из interiorSizes,
 * та же графика из interior-art. Размеры задаются через PageUnits, поэтому одни и те же компоненты
 * рисуют и превью в редакторе (пиксели), и масштабируемые миниатюры в выборе оформления (cqw).
 *
 * Куски страниц — рядом: graphics (рисунки), typography (начертания), answer-block и entry (ответ),
 * folio (колонцифра и колонтитул), surface (страница и полоса набора), kit (дизайн, формат, единицы).
 */
import type { CSSProperties } from "react";
import { site } from "@/config/site";
import { bookMessagesFor } from "@/i18n/messages/partial";
import { chapterMark, PHOTO_COLORS, type InteriorPalette } from "@/lib/book/interiors";
import { openerArtShapes } from "@/lib/book/interior-art";
import { openerFlow, textArea, pageSide } from "@/lib/book/page-geometry";
import { openerFit } from "@/lib/book/opener-fit";
import { openerPhotoPlan, photoArea, photoPagePlan, type OpenerPhotoPlan } from "@/lib/book/photo-pages";
import { DISPLAY_TOP, FRONT, HTML_LINE_HEIGHT, OPENER, photoCaptionFace, TOC, VIGNETTE_RULE } from "@/lib/book/typesetting";
import { cssFont } from "@/lib/book/fonts";
import { cn } from "@/lib/class-names";
import { hexAlpha } from "@/lib/color";
import { PageLayer, pageFrame, Vignette } from "./graphics";
import { ChapterTail, Divider, EntryBody, QuestionHeading, type SampleEntry } from "./entry";
import { Folio, folioText, RunningHead } from "./folio";
import { metricsOf, type PageKit } from "./kit";
import { PageImage, PageSurface, Placed, TextArea, type PageProps } from "./surface";
import { faceCss, italicBody, labelCss } from "./typography";

/** Снимок на начальной полосе: карточка с поворотом или снимок под обрез, затемнение внизу и графика поверх. */
function OpenerShot({ kit, shot, url, scene }: { kit: PageKit; shot: OpenerPhotoPlan; url?: string; scene: number }) {
  const { format, u } = kit;
  return (
    <>
      {shot.card ? (
        <div
          className="absolute"
          style={{
            left: u.mm(shot.card.x),
            top: u.mm(shot.card.y),
            width: u.mm(shot.card.w),
            height: u.mm(shot.card.h),
            background: PHOTO_COLORS.card,
            border: `${u.pt(OPENER.cardBorder)} solid ${PHOTO_COLORS.openerCardEdge}`,
            transform: `rotate(${shot.card.rotate}deg)`,
          }}
        >
          <PageImage kit={kit} rect={{ x: shot.img.x - shot.card.x - OPENER.cardInsetHtml, y: shot.img.y - shot.card.y - OPENER.cardInsetHtml, w: shot.img.w, h: shot.img.h }} url={url} scene={scene} />
        </div>
      ) : (
        <PageImage kit={kit} rect={shot.img} url={url} scene={scene} mask={shot.mask} />
      )}
      {shot.shade ? (
        <div
          className="absolute"
          style={{
            left: u.mm(shot.img.x),
            top: u.mm(shot.img.y),
            width: u.mm(shot.img.w),
            height: u.mm(shot.img.h),
            background: `linear-gradient(to bottom, transparent ${shot.shade.from * 100}%, ${hexAlpha(shot.shade.color, shot.shade.opacity)})`,
          }}
        />
      ) : null}
      <PageLayer shapes={shot.over} format={format} />
    </>
  );
}

/** Номер главы: подпись («Глава 1») или крупная цифра — по дизайну. */
function ChapterMark({ kit, colors, number }: { kit: PageKit; colors: InteriorPalette; number: number | null }) {
  const { design, sizes: S, u } = kit;
  const mark = number ? chapterMark(design, number, bookMessagesFor(kit.language).chapter) : null;
  if (mark?.kind === "label")
    return <div style={{ ...(design.opener.kicker ? { ...faceCss(design.opener.kicker, S.kicker, u), lineHeight: HTML_LINE_HEIGHT.kicker } : labelCss(kit, colors.accent)), color: colors.accent, marginBottom: u.pt(S.kickerGap) }}>{mark.text}</div>;
  if (mark?.kind === "numeral")
    return <div style={{ ...faceCss(design.opener.numeral ?? design.display, S.numeral, u), lineHeight: OPENER.numeral.lineHeight, color: colors.accent, marginBottom: u.pt(S.numeral * OPENER.numeral.after) }}>{mark.text}</div>;
  return null;
}

/**
 * Начальная полоса главы: номер, название, виньетка, эпиграф и рисунок дизайна. photo — снимок главы
 * в оформлениях, где глава открывается фото (без url — пейзаж-заглушка для примеров).
 */
export function OpenerPage({ kit, number, title, epigraph, photo, className, style }: PageProps & { number: number | null; title: string; epigraph?: string; photo?: { url?: string } }) {
  const { design, format, sizes: S, u } = kit;
  const { fill, align, art } = design.opener;
  const colors = fill ?? design.palette;
  const flow = openerFlow(format, design);
  const shot = photo ? openerPhotoPlan(format, design) : null;
  const fit = openerFit(format, design, { title, epigraph, number, photo: !!shot });
  const shapes = [
    ...(art ? openerArtShapes(art, { w: format.widthMm, h: format.heightMm, flowTop: flow.top, k: flow.k, palette: colors, seed: number ?? 0 }) : []),
    ...pageFrame(kit, colors),
    ...(shot?.under ?? []),
  ];
  return (
    <PageSurface kit={kit} paper={fill?.paper} shapes={shapes} className={className} style={style}>
      {shot ? <OpenerShot kit={kit} shot={shot} url={photo?.url} scene={number ?? 0} /> : null}
      <TextArea kit={kit} className="flex flex-col">
        <Placed top={shot?.textTop ?? design.opener.top} align={align}>
          <ChapterMark kit={kit} colors={colors} number={number} />
          <div style={{ ...faceCss(design.display, fit.titleSize, u), lineHeight: OPENER.title.lineHeight, color: colors.ink, maxWidth: OPENER.title.maxWidth, overflowWrap: "anywhere" }}>{title}</div>
          <Vignette kit={kit} rule={VIGNETTE_RULE.opener} colors={colors} align={align} />
          {epigraph ? <div style={{ ...italicBody(kit, S.epigraph), lineHeight: OPENER.epigraph.lineHeight, color: colors.muted, maxWidth: OPENER.epigraph.maxWidth[align], ...(fit.epigraphLines ? { display: "-webkit-box", WebkitBoxOrient: "vertical" as const, WebkitLineClamp: fit.epigraphLines, overflow: "hidden" } : {}) }}>{epigraph}</div> : null}
        </Placed>
      </TextArea>
    </PageSurface>
  );
}

export interface PagePhoto {
  id: string;
  /** Адрес снимка; без него — пейзаж-заглушка (примеры в выборе оформления). */
  url?: string;
  width: number;
  height: number;
  caption: string;
  layout: "full" | "bleed" | "half" | "grid";
}

/** Фотостраница: снимки, рамки и подписи по раскладке photo-pages — как в PDF. */
export function PhotoPage({ kit, photos, scene = 0, className, style }: PageProps & { photos: PagePhoto[]; /** С какого пейзажа-заглушки начинать. */ scene?: number }) {
  const { design, format, sizes: S, u } = kit;
  const plan = photoPagePlan(photos, photoArea(format), design, S);
  const face = photoCaptionFace(design);
  const caption = (size: number): CSSProperties =>
    face.label ? { ...labelCss(kit, face.color, size), lineHeight: face.lineHeight } : { ...faceCss(face.face, size, u), lineHeight: face.lineHeight, color: face.color };
  return (
    <PageSurface kit={kit} paper={design.photos.paper} shapes={plan.under} className={className} style={style}>
      {plan.cells.map((c, i) => {
        const p = photos.find((x) => x.id === c.id)!;
        return <PageImage key={c.id} kit={kit} rect={c.img} url={p.url} scene={scene + i} />;
      })}
      <PageLayer shapes={plan.over} format={format} />
      {plan.cells.map((c) =>
        c.caption ? (
          <div
            key={`cap-${c.id}`}
            className={cn("absolute text-center", c.caption.inside ? "truncate" : "line-clamp-3")}
            style={{ ...caption(c.caption.size), left: u.mm(c.caption.box.x), top: u.mm(c.caption.box.y), width: u.mm(c.caption.box.w) }}
          >
            {c.caption.text}
          </div>
        ) : null,
      )}
    </PageSurface>
  );
}

/** Титульный лист. */
export function TitlePage({ kit, title, subtitle, author, year, className, style }: PageProps & { title: string; subtitle: string; author: string; year: number }) {
  const { design, sizes: S, u } = kit;
  const P = design.palette;
  return (
    <PageSurface kit={kit} shapes={pageFrame(kit, P)} className={className} style={style}>
      <TextArea kit={kit} className="flex flex-col">
        <Placed top={DISPLAY_TOP.title}>
          <div style={{ ...faceCss(design.display, S.title, u), lineHeight: FRONT.title.lineHeight, color: P.ink, overflowWrap: "anywhere" }}>{title}</div>
          {subtitle ? <div style={{ ...italicBody(kit, S.subtitle), color: P.muted, marginTop: u.pt(FRONT.subtitle.before), lineHeight: HTML_LINE_HEIGHT.subtitle }}>{subtitle}</div> : null}
          <Vignette kit={kit} rule={VIGNETTE_RULE.title} colors={P} />
          {author ? <div style={labelCss(kit, P.muted)}>{author}</div> : null}
        </Placed>
        <div className="text-center" style={labelCss(kit, P.muted, S.year)}>
          {year}
        </div>
      </TextArea>
    </PageSurface>
  );
}

/** Оборот титула: копирайт и выходные данные внизу полосы — как в PDF (pdf/interior/colophon.tsx). */
export function ColophonPage({ kit, year, author, recordedBy, className, style }: PageProps & { year: number; author: string; recordedBy?: string }) {
  const { design, sizes: S, u } = kit;
  const t = bookMessagesFor(kit.language);
  return (
    <PageSurface kit={kit} className={className} style={style}>
      <TextArea kit={kit} className="flex flex-col">
        <div className="flex-1" />
        <div style={{ fontFamily: cssFont(design.type.body), fontSize: u.pt(S.colophon), lineHeight: FRONT.colophon.lineHeight, color: design.palette.muted, whiteSpace: "pre-line" }}>
          {`${t.copyright(year, author)}\n${recordedBy ? `${t.recordedBy(recordedBy)}\n` : ""}${t.colophon(site.name)}`}
        </div>
      </TextArea>
    </PageSurface>
  );
}

/** Посвящение; пустое — подсказкой (её в книге не будет). */
export function DedicationPage({ kit, text, placeholder, className, style }: PageProps & { text: string; placeholder?: string }) {
  const { design, sizes: S } = kit;
  const P = design.palette;
  return (
    <PageSurface kit={kit} shapes={pageFrame(kit, P)} className={className} style={style}>
      <TextArea kit={kit} className="flex flex-col">
        <Placed top={DISPLAY_TOP.dedication}>
          <div style={{ ...italicBody(kit, S.dedication), lineHeight: FRONT.dedication.lineHeight, color: P.ink, maxWidth: FRONT.dedication.maxWidth, whiteSpace: "pre-line", overflowWrap: "anywhere", opacity: text ? 1 : 0.4 }}>{text || placeholder}</div>
        </Placed>
      </TextArea>
    </PageSurface>
  );
}

/** Оглавление. */
export function TocPage({ kit, entries, className, style, muted }: PageProps & { entries: { key?: string; title: string; number: number | null; level?: 0 | 1; page: number }[]; muted?: boolean }) {
  const { design, sizes: S, u } = kit;
  const P = design.palette;
  const scale = metricsOf(kit).scale;
  return (
    <PageSurface kit={kit} className={className} style={style}>
      <TextArea kit={kit} className="overflow-hidden" style={{ opacity: muted ? 0.4 : 1 }}>
        <div style={{ ...faceCss(design.display, S.tocTitle, u), lineHeight: HTML_LINE_HEIGHT.tocTitle, color: P.ink, textAlign: design.opener.align === "left" ? "left" : "center", marginTop: u.pt(TOC.title.before * scale), marginBottom: u.pt(TOC.title.after * scale) }}>
          {bookMessagesFor(kit.language).toc}
        </div>
        {entries.map((e) => (
          <div key={e.key ?? e.number ?? "gallery"} className="flex items-end" style={{ fontFamily: cssFont(design.type.body), fontSize: u.pt(S.body), lineHeight: HTML_LINE_HEIGHT.tocEntry, marginBottom: u.pt(TOC.entry.after * scale), paddingLeft: e.level ? u.pt(TOC.entry.indent * scale) : 0 }}>
            <span className="truncate" style={{ color: e.level ? P.muted : P.ink, maxWidth: TOC.entry.maxWidth }}>
              {e.number ? `${e.number}. ` : ""}
              {e.title}
            </span>
            <span className="min-w-0 flex-1" style={{ borderBottom: `${u.pt(TOC.leader.width)} dotted ${P.rule}`, margin: `0 ${u.pt(TOC.leader.side)} ${u.pt(TOC.leader.bottom)}` }} />
            <span style={{ color: P.muted }}>{e.page}</span>
          </div>
        ))}
      </TextArea>
    </PageSurface>
  );
}

/** Последняя страница: «Продолжение следует…». */
export function EndPage({ kit, year, className, style }: PageProps & { year: number }) {
  const { design, sizes: S } = kit;
  const P = design.palette;
  return (
    <PageSurface kit={kit} shapes={pageFrame(kit, P)} className={className} style={style}>
      <TextArea kit={kit} className="flex flex-col">
        <Placed top={DISPLAY_TOP.end}>
          <Vignette kit={kit} rule={VIGNETTE_RULE.end} colors={P} />
          <div style={{ ...italicBody(kit, S.end), color: P.ink, lineHeight: HTML_LINE_HEIGHT.end }}>{bookMessagesFor(kit.language).theEnd}</div>
          <div style={{ ...labelCss(kit, P.muted), marginTop: kit.u.pt(FRONT.endYear.before) }}>{year}</div>
        </Placed>
      </TextArea>
    </PageSurface>
  );
}

/**
 * Страница текста главы для миниатюр: заголовки, абзацы, колонтитул и колонцифра. Текст режется
 * по строкам как в книге — через CSS-колонки размером с полосу набора (видна только первая).
 */
export function TextPage({ kit, entries, folio, bookTitle, chapterTitle, recto, leadIn, part = 0, tail = false, className, style }: PageProps & {
  entries: SampleEntry[];
  folio: number;
  bookTitle: string;
  chapterTitle: string;
  recto: boolean;
  /** Это первая страница главы: капитель в начале первого ответа. */
  leadIn: boolean;
  /** Какая по счёту полоса текста главы (с 0): колонки сдвигаются, и видна именно она. */
  part?: number;
  /** Концовка главы после последнего ответа (в листаемой книге — да, в образцах разворота — нет). */
  tail?: boolean;
}) {
  const { design, sizes: S, u } = kit;
  const area = textArea(kit.format);
  const side = pageSide(kit.format);
  const textW = area.w;
  return (
    <PageSurface kit={kit} className={className} style={style}>
      <RunningHead kit={kit} bookTitle={bookTitle} chapterTitle={chapterTitle} recto={recto} />
      <TextArea kit={kit} className="overflow-hidden">
        <div
          data-flow
          style={{
            width: u.mm(textW),
            height: u.mm(area.h),
            columnWidth: u.mm(textW),
            columnGap: u.mm(side * 2),
            columnFill: "auto",
            // Без переноса висячих строк: WebKit (Safari, браузеры на iPhone), перенося по widows две последние строки
            // абзаца в следующую колонку, ставит следующий абзац на строку выше — строки налезают друг на друга.
            widows: 1,
            orphans: 1,
            transform: part ? `translateX(calc(${-part} * (${u.mm(textW)} + ${u.mm(side * 2)})))` : undefined,
          }}
        >
          {entries.map((e, i) => (
            <div key={i} style={{ marginTop: i === 0 ? 0 : u.pt(e.heading ? S.beforeHeading : S.beforeHeadless) }}>
              {e.heading ? <QuestionHeading kit={kit}>{e.heading}</QuestionHeading> : i > 0 ? <Divider kit={kit} /> : null}
              <EntryBody kit={kit} entry={e} leadIn={leadIn && design.leadIn && i === 0} />
            </div>
          ))}
          {tail ? <ChapterTail kit={kit} /> : null}
        </div>
      </TextArea>
      <Folio kit={kit} recto={recto}>
        {folioText(design, folio)}
      </Folio>
    </PageSurface>
  );
}
