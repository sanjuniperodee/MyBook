"use client";

import { useMemo, useRef, useState } from "react";
import { Link, useMessages } from "@/i18n/client";
import { SaveIndicator } from "@/components/SaveIndicator";
import { PreviewDock, useScrolledPast } from "@/components/PreviewDock";
import { Choice, FormSection } from "@/components/ui/Choice";
import { InteriorSpread, type SpreadKind, type SpreadSample } from "@/components/interior/InteriorSpread";
import { useAutosave } from "@/hooks/useAutosave";
import { apiFetch } from "@/lib/client-api";
import { getFormat } from "@/lib/book/formats";
import { applyInteriorStyle, chapterDesign, getInteriorDesign, type InteriorId, type InteriorStyle } from "@/lib/book/interiors";
import { cn } from "@/lib/class-names";
import { bookKind } from "@/lib/content/kinds";
import { sampleToc, type TocLines, type TocMode } from "@/lib/book/toc";
import { ChaptersEditor, type ChapterPhotoPlan } from "./ChaptersEditor";
import type { StoryInfo } from "./StoryList";
import { TocEditor } from "./TocEditor";
import { DesignStudio } from "./studio/DesignStudio";

interface PagesState {
  interior: InteriorId;
  /** Настройки дизайнера поверх стиля (interiors/style.ts). */
  interiorStyle: InteriorStyle;
  dedication: string;
  showToc: boolean;
  tocMode: TocMode;
  tocLines: TocLines;
  photoPlacement: "chapters" | "end" | "none";
}

const spreads: SpreadKind[] = ["chapter", "photos", "front", "toc"];

/**
 * Оформление страниц — как выбор обложки: слева большой разворот книги клиента в выбранном
 * дизайне, справа — все дизайны миниатюрами с фильтром по настроению и подсказкой «к обложке».
 * Ниже — то, что тоже определяет вид блока: посвящение, оглавление и место фотографий.
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
  photoPlan,
  galleryTitle,
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
  /** Фото по главам — кнопка «Фото главы» в карточке главы. */
  photoPlan?: ChapterPhotoPlan;
  /** Название раздела фото в конце книги — как в печати (по виду книги, на языке книги). */
  galleryTitle: string;
}) {
  const [state, setState] = useState(initial);
  const [spread, setSpread] = useState<SpreadKind>("chapter");
  /** Глава, оформление которой правят во вкладке «Главы» студии: разворот показывает её начало. */
  const [previewChapter, setPreviewChapter] = useState<string | null>(null);
  const m = useMessages();
  const t = m.books.pages;
  const kind = bookKind(theme);
  const dedicationHint = t.dedicationByKind[kind] ?? { text: t.dedicationText, placeholder: t.dedicationPlaceholder };
  const format = getFormat(formatId);
  const base = getInteriorDesign(state.interior);
  // Стиль с настройками книги — то же, что уйдёт в PDF (layout.ts → bookInterior).
  const design = useMemo(() => applyInteriorStyle(base, state.interiorStyle), [base, state.interiorStyle]);

  const changes = useRef<Partial<PagesState>>({});
  const { status, error, schedule } = useAutosave<null>(async () => {
    const patch = changes.current;
    changes.current = {};
    if (!Object.keys(patch).length) return;
    try {
      await apiFetch(`/api/books/${bookId}`, { method: "PATCH", json: patch });
    } catch (e) {
      changes.current = { ...patch, ...changes.current };
      throw e;
    }
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
  const previewOf = studioChapters.find((c) => c.key === previewChapter);
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
      state.tocMode !== initial.tocMode ||
      !!state.dedication.trim() !== !!initial.dedication.trim() ||
      JSON.stringify(state.tocLines ?? {}) !== JSON.stringify(initial.tocLines ?? {});
    const pageKeys = new Map<string, string>((sample.tocAll ?? []).map((c) => [c.key, c.pageKey]));
    return !changed && live.toc.every((l) => (pageKeys.get(l.key ?? "") ?? "") in exactPages);
  }, [exactPages, initial, state, sample.tocAll, live.toc]);
  const names = m.catalog.interiors;
  const bigPreview = useRef<HTMLDivElement>(null);
  const scrolled = useScrolledPast(bigPreview);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-12">
      <PreviewDock show={scrolled}>
        <div className="shrink-0" style={{ width: 150 }}>
          <InteriorSpread design={spreadDesign} format={format} sample={live} kind={spread} className="rounded-[2px] shadow-soft" />
        </div>
        <div className="min-w-0 flex-1 text-sm">
          <div className="truncate font-medium text-ink">{names[design.id].name}</div>
          <SaveIndicator status={status} error={error} className="text-xs" />
        </div>
      </PreviewDock>
      <div>
        <div className="lg:sticky lg:top-24">
          <div ref={bigPreview} className="rounded-[28px] bg-cream/70 p-3 sm:p-8">
            <InteriorSpread design={spreadDesign} format={format} sample={live} kind={spread} className="rounded-[3px] shadow-book" />
          </div>
          <div className="mt-4 flex justify-center">
            <div role="radiogroup" aria-label={t.spreadsAria} className="no-scrollbar inline-flex max-w-full gap-1 overflow-x-auto rounded-2xl bg-cream/70 p-1">
              {spreads.map((k) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={spread === k}
                  onClick={() => setSpread(k)}
                  className={cn("h-10 shrink-0 rounded-xl px-3.5 text-sm font-medium transition sm:h-9 sm:px-4", spread === k ? "bg-white text-ink shadow-soft" : "text-muted hover:text-ink")}
                >
                  {t.spreads[k]}
                </button>
              ))}
            </div>
          </div>
          {spread === "toc" && state.showToc && !tocExact ? (
            <p className="mx-auto mt-3 max-w-md text-center text-xs text-muted">
              {t.tocApprox}{" "}
              <Link href={`/books/${bookId}/preview`} className="text-wine hover:underline">
                {t.tocApproxLink}
              </Link>
            </p>
          ) : null}
          <div className="mt-4 text-center">
            <div className="flex items-center justify-center gap-3 text-sm text-muted">
              <span className="font-medium text-ink">{names[design.id].name}</span>·<SaveIndicator status={status} error={error} />
            </div>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted">{names[design.id].description}</p>
          </div>
        </div>
      </div>

      <div className="space-y-12">
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
          onPreview={(kind, chapterKey) => {
            setSpread(kind);
            setPreviewChapter(chapterKey ?? null);
          }}
        />

        <FormSection title={t.dedication} description={dedicationHint.text}>
          <textarea
            className="input"
            rows={3}
            maxLength={600}
            value={state.dedication}
            onChange={(e) => update({ dedication: e.target.value })}
            onFocus={() => setSpread("front")}
            placeholder={dedicationHint.placeholder}
            disabled={!editable}
          />
        </FormSection>

        {/* Главы своей книги автор называет и собирает в редакторе вопросов; здесь — главы темы. */}
        {kind !== "blank" && sample.tocAll ? (
          <FormSection title={t.chapters} description={t.chaptersText}>
            <ChaptersEditor
              bookId={bookId}
              stories={stories}
              photoPlan={photoPlan}
              candidates={sample.tocAll}
              lines={state.tocLines}
              editable={editable}
              onChange={(tocLines) => {
                update({ tocLines });
                if (state.showToc) setSpread("toc");
              }}
            />
          </FormSection>
        ) : null}

        <FormSection title={t.toc}>
          <label className="flex items-center gap-3">
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
          {state.showToc && sample.tocAll ? (
            <div className="mt-5">
              <TocEditor candidates={sample.tocAll} mode={state.tocMode} lines={state.tocLines} editable={editable} onChange={update} onFocus={() => setSpread("toc")} />
            </div>
          ) : null}
        </FormSection>

        <FormSection title={t.photos} description={t.photosText}>
          <div className="grid gap-4 sm:grid-cols-3">
            <Choice active={state.photoPlacement === "chapters"} onClick={() => update({ photoPlacement: "chapters" })} disabled={!editable}>
              <div className="font-medium">{t.photosChapters}</div>
              <div className="text-sm text-muted">{t.photosChaptersText}</div>
            </Choice>
            <Choice active={state.photoPlacement === "end"} onClick={() => update({ photoPlacement: "end" })} disabled={!editable}>
              <div className="font-medium">{t.photosEnd}</div>
              <div className="text-sm text-muted">{t.photosEndText(galleryTitle)}</div>
            </Choice>
            <Choice active={state.photoPlacement === "none"} onClick={() => update({ photoPlacement: "none" })} disabled={!editable}>
              <div className="font-medium">{t.photosNone}</div>
              <div className="text-sm text-muted">{t.photosNoneText}</div>
            </Choice>
          </div>
        </FormSection>
      </div>
    </div>
  );
}
