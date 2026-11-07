"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Sparkles } from "lucide-react";
import { Link, useMessages } from "@/i18n/client";
import { SaveIndicator } from "@/components/SaveIndicator";
import { PanelBody, StudioFrame, StudioStage } from "@/components/design/studio/Frame";
import { GroupTitle, PillSwitch, StudioTabs, type StudioTab } from "@/components/design/studio/Tabs";
import { ChapterPhotoSheet } from "@/components/editor/photos/ChapterPhotoSheet";
import { GallerySheet } from "@/components/editor/photos/GallerySheet";
import { galleryTitleOf, type PlaceData, type PlaceEvents } from "@/components/editor/photos/model";
import { InteriorSpread, type SpreadKind, type SpreadSample } from "@/components/interior/InteriorSpread";
import { useAutosave } from "@/hooks/useAutosave";
import { apiFetch } from "@/lib/client-api";
import { getFormat } from "@/lib/book/formats";
import { applyInteriorStyle, chapterDesign, getInteriorDesign, type InteriorId, type InteriorStyle } from "@/lib/book/interiors";
import { bookKind } from "@/lib/content/kinds";
import { sampleToc, type TocLines, type TocMode } from "@/lib/book/toc";
import { ChaptersEditor, type PhotoSheetTarget } from "./ChaptersEditor";
import { albumCount, designNotice, placesForDesign, type PagesPhotoData } from "./pages-photos";
import type { StoryInfo } from "./StoryList";
import { TocEditor } from "./TocEditor";
import { DesignStudio, STUDIO_TABS, type StudioTabId } from "./studio/DesignStudio";
import { RibbonItem } from "./RibbonItem";

interface PagesState {
  interior: InteriorId;
  /** Настройки дизайнера поверх стиля (interiors/style.ts). */
  interiorStyle: InteriorStyle;
  dedication: string;
  showToc: boolean;
  tocMode: TocMode;
  tocLines: TocLines;
  photoPlacement: "chapters" | "end" | "none";
  /** «Глава всегда с левой страницы» (books.pagination_rev 2): перед главой может встать пустая страница. */
  openersLeft: boolean;
}

const spreads: SpreadKind[] = ["chapter", "photos", "front", "toc"];

/**
 * Оформление страниц — как выбор обложки: слева большой разворот книги клиента в выбранном
 * дизайне, справа — все дизайны миниатюрами с фильтром по настроению и подсказкой «к обложке».
 * Ниже — то, что тоже определяет вид блока: посвящение, главы с их фото, оглавление и правило фото (его меняют во
 * вкладке «Фото», здесь — одна строка). Оформления с фото в начале главы — со значком и формой фото; выбрали такое —
 * подсказка, сколько глав уже с фото, и кнопка к листу «Фото главы»; ушли из него — что выбранные фото глав никуда не
 * денутся (R5). Листы фото правят фото сразу, страница потом перечитывает книгу с сервера (места фото — его сборка).
 */
export function PagesEditor({
  bookId,
  format: formatId,
  initial,
  sample,
  exactPages = null,
  cover,
  theme,
  editable,
  stories,
  photos,
}: {
  bookId: string;
  /** Тема книги — подсказка посвящения зависит от вида книги. */
  theme: string;
  format: string;
  initial: PagesState;
  sample: SpreadSample;
  /** Номера страниц готового макета (сохранённое оформление): по ним оглавление на развороте — точное. */
  exactPages?: Record<string, number> | null;
  /** Обложка книги и дизайны, которые с ней в паре. */
  cover: { name: string; pairs: InteriorId[] };
  editable: boolean;
  /** Истории книги по id ответа: заголовок по умолчанию, свой и скрыт ли — для блока «Главы книги». */
  stories: Record<string, StoryInfo>;
  /** Фото книги и их места по сборке сервера — фото глав, альбом, листы фото. */
  photos: PagesPhotoData;
}) {
  const [state, setState] = useState(initial);
  const [spread, setSpread] = useState<SpreadKind>("chapter");
  /** Выбранная глава (лента слева или вкладка «Главы» студии): разворот показывает её начало, а «Главы» правят её оформление. */
  const [selChapter, setSelChapter] = useState<string | null>(null);
  /** Что раскрыто в ленте книги: «front», «toc», «photos» или строка главы (c:…). */
  const [openItem, setOpenItem] = useState<string | null>(null);
  /** Вкладка студии (справа) и «Состав книги» — вкладка листа на телефоне. */
  const [tab, setTab] = useState<StudioTabId | "content">("styles");
  const m = useMessages();
  const t = m.books.pages;
  const kind = bookKind(theme);
  const dedicationHint = t.dedicationByKind[kind] ?? { text: t.dedicationText, placeholder: t.dedicationPlaceholder };
  const format = getFormat(formatId);
  const base = getInteriorDesign(state.interior);
  // Стиль с настройками книги — то же, что уйдёт в PDF (layout.ts → bookInterior).
  const design = useMemo(() => applyInteriorStyle(base, state.interiorStyle), [base, state.interiorStyle]);
  const router = useRouter();
  // Оформление, с которым автор открыл вкладку: от него — «выбрали оформление с фото» и «ушли из него».
  const [opened] = useState(initial.interior);

  const changes = useRef<Partial<PagesState>>({});
  const { status, error, schedule, flush } = useAutosave<null>(async () => {
    const patch = changes.current;
    changes.current = {};
    if (!Object.keys(patch).length) return;
    try {
      await apiFetch(`/api/books/${bookId}`, { method: "PATCH", json: patch });
    } catch (e) {
      changes.current = { ...patch, ...changes.current };
      throw e;
    }
    // Новое оформление — сервер пересоберёт книгу: места фото (фото главы или после главы), подсказки формы, разворот.
    // Сторона глав — номера страниц в оглавлении разворота.
    if (patch.interior || patch.openersLeft !== undefined) router.refresh();
  }, 600);
  const update = (patch: Partial<PagesState>) => {
    if (!editable) return;
    setState((s) => ({ ...s, ...patch }));
    changes.current = { ...changes.current, ...patch };
    schedule(null);
  };

  // Большой разворот сразу показывает посвящение и оглавление; миниатюры от них не зависят и не перерисовываются.
  // Главы книги для студии (вкладка «Главы»): названия — с правками автора, убранные главы не показываем.
  const studioChapters = useMemo(
    () =>
      (sample.tocAll ?? [])
        .filter((c) => c.kind === "chapter" && c.number !== null && !c.folded)
        .map((c) => ({ key: c.key.replace(/^c:/, ""), title: state.tocLines[c.key]?.title?.trim() || c.label, number: c.number, epigraph: state.tocLines[c.key]?.epigraph ?? c.epigraph })),
    [sample.tocAll, state.tocLines],
  );
  const previewOf = spread === "chapter" ? studioChapters.find((c) => c.key === selChapter) : undefined;
  const live = useMemo(
    () => ({
      ...sample,
      dedication: state.dedication.trim(),
      showToc: state.showToc,
      toc: sample.tocAll ? sampleToc(sample.tocAll, state.tocMode, state.tocLines) : sample.toc,
      ...(previewOf ? { chapter: { number: previewOf.number ?? sample.chapter.number, title: previewOf.title, epigraph: previewOf.epigraph } } : {}),
    }),
    [sample, state.dedication, state.showToc, state.tocMode, state.tocLines, previewOf],
  );
  // Разворот главы со своим оформлением — в её оформлении.
  const spreadDesign = previewOf ? chapterDesign(design, previewOf.key) : design;
  // Номера в оглавлении точные, пока оформление то, по которому собран макет (правки меняют разбивку), и у каждой
  // строки номер из макета; иначе под разворотом — что они примерные.
  const tocExact = useMemo(() => {
    if (!exactPages) return false;
    const changed =
      state.interior !== initial.interior ||
      JSON.stringify(state.interiorStyle) !== JSON.stringify(initial.interiorStyle) ||
      state.showToc !== initial.showToc ||
      state.openersLeft !== initial.openersLeft ||
      state.tocMode !== initial.tocMode ||
      !!state.dedication.trim() !== !!initial.dedication.trim() ||
      JSON.stringify(state.tocLines ?? {}) !== JSON.stringify(initial.tocLines ?? {});
    const pageKeys = new Map<string, string>((sample.tocAll ?? []).map((c) => [c.key, c.pageKey]));
    return !changed && live.toc.every((l) => (pageKeys.get(l.key ?? "") ?? "") in exactPages);
  }, [exactPages, initial, state, sample.tocAll, live.toc]);
  const names = m.catalog.interiors;
  const designSection = useRef<HTMLDivElement>(null);

  // Фото глав: места по сборке сервера, под оформление, выбранное сейчас (пока сервер не пересобрал книгу).
  const openerDesign = !!design.opener.photo;
  const serverPlaces = useMemo(() => new Map(photos.places), [photos.places]);
  const places = useMemo(() => placesForDesign(serverPlaces, photos.photos, openerDesign), [serverPlaces, photos.photos, openerDesign]);
  const placeData = useMemo<PlaceData>(
    () => ({ book: { ...photos.book, interior: state.interior, photoPlacement: state.photoPlacement }, photos: photos.photos, places, chapters: photos.chapters, answers: photos.answers, tocLines: state.tocLines }),
    [photos, places, state.interior, state.photoPlacement, state.tocLines],
  );
  const [sheet, setSheet] = useState<PhotoSheetTarget | null>(null);
  const openSheet = (target: PhotoSheetTarget) => {
    // Несохранённые правки строк глав — до листа: он сам пишет строки оглавления («без фото», название альбома).
    void flush();
    setSheet(target);
  };
  // Что поменял лист: фото — страница перечитывает книгу; настройки книги — сразу здесь (уже сохранены листом).
  const placeEvents = useMemo<PlaceEvents>(() => {
    const refresh = () => router.refresh();
    return {
      onPhotos: refresh,
      onUploaded: refresh,
      onOrder: refresh,
      // Лист перевёл книгу на правила раскладки 2 перед правкой места — места и порядок фото с сервера.
      onLayout: refresh,
      onBook: (patch) => {
        setState((s) => ({ ...s, ...patch }));
        // Ждущая сохранения правка тех же настроек не должна затереть сохранённое листом.
        if (patch.tocLines && changes.current.tocLines) changes.current.tocLines = patch.tocLines;
        if (patch.photoPlacement && changes.current.photoPlacement) changes.current.photoPlacement = patch.photoPlacement;
        refresh();
      },
    };
  }, [router]);
  const notice = designNotice({ design, from: getInteriorDesign(opened), changed: state.interior !== opened, data: photos, places, tocLines: state.tocLines });
  const album = albumCount(photos, places);
  const pp = m.books.pagesPhotos;

  const sx = m.design.ui.studio.pages;
  const dt = m.design.pages;
  const styleTab: StudioTabId = tab === "content" ? "styles" : tab;
  /** Студия просит показать разворот (и главу): выбранная глава остаётся, пока не выберут другую. */
  const onPreview = (kind: SpreadKind, chapterKey?: string | null) => {
    setSpread(kind);
    if (chapterKey) setSelChapter(chapterKey);
  };
  const changeTab = (id: StudioTabId | "content") => {
    setTab(id);
    if (id === "chapters") onPreview("chapter", selChapter ?? studioChapters[0]?.key ?? null);
    else if (id !== "content") setSpread("chapter");
  };
  const openChapter = (key: string | null) => {
    setOpenItem(key);
    if (key) {
      setSelChapter(key.replace(/^c:/, ""));
      setSpread("chapter");
    }
  };
  const toggleItem = (key: "front" | "toc" | "photos", kindOf?: SpreadKind) => {
    setOpenItem(openItem === key ? null : key);
    if (openItem !== key && kindOf) setSpread(kindOf);
  };
  const styleTabs: StudioTab<StudioTabId>[] = STUDIO_TABS.map((id) => ({ id, label: id === "ai" ? m.design.cover.panels.ai : dt.tabs[id], icon: id === "ai" ? Sparkles : undefined }));
  const sheetTabs: StudioTab<StudioTabId | "content">[] = [{ id: "content", label: sx.tabs.content }, ...styleTabs];

  const noticeEl =
    notice?.kind === "toPhoto" ? (
      <div className="rounded-[var(--r-panel)] bg-sunken p-3.5 text-sm" role="status">
        <p className="text-ink-soft">{pp.toPhoto(names[design.id].name, m.editor.openerShape[notice.shape], notice.chosen, notice.total)}</p>
        {notice.next && notice.chosen < notice.total && photos.book.editable ? (
          <button type="button" className="btn btn-outline btn-sm mt-2.5 min-h-11" onClick={() => openSheet({ kind: "chapter", key: notice.next! })}>
            <ImagePlus className="size-4" /> {pp.toPhotoBtn}
          </button>
        ) : null}
      </div>
    ) : notice?.kind === "leaving" ? (
      <p className="rounded-[var(--r-panel)] bg-sunken p-3.5 text-sm text-ink-soft" role="status">
        {pp.leaving}
      </p>
    ) : null;

  const showChapters = !!sample.tocAll && (kind !== "blank" || sample.tocAll.some((c) => c.kind === "chapter" && !c.key.startsWith("c:planned-")));
  /** Лента книги: что в ней есть и как это называется — титул и посвящение, оглавление, главы, правило для фото. Раскрыта одна строка. */
  const ribbon = (
    <div className="space-y-5">
      <section>
        <GroupTitle>{sx.start}</GroupTitle>
        <ul className="space-y-1.5">
          <RibbonItem title={sx.front} meta={state.dedication.trim() ? sx.frontSet : sx.frontEmpty} open={openItem === "front"} onToggle={() => toggleItem("front", "front")}>
            <label className="label !mb-0" htmlFor="pages-dedication">
              {t.dedication}
            </label>
            <textarea
              id="pages-dedication"
              className="input"
              rows={4}
              maxLength={600}
              value={state.dedication}
              onChange={(e) => update({ dedication: e.target.value })}
              onFocus={() => setSpread("front")}
              placeholder={dedicationHint.placeholder}
              disabled={!editable}
            />
            <p className="text-xs text-muted">{dedicationHint.text}</p>
          </RibbonItem>
          <RibbonItem title={t.toc} meta={state.showToc ? sx.tocOn : sx.tocOff} open={openItem === "toc"} onToggle={() => toggleItem("toc", "toc")}>
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input
                type="checkbox"
                className="size-5 accent-wine"
                checked={state.showToc}
                onChange={(e) => {
                  update({ showToc: e.target.checked });
                  setSpread("toc");
                }}
                disabled={!editable}
              />
              <span>{t.tocLabel}</span>
            </label>
            {spread === "toc" && state.showToc && !tocExact ? (
              <p className="text-xs text-muted">
                {t.tocApprox}{" "}
                <Link href={`/books/${bookId}/preview`} className="text-wine hover:underline">
                  {t.tocApproxLink}
                </Link>
              </p>
            ) : null}
            {state.showToc && sample.tocAll ? <TocEditor candidates={sample.tocAll} mode={state.tocMode} lines={state.tocLines} editable={editable} onChange={update} onFocus={() => setSpread("toc")} /> : null}
          </RibbonItem>
        </ul>
      </section>

      {/* Главы темы: название, эпиграф, «убрать» и фото главы; своя книга — только фото глав (главы — в редакторе). */}
      {showChapters ? (
        <section>
          <GroupTitle>{t.chapters}</GroupTitle>
          <p className="mb-2.5 text-xs leading-snug text-muted">{kind === "blank" ? pp.blankNote : t.chaptersText}</p>
          <ChaptersEditor
            bookId={bookId}
            blank={kind === "blank"}
            stories={stories}
            photos={{ places, openerDesign, album: album ? { title: galleryTitleOf(state.tocLines, photos.book.galleryTitle), count: album } : null, onOpen: openSheet }}
            candidates={sample.tocAll!}
            lines={state.tocLines}
            editable={editable}
            onChange={(tocLines) => update({ tocLines })}
            accordion={{ open: openItem?.startsWith("c:") ? openItem : null, onOpen: openChapter }}
          />
        </section>
      ) : null}

      {/* Правило для фото без выбранного места — одной строкой: выбирают его во вкладке «Фото», рядом с самими фото. */}
      <section>
        <GroupTitle>{t.photos}</GroupTitle>
        <p className="text-sm text-ink-soft">{pp.summary[state.photoPlacement]}</p>
        <Link href={`/books/${bookId}/photos`} className="mt-1 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-wine hover:underline">
          {pp.summaryLink}
        </Link>
      </section>
    </div>
  );

  const studio = (
    <DesignStudio
      bookId={bookId}
      interior={state.interior}
      base={base}
      design={design}
      style={state.interiorStyle}
      onChange={(next) => update(next)}
      format={format}
      sample={sample}
      cover={cover}
      chapters={studioChapters}
      editable={editable}
      onPreview={onPreview}
      openersLeft={state.openersLeft}
      onOpenersLeft={(openersLeft) => update({ openersLeft })}
      tab={styleTab}
      chapter={selChapter}
      onChapter={setSelChapter}
    />
  );

  const spreadSwitch = <PillSwitch label={t.spreadsAria} size="sm" value={spread} onChange={setSpread} options={spreads.map((k) => ({ value: k, label: t.spreads[k] }))} />;
  const bar = (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <h1 className="font-serif text-[28px] leading-none font-medium max-sm:sr-only sm:text-[32px]">{t.title}</h1>
      <span className="max-lg:hidden">{spreadSwitch}</span>
      <div className="ml-auto">
        <SaveIndicator status={status} error={error} />
      </div>
    </div>
  );
  const ratio = (2 * format.widthMm) / format.heightMm;

  return (
    <div>
      <StudioFrame
        bar={bar}
        leftWidth={300}
        rightWidth={340}
        rightOnMobile={tab !== "content"}
        left={
          <PanelBody tabs={<StudioTabs tabs={[{ id: "content", label: sx.ribbonTitle }]} value="content" onChange={() => undefined} label={sx.tabsAria} />}>
            {noticeEl ? <div className="mb-4">{noticeEl}</div> : null}
            {ribbon}
          </PanelBody>
        }
        right={<PanelBody tabs={<StudioTabs tabs={styleTabs} value={styleTab} onChange={changeTab} label={dt.tabsAria} />}>{studio}</PanelBody>}
        stage={
          <StudioStage
            overlay={
              <div className="pointer-events-none absolute inset-x-3 top-3 lg:hidden [&>*]:pointer-events-auto">{spreadSwitch}</div>
            }
          >
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-4 pt-14 pb-4 lg:pt-4">
              <div style={{ width: `min(calc(100cqw - 2rem), calc((100cqh - 6rem) * ${ratio}))` }}>
                <InteriorSpread design={spreadDesign} format={format} sample={live} kind={spread} className="rounded-[3px] shadow-book" />
              </div>
              <div className="hidden max-w-md text-center lg:block">
                <div className="text-sm font-medium text-ink">{names[design.id].name}</div>
                <p className="mt-0.5 text-[13px] leading-snug text-muted">{names[design.id].description}</p>
              </div>
            </div>
          </StudioStage>
        }
        mobileTabs={<StudioTabs tabs={sheetTabs} value={tab} onChange={changeTab} label={sx.tabsAria} />}
        sheet={
          tab === "content" ? (
            <>
              {noticeEl ? <div className="mb-4">{noticeEl}</div> : null}
              {ribbon}
            </>
          ) : noticeEl ? (
            <div className="lg:hidden">{noticeEl}</div>
          ) : undefined
        }
      />

      {sheet?.kind === "chapter" ? (
        <ChapterPhotoSheet
          data={placeData}
          on={placeEvents}
          chapterKey={sheet.key}
          fit={state.interior === photos.book.interior ? photos.fit[sheet.key] : undefined}
          onChangeDesign={() => {
            setSheet(null);
            designSection.current?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
          onClose={() => setSheet(null)}
        />
      ) : sheet?.kind === "album" ? (
        <GallerySheet data={placeData} on={placeEvents} onClose={() => setSheet(null)} />
      ) : null}
    </div>
  );
}
