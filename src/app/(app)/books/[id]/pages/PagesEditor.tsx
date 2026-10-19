"use client";

import { useMemo, useRef, useState } from "react";
import { Check, Sparkles } from "lucide-react";
import { useMessages } from "@/i18n/client";
import { SaveIndicator } from "@/components/SaveIndicator";
import { PreviewDock, useScrolledPast } from "@/components/PreviewDock";
import { Choice, FormSection } from "@/components/ui/Choice";
import { InteriorSpread, type SpreadKind, type SpreadSample } from "@/components/interior/InteriorSpread";
import { useAutosave } from "@/hooks/useAutosave";
import { apiFetch } from "@/lib/client-api";
import { getFormat } from "@/lib/book/formats";
import { getInteriorDesign, interiorDesigns, interiorMoods, type InteriorId, type InteriorMood } from "@/lib/book/interiors";
import { cn } from "@/lib/class-names";
import { bookKind } from "@/lib/content/kinds";
import { sampleToc, type TocLines, type TocMode } from "@/lib/book/toc";
import { ChaptersEditor } from "./ChaptersEditor";
import type { StoryInfo } from "./StoryList";
import { TocEditor } from "./TocEditor";

interface PagesState {
  interior: InteriorId;
  dedication: string;
  showToc: boolean;
  tocMode: TocMode;
  tocLines: TocLines;
  photoPlacement: "chapters" | "end" | "none";
}

type Filter = InteriorMood | "all" | "cover";

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
  cover,
  theme,
  editable,
  stories,
}: {
  bookId: string;
  /** Тема книги — подсказка посвящения зависит от вида книги. */
  theme: string;
  format: string;
  initial: PagesState;
  sample: SpreadSample;
  /** Обложка книги и дизайны, которые с ней в паре. */
  cover: { name: string; pairs: InteriorId[] };
  editable: boolean;
  /** Истории книги по id ответа: заголовок по умолчанию, свой и скрыт ли — для блока «Главы книги». */
  stories: Record<string, StoryInfo>;
}) {
  const [state, setState] = useState(initial);
  const [filter, setFilter] = useState<Filter>("all");
  const [spread, setSpread] = useState<SpreadKind>("chapter");
  const m = useMessages();
  const t = m.books.pages;
  const kind = bookKind(theme);
  const dedicationHint = t.dedicationByKind[kind] ?? { text: t.dedicationText, placeholder: t.dedicationPlaceholder };
  const format = getFormat(formatId);
  const design = getInteriorDesign(state.interior);

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
  const live = useMemo(
    () => ({ ...sample, dedication: state.dedication.trim(), showToc: state.showToc, toc: sample.tocAll ? sampleToc(sample.tocAll, state.tocMode, state.tocLines) : sample.toc }),
    [sample, state.dedication, state.showToc, state.tocMode, state.tocLines],
  );
  const paired = new Set(cover.pairs);
  const filters: Filter[] = ["all", ...(paired.size ? (["cover"] as const) : []), ...interiorMoods];
  const shown = interiorDesigns.filter((d) => filter === "all" || d.id === state.interior || (filter === "cover" ? paired.has(d.id) : d.mood === filter));
  const names = m.catalog.interiors;
  const bigPreview = useRef<HTMLDivElement>(null);
  const scrolled = useScrolledPast(bigPreview);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-12">
      <PreviewDock show={scrolled}>
        <div className="shrink-0" style={{ width: 150 }}>
          <InteriorSpread design={design} format={format} sample={live} kind={spread} className="rounded-[2px] shadow-soft" />
        </div>
        <div className="min-w-0 flex-1 text-sm">
          <div className="truncate font-medium text-ink">{names[design.id].name}</div>
          <SaveIndicator status={status} error={error} className="text-xs" />
        </div>
      </PreviewDock>
      <div>
        <div className="lg:sticky lg:top-24">
          <div ref={bigPreview} className="rounded-[28px] bg-cream/70 p-3 sm:p-8">
            <InteriorSpread design={design} format={format} sample={live} kind={spread} className="rounded-[3px] shadow-book" />
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
          <div className="mt-4 text-center">
            <div className="flex items-center justify-center gap-3 text-sm text-muted">
              <span className="font-medium text-ink">{names[design.id].name}</span>·<SaveIndicator status={status} error={error} />
            </div>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted">{names[design.id].description}</p>
          </div>
        </div>
      </div>

      <div className="space-y-12">
        <section>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-semibold">{t.design}</h2>
            <span className="text-xs text-muted">{m.common.count.variants(interiorDesigns.length)}</span>
          </div>
          <p className="mt-1 text-sm text-muted">{t.designText}</p>
          <div className="no-scrollbar -mx-1 mt-4 flex gap-1.5 overflow-x-auto px-1 pb-1" role="radiogroup" aria-label={t.moodAria}>
            {filters.map((id) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={filter === id}
                onClick={() => setFilter(id)}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm transition",
                  filter === id ? "bg-ink text-white" : "bg-white text-ink-soft ring-1 ring-line hover:ring-ink/30",
                )}
              >
                {id === "cover" ? <Sparkles className="size-3.5" /> : null}
                {id === "cover" ? t.forCover(cover.name) : m.catalog.interiorMoods[id]}
              </button>
            ))}
          </div>
          <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-6">
            {shown.map((d) => {
              const active = d.id === state.interior;
              return (
                <button key={d.id} type="button" onClick={() => update({ interior: d.id })} disabled={!editable} aria-pressed={active} className="group text-left">
                  <div
                    className={cn(
                      "relative rounded-[3px] ring-offset-2 ring-offset-paper transition",
                      active ? "ring-2 ring-wine" : "ring-1 ring-line group-hover:-translate-y-0.5 group-hover:ring-ink/30",
                    )}
                  >
                    <InteriorSpread design={d} format={format} sample={sample} className="rounded-[3px]" />
                    {active ? (
                      <span className="absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full bg-wine text-white">
                        <Check className="size-3" />
                      </span>
                    ) : null}
                    {paired.has(d.id) ? (
                      <span className="absolute top-1.5 left-1.5 inline-flex items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-medium text-wine shadow-sm">
                        <Sparkles className="size-2.5" /> {t.pairBadge}
                      </span>
                    ) : null}
                  </div>
                  <div className={cn("mt-2 text-sm", active ? "font-semibold text-ink" : "font-medium text-ink-soft")}>{names[d.id].name}</div>
                  <div className="line-clamp-2 text-xs text-muted">{names[d.id].description}</div>
                </button>
              );
            })}
          </div>
        </section>

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
              <div className="text-sm text-muted">{t.photosEndText}</div>
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
