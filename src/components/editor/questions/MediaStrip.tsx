"use client";

import { useRef, useState, type FormEvent } from "react";
import { ExternalLink, Music, QrCode, Video, X } from "lucide-react";
import { useMessages } from "@/i18n/client";
import { MAX_MEDIA, MEDIA_TITLE_MAX, parseMediaUrl, qrDrawing, youtubeThumb, type AnswerMedia, type MediaKind } from "@/lib/book/answer-media";
import { splitParagraphs } from "@/lib/book/inline-photo";
import { apiFetch } from "@/lib/client-api";
import { cn } from "@/lib/class-names";
import { Field, Segmented } from "../PhotoInspector";

/** Площадки, где ссылку скорее слушают, чем смотрят: вид по умолчанию — «Музыка». */
const MUSIC_SOURCES = new Set(["YouTube Music", "Spotify", "Apple Music", "Yandex Music", "SoundCloud"]);

/** QR-код в карточке редактора — тот же рисунок, что печатается в книге. */
function QrPreview({ url, className }: { url: string; className?: string }) {
  const d = qrDrawing(url, 100, "#141414");
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      {d.shapes.map((s, i) => (s.kind === "path" ? <path key={i} d={s.d} fill={s.fill} transform={s.transform} /> : s.kind === "rect" ? <rect key={i} x={s.x} y={s.y} width={s.w} height={s.h} fill={s.fill} /> : null))}
    </svg>
  );
}

/** Позиции в тексте, как у фото: −1 (перед текстом), 0…n−2 (после абзаца), null (в конце). */
function usePositions(answer: string) {
  const t = useMessages().editor.inspector;
  const paragraphs = splitParagraphs(answer);
  const positions: (number | null)[] = paragraphs.length ? [-1, ...paragraphs.slice(0, -1).map((_, i) => i), null] : [null];
  const label = (a: number | null) => (a === null ? t.atEnd : a < 0 ? t.beforeText : t.afterParagraph(a + 1, paragraphs[a].split(/\s+/).slice(0, 5).join(" ")));
  const indexOf = (anchor: number | null) => Math.max(0, positions.indexOf(anchor === null || anchor >= paragraphs.length - 1 ? null : anchor));
  return { positions, label, indexOf };
}

function MediaItem({ media, answer, editable, onChange, onRemove }: { media: AnswerMedia; answer: string; editable: boolean; onChange: (patch: Partial<AnswerMedia>) => void; onRemove: () => void }) {
  const t = useMessages().editor.media;
  const parsed = parseMediaUrl(media.url);
  const { positions, label, indexOf } = usePositions(answer);
  // Обложка ролика не загрузилась (закрыт, удалён, нет сети) — показываем крупно сам QR-код.
  const [thumbFailed, setThumbFailed] = useState(false);
  const thumb = parsed?.youtubeId && !thumbFailed ? youtubeThumb(parsed.youtubeId) : null;
  return (
    <li className="enter flex gap-3 rounded-3xl border border-line bg-white p-3 sm:gap-4 sm:p-4" data-testid="answer-media-item">
      <div className="relative shrink-0 self-start">
        {thumb ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- обложка ролика YouTube, только в редакторе */}
            <img
              src={thumb}
              alt=""
              // Ошибка могла случиться ещё до гидратации — тогда onError не придёт, проверяем загруженную картинку.
              ref={(el) => {
                if (el?.complete && !el.naturalWidth) setThumbFailed(true);
              }}
              onError={() => setThumbFailed(true)}
              className="block aspect-video w-24 rounded-2xl bg-cream object-cover sm:w-36"
            />
            <QrPreview url={media.url} className="absolute -right-2 -bottom-2 size-10 rounded-lg bg-white p-0.5 shadow-md ring-1 ring-line sm:size-14" />
          </>
        ) : (
          <QrPreview url={media.url} className="size-16 rounded-2xl bg-white p-1 ring-1 ring-line sm:size-24" />
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-3">
        <div className="flex items-start gap-2">
          <div className="w-44 max-w-full min-w-0 max-sm:flex-1">
            <Segmented<MediaKind>
              label={t.kind}
              value={media.kind}
              disabled={!editable}
              onChange={(kind) => onChange({ kind })}
              options={[
                {
                  id: "video",
                  label: (
                    <>
                      <Video className="mr-1 size-3.5 max-sm:hidden" /> {t.kinds.video}
                    </>
                  ),
                },
                {
                  id: "music",
                  label: (
                    <>
                      <Music className="mr-1 size-3.5 max-sm:hidden" /> {t.kinds.music}
                    </>
                  ),
                },
              ]}
            />
          </div>
          <a href={media.url} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex min-w-0 items-center gap-1 rounded-full p-2 text-xs text-wine hover:underline sm:px-0 sm:py-1.5" title={t.open} aria-label={t.open}>
            <span className="truncate max-sm:hidden">{parsed?.source || media.url}</span>
            <ExternalLink className="size-3.5 shrink-0" />
          </a>
          {editable ? (
            <button type="button" onClick={onRemove} className="-mr-1 rounded-full p-2 text-muted hover:bg-cream hover:text-red-700" aria-label={t.removeAria(media.title)} title={t.remove}>
              <X className="size-4" />
            </button>
          ) : null}
        </div>
        <Field label={t.caption}>
          <input
            value={media.title}
            onChange={(e) => onChange({ title: e.target.value.slice(0, MEDIA_TITLE_MAX) })}
            readOnly={!editable}
            maxLength={MEDIA_TITLE_MAX}
            placeholder={t.captionPlaceholder[media.kind]}
            className="h-10 w-full rounded-xl border border-line bg-white px-3 text-sm outline-none focus:border-ink/40 sm:h-9"
          />
        </Field>
        {positions.length > 1 ? (
          <Field label={t.place}>
            <select
              value={String(indexOf(media.anchor))}
              disabled={!editable}
              onChange={(e) => onChange({ anchor: positions[Number(e.target.value)] })}
              aria-label={t.placeAria}
              className="h-10 w-full min-w-0 rounded-xl border border-line bg-white px-2 text-sm sm:h-9"
            >
              {positions.map((a, i) => (
                <option key={i} value={i}>
                  {label(a)}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
      </div>
    </li>
  );
}

/**
 * Видео и музыка текущего ответа: ссылка превращается в QR-код с подписью, который печатается в книге (answer-media.ts).
 * Название ролика YouTube подставляется в подпись само (oEmbed), если автор ещё ничего не вписал.
 * update получает функцию от актуального списка: название приходит позже, а автор за это время мог что-то поменять.
 */
export function MediaStrip({
  media,
  answer,
  editable,
  adding,
  onAdding,
  update,
}: {
  media: AnswerMedia[];
  answer: string;
  editable: boolean;
  /** Открыта форма новой ссылки. */
  adding: boolean;
  onAdding: (open: boolean) => void;
  update: (fn: (media: AnswerMedia[]) => AnswerMedia[]) => void;
}) {
  const t = useMessages().editor.media;
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = parseMediaUrl(url);
    if (!parsed) {
      setError(t.badUrl);
      input.current?.focus();
      return;
    }
    if (media.length >= MAX_MEDIA) return setError(t.limit(MAX_MEDIA));
    if (media.some((m) => m.url === parsed.url)) return setError(t.duplicate);
    const id = crypto.randomUUID();
    update((list) => [...list, { id, kind: MUSIC_SOURCES.has(parsed.source) ? "music" : "video", url: parsed.url, title: "", anchor: null }]);
    setUrl("");
    setError(null);
    onAdding(false);
    if (parsed.youtubeId)
      void apiFetch<{ title: string | null }>(`/api/media/oembed?url=${encodeURIComponent(parsed.url)}`)
        .then(({ title }) => {
          if (title) update((list) => list.map((m) => (m.id === id && !m.title.trim() ? { ...m, title } : m)));
        })
        .catch(() => {});
  };

  if (!media.length && !adding) return null;
  return (
    <section className="space-y-3 px-4 pb-5 sm:px-10 sm:pb-6" data-testid="answer-media" aria-label={t.title}>
      <div className="flex items-center gap-2 text-sm font-medium text-ink">
        <QrCode className="size-4 text-wine" /> {t.title}
      </div>
      {media.length ? (
        <ul className="space-y-3">
          {media.map((m) => (
            <MediaItem
              key={m.id}
              media={m}
              answer={answer}
              editable={editable}
              onChange={(patch) => update((list) => list.map((x) => (x.id === m.id ? { ...x, ...patch } : x)))}
              onRemove={() => update((list) => list.filter((x) => x.id !== m.id))}
            />
          ))}
        </ul>
      ) : null}
      {adding && editable ? (
        <form onSubmit={submit} className="enter space-y-3 rounded-3xl bg-cream/70 p-4 sm:p-5">
          <p className="text-sm leading-snug text-ink-soft">{t.intro}</p>
          <p className="text-xs leading-snug text-muted">{t.howTo}</p>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">{t.urlLabel}</span>
            <div className="flex gap-2 max-sm:flex-col">
              <input
                ref={input}
                autoFocus
                type="url"
                inputMode="url"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  setError(null);
                }}
                placeholder={t.urlPlaceholder}
                aria-invalid={!!error}
                className={cn("h-11 min-w-0 flex-1 rounded-xl border bg-white px-3 text-[15px] outline-none focus:border-ink/40", error ? "border-red-400" : "border-line")}
              />
              <div className="flex gap-2">
                <button type="submit" className="btn btn-primary btn-sm h-11 flex-1 px-5" disabled={!url.trim()}>
                  {t.submit}
                </button>
                <button type="button" className="btn btn-ghost btn-sm h-11 text-muted" onClick={() => onAdding(false)}>
                  {t.cancel}
                </button>
              </div>
            </div>
          </label>
          {error ? (
            <p className="text-sm text-red-700" role="alert">
              {error}
            </p>
          ) : null}
        </form>
      ) : null}
      {media.length ? <p className="text-xs leading-snug text-muted">{t.printNote}</p> : null}
    </section>
  );
}
