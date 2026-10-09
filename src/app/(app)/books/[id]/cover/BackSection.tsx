"use client";

import { Check, ImagePlus } from "lucide-react";
import { Link, useMessages } from "@/i18n/client";
import { BACK_PHOTO_SLOTS, BACK_TEXT_MAX, backLayouts, type BackLayout } from "@/lib/book/cover-back";
import { photoUrl } from "@/lib/urls";
import { cn } from "@/lib/utils";

/** Схематичная миниатюра варианта — как он ляжет на заднюю крышку. */
function LayoutIcon({ layout }: { layout: BackLayout }) {
  const line = (y: number, w: number, x = (40 - w) / 2) => <rect x={x} y={y} width={w} height={1.6} rx={0.8} fill="currentColor" opacity={0.55} />;
  return (
    <svg viewBox="0 0 40 54" className="h-14 w-auto" aria-hidden>
      <rect x="0.5" y="0.5" width="39" height="53" rx="2" fill="none" stroke="currentColor" strokeOpacity={0.35} />
      {layout === "quote" ? (
        <>
          <circle cx="20" cy="18" r="1.3" fill="currentColor" />
          {line(23, 24)}
          {line(27, 28)}
          {line(31, 18)}
          {line(37, 8)}
        </>
      ) : layout === "letter" ? (
        <>
          {line(15, 26, 7)}
          {line(19, 26, 7)}
          {line(23, 26, 7)}
          {line(27, 20, 7)}
          {line(31, 24, 7)}
          {line(37, 8, 25)}
        </>
      ) : layout === "photo" ? (
        <>
          <rect x="10" y="12" width="20" height="16" fill="currentColor" opacity={0.3} stroke="currentColor" strokeOpacity={0.6} />
          {line(33, 18)}
        </>
      ) : layout === "fullPhoto" ? (
        <>
          <rect x="1" y="1" width="38" height="52" rx="1.5" fill="currentColor" opacity={0.25} />
          <rect x="1" y="30" width="38" height="23" rx="1.5" fill="currentColor" opacity={0.25} />
          {line(36, 24)}
          {line(40, 16)}
        </>
      ) : layout === "polaroids" ? (
        <>
          <rect x="5" y="9" width="14" height="16" fill="none" stroke="currentColor" strokeOpacity={0.7} transform="rotate(-8 12 17)" />
          <rect x="21" y="10" width="14" height="16" fill="none" stroke="currentColor" strokeOpacity={0.7} transform="rotate(7 28 18)" />
          <rect x="13" y="19" width="14" height="16" fill="currentColor" fillOpacity={0.3} stroke="currentColor" strokeOpacity={0.8} transform="rotate(-2 20 27)" />
          {line(40, 16)}
        </>
      ) : (
        <>
          <circle cx="20" cy="22" r="1.3" fill="currentColor" />
          <rect x="11" y="26" width="18" height="2.4" rx="1.2" fill="currentColor" opacity={0.75} />
          {line(31, 8)}
        </>
      )}
      <rect x="15" y="48" width="10" height="1" rx="0.5" fill="currentColor" opacity={0.35} />
    </svg>
  );
}

/**
 * Задняя сторона обложки: вариант (цитата, письмо, фото, фото во всю, полароиды, лаконично), текст с готовыми
 * идеями под тему книги и снимки для вариантов с фото. Любое действие здесь показывает в превью оборот.
 */
export function BackSection({
  bookId,
  theme,
  layout,
  text,
  photoIds,
  photos,
  signature,
  names,
  year,
  editable,
  onChange,
  onFocusBack,
}: {
  bookId: string;
  theme: string;
  layout: BackLayout;
  text: string;
  /** Выбранные фото оборота по порядку. */
  photoIds: string[];
  photos: { id: string; width: number; height: number }[];
  signature: string;
  names: string;
  year: number;
  editable: boolean;
  onChange: (patch: { backLayout?: BackLayout; backText?: string; backPhotoId?: string | null; backPhotoExtra?: string[] }) => void;
  onFocusBack: () => void;
}) {
  const t = useMessages().books.cover.back;
  const ideas = layout === "quote" || layout === "fullPhoto" || layout === "polaroids" ? (t.suggestions[theme] ?? []) : [];
  const need = BACK_PHOTO_SLOTS[layout] ?? 0;
  /** Один снимок — заменить; несколько — добавить или убрать из подборки (порядок — как выбирали). */
  const toggle = (id: string) => {
    let next: string[];
    if (need === 1) next = [id];
    else if (photoIds.includes(id)) next = photoIds.filter((x) => x !== id);
    else next = [...photoIds.slice(0, need - 1), id];
    onChange({ backPhotoId: next[0] ?? null, backPhotoExtra: next.slice(1) });
  };

  return (
    <section className="space-y-5 rounded-2xl border border-line bg-white p-5" onFocusCapture={onFocusBack} onPointerDownCapture={onFocusBack}>
      <div>
        <h2 className="text-lg font-semibold">{t.title}</h2>
        <p className="mt-1 text-sm text-muted">{t.text}</p>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3" role="radiogroup" aria-label={t.layoutAria}>
        {backLayouts.map((id) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={layout === id}
            disabled={!editable}
            onClick={() => onChange({ backLayout: id })}
            className={cn(
              "flex flex-col items-center gap-2 rounded-xl px-2 py-3 text-center transition",
              layout === id ? "bg-rose/40 text-wine ring-2 ring-wine" : "text-ink-soft ring-1 ring-line hover:ring-ink/30",
            )}
          >
            <LayoutIcon layout={id} />
            <span className="text-sm font-medium text-ink">{t.layouts[id].name}</span>
            <span className="-mt-1.5 text-xs leading-tight text-muted">{t.layouts[id].hint}</span>
          </button>
        ))}
      </div>

      {need ? (
        <div>
          <span className="label">{need > 1 ? t.photosPick(need) : t.photo}</span>
          {photos.length ? (
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
              {photos.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  disabled={!editable}
                  onClick={() => toggle(p.id)}
                  aria-pressed={photoIds.slice(0, need).includes(p.id)}
                  className={cn("relative aspect-square overflow-hidden rounded-xl ring-offset-2", photoIds.slice(0, need).includes(p.id) ? "ring-2 ring-wine" : "ring-1 ring-line")}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photoUrl(p.id)} alt="" className="h-full w-full object-cover" />
                  {photoIds.slice(0, need).includes(p.id) ? (
                    <span className="absolute top-1 right-1 flex size-5 items-center justify-center rounded-full bg-wine text-[11px] font-medium text-white">
                      {need > 1 ? photoIds.indexOf(p.id) + 1 : <Check className="size-3" />}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted">{t.noPhotos}</p>
          )}
          <Link href={`/books/${bookId}/photos`} className="mt-2 inline-flex items-center gap-1.5 text-sm text-wine hover:underline">
            <ImagePlus className="size-4" /> {t.addPhotos}
          </Link>
        </div>
      ) : null}

      {layout === "minimal" ? (
        <p className="rounded-xl bg-cream/70 px-4 py-3 text-sm text-ink-soft">{t.minimalNote(names, year)}</p>
      ) : (
        <div>
          <label className="label" htmlFor="backText">
            {t.label[layout]}
          </label>
          <textarea
            id="backText"
            className="input"
            rows={layout === "letter" ? 5 : 3}
            maxLength={BACK_TEXT_MAX}
            placeholder={t.placeholder[layout]}
            value={text}
            onChange={(e) => onChange({ backText: e.target.value })}
            disabled={!editable}
          />
          <div className="mt-1 flex justify-between gap-3 text-xs text-muted">
            <span>{layout !== "photo" && signature ? t.signed(signature) : ""}</span>
            <span className="tabular-nums">
              {text.length}/{BACK_TEXT_MAX}
            </span>
          </div>
          {ideas.length ? (
            <div className="mt-3">
              <div className="mb-2 text-xs font-medium text-muted">{t.ideas}</div>
              <div className="flex flex-wrap gap-2">
                {ideas.map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={!editable}
                    onClick={() => onChange({ backText: s })}
                    className={cn("rounded-full border px-3 py-1.5 text-left text-sm transition", text === s ? "border-wine bg-wine/5 text-wine" : "border-line bg-white hover:border-ink/30")}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
