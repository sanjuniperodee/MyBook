"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Check, ExternalLink, LoaderCircle, Mic, Music, QrCode, TriangleAlert, Video, X } from "lucide-react";
import { useMessages } from "@/i18n/client";
import { MAX_MEDIA, MEDIA_TITLE_MAX, parseMediaUrl, qrDrawing, youtubeThumb, type AnswerMedia, type MediaKind } from "@/lib/book/answer-media";
import { formatDuration, type AnswerFileView } from "@/lib/book/answer-files";
import { splitParagraphs } from "@/lib/book/inline-photo";
import { ApiError, apiFetch } from "@/lib/client-api";
import { cn } from "@/lib/class-names";
import { toastError } from "@/components/ui/overlays";
import { Field, Segmented } from "../PhotoInspector";
import { FileUpload } from "./FileUpload";

/** Состояние своего файла: с сервера или «удалён». */
type FileState = AnswerFileView | "gone";
const POLL_MS = 5000;
const settled = (s: FileState | undefined) => s === "gone" || s?.status === "ready" || s?.status === "failed";

/**
 * Свои файлы ответа: состояние каждого с сервера; пока файл обрабатывается — спрашиваем раз в 5 секунд. seed — файл,
 * который только что загрузили (его состояние уже известно).
 */
function useFileStates(bookId: string, ids: string[]) {
  const [states, setStates] = useState<Record<string, FileState>>({});
  const current = useRef(states);
  useEffect(() => {
    current.current = states;
  }, [states]);
  const key = ids.join(",");
  useEffect(() => {
    if (!key) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      const pending = key.split(",").filter((id) => !settled(current.current[id]));
      if (!pending.length) return;
      const got = await Promise.all(
        pending.map((id) =>
          apiFetch<{ file: AnswerFileView }>(`/api/books/${bookId}/files/${id}`).then(
            (r) => [id, r.file] as const,
            (e: unknown) => (e instanceof ApiError && e.status === 404 ? ([id, "gone"] as const) : null),
          ),
        ),
      );
      if (stopped) return;
      setStates((s) => ({ ...s, ...Object.fromEntries(got.filter((g) => g !== null)) }));
      timer = setTimeout(() => void tick(), POLL_MS);
    };
    void tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [bookId, key]);
  const seed = (file: AnswerFileView) => setStates((s) => ({ ...s, [file.id]: file }));
  return { states, seed };
}

/** Строка состояния своего файла под заголовком карточки. */
function FileStatus({ state }: { state: FileState | undefined }) {
  const t = useMessages().editor.media.file;
  if (!state)
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted">
        <LoaderCircle className="size-3.5 animate-spin" />
      </p>
    );
  if (state === "gone" || state.status === "failed")
    return (
      <div className="flex items-start gap-1.5 text-xs leading-snug text-danger" role="alert">
        <TriangleAlert className="mt-px size-3.5 shrink-0" />
        <span>
          {state === "gone" ? t.errors.gone : t.errors[state.error ?? "server"]} {t.reupload}
        </span>
      </div>
    );
  if (state.status === "ready")
    return (
      <p className="flex items-center gap-1.5 text-xs text-success">
        <Check className="size-3.5" /> {t.ready(formatDuration(state.durationSec ?? 0))}
      </p>
    );
  return (
    <div className="space-y-0.5 text-xs leading-snug" role="status">
      <p className="flex items-center gap-1.5 font-medium text-ink">
        <LoaderCircle className="size-3.5 animate-spin text-wine" /> {state.status === "processing" ? t.processing : t.queued}
      </p>
      <p className="text-muted">{t.wait}</p>
    </div>
  );
}

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

function MediaItem({
  media,
  answer,
  editable,
  file,
  onChange,
  onRemove,
}: {
  media: AnswerMedia;
  answer: string;
  editable: boolean;
  /** Свой файл (media.fileId): состояние обработки. */
  file?: FileState;
  onChange: (patch: Partial<AnswerMedia>) => void;
  onRemove: () => void;
}) {
  const t = useMessages().editor.media;
  const parsed = parseMediaUrl(media.url);
  const { positions, label, indexOf } = usePositions(answer);
  // Обложка ролика не загрузилась (закрыт, удалён, нет сети) — показываем крупно сам QR-код.
  const [thumbFailed, setThumbFailed] = useState(false);
  // Свой файл удаляется насовсем — сначала переспрашиваем.
  const [confirming, setConfirming] = useState(false);
  const own = !!media.fileId;
  const poster = own && file && file !== "gone" ? file.poster : null;
  const thumb = poster ?? (parsed?.youtubeId && !thumbFailed ? youtubeThumb(parsed.youtubeId) : null);
  // Вид своего файла задан самим файлом: у видео выбора нет, аудио — «Аудио» или «Музыка».
  const kinds: MediaKind[] = own ? (media.kind === "video" ? [] : ["audio", "music"]) : ["video", "music"];
  const icons = { video: Video, music: Music, audio: Mic };
  return (
    <li className="enter flex gap-3 rounded-[12px] border border-line bg-white p-3 sm:gap-4 sm:p-4" data-testid="answer-media-item">
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
              className="block aspect-video w-24 rounded-[10px] bg-cream object-cover sm:w-36"
            />
            <QrPreview url={media.url} className="absolute -right-2 -bottom-2 size-10 rounded-lg bg-white p-0.5 ring-1 ring-line-strong sm:size-14" />
          </>
        ) : (
          <QrPreview url={media.url} className="size-16 rounded-[10px] bg-white p-1 ring-1 ring-line sm:size-24" />
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-3">
        <div className="flex items-start gap-2">
          {kinds.length ? (
            <div className="w-44 max-w-full min-w-0 max-sm:flex-1">
              <Segmented<MediaKind>
                label={t.kind}
                value={media.kind}
                disabled={!editable}
                onChange={(kind) => onChange({ kind })}
                options={kinds.map((k) => {
                  const Icon = icons[k];
                  return {
                    id: k,
                    label: (
                      <>
                        <Icon className="mr-1 size-3.5 max-sm:hidden" /> {t.kinds[k]}
                      </>
                    ),
                  };
                })}
              />
            </div>
          ) : (
            <span className="inline-flex items-center gap-1.5 py-1.5 text-sm font-medium">
              <Video className="size-4 text-wine" /> {t.kinds.video}
            </span>
          )}
          <a
            href={media.url}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto inline-flex min-w-0 items-center gap-1 rounded-lg p-2 text-xs text-wine hover:underline sm:px-0 sm:py-1.5"
            title={own ? t.file.open : t.open}
            aria-label={own ? t.file.open : t.open}
          >
            <span className="truncate max-sm:hidden">{own ? t.file.open : parsed?.source || media.url}</span>
            <ExternalLink className="size-3.5 shrink-0" />
          </a>
          {editable ? (
            <button
              type="button"
              onClick={() => (own && file !== "gone" ? setConfirming(true) : onRemove())}
              className="-mr-1 rounded-lg p-2 text-muted hover:bg-cream hover:text-danger max-lg:p-3"
              aria-label={t.removeAria(media.title)}
              title={t.remove}
            >
              <X className="size-4" />
            </button>
          ) : null}
        </div>
        {own ? <FileStatus state={file} /> : null}
        {confirming ? (
          <div className="flex flex-wrap items-center gap-2 rounded-[10px] bg-danger-bg p-3 text-sm" role="alert">
            <span className="min-w-0 flex-1">{t.file.removeConfirm}</span>
            <button
              type="button"
              className="btn btn-danger btn-sm"
              onClick={() => {
                setConfirming(false);
                onRemove();
              }}
            >
              {t.file.removeYes}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirming(false)}>
              {t.file.removeNo}
            </button>
          </div>
        ) : null}
        <Field label={t.caption}>
          <input
            value={media.title}
            onChange={(e) => onChange({ title: e.target.value.slice(0, MEDIA_TITLE_MAX) })}
            readOnly={!editable}
            maxLength={MEDIA_TITLE_MAX}
            placeholder={t.captionPlaceholder[media.kind]}
            className="input h-10 text-sm sm:h-9"
          />
        </Field>
        {positions.length > 1 ? (
          <Field label={t.place}>
            <select
              value={String(indexOf(media.anchor))}
              disabled={!editable}
              onChange={(e) => onChange({ anchor: positions[Number(e.target.value)] })}
              aria-label={t.placeAria}
              className="input h-10 min-w-0 px-2 text-sm sm:h-9"
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
  bookId,
  media,
  answer,
  editable,
  adding,
  onAdding,
  update,
}: {
  bookId: string;
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
  const files = useFileStates(
    bookId,
    media.flatMap((m) => (m.fileId ? [m.fileId] : [])),
  );

  // Видео без картинки сервер сделал аудио — карточка в книге тоже «Аудио».
  useEffect(() => {
    const changed = media.filter((m) => {
      const s = m.fileId ? files.states[m.fileId] : undefined;
      return s && s !== "gone" && s.kind === "audio" && m.kind === "video";
    });
    if (changed.length && editable) update((list) => list.map((m) => (changed.some((c) => c.id === m.id) ? { ...m, kind: "audio" } : m)));
  }, [media, files.states, editable, update]);

  const uploaded = (file: AnswerFileView) => {
    files.seed(file);
    if (media.length >= MAX_MEDIA) return setError(t.limit(MAX_MEDIA));
    update((list) => [...list, { id: crypto.randomUUID(), kind: file.kind, url: file.url, title: "", anchor: null, fileId: file.id }]);
    setError(null);
    onAdding(false);
  };

  /** Убрать карточку; свой файл — удалить и с сервера (страница по QR-коду перестанет открываться). */
  const remove = (m: AnswerMedia) => {
    if (!m.fileId) return update((list) => list.filter((x) => x.id !== m.id));
    void apiFetch(`/api/books/${bookId}/files/${m.fileId}`, { method: "DELETE" })
      .catch((e: unknown) => {
        if (!(e instanceof ApiError && e.status === 404)) throw e;
      })
      .then(() => update((list) => list.filter((x) => x.id !== m.id)))
      .catch((e: unknown) => toastError(e));
  };

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
    <section className="space-y-3 border-t border-line px-5 pt-4 pb-5 sm:px-10 sm:pb-6" data-testid="answer-media" aria-label={t.title}>
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
              file={m.fileId ? files.states[m.fileId] : undefined}
              onChange={(patch) => update((list) => list.map((x) => (x.id === m.id ? { ...x, ...patch } : x)))}
              onRemove={() => remove(m)}
            />
          ))}
        </ul>
      ) : null}
      {adding && editable ? (
        <form onSubmit={submit} className="enter space-y-3 rounded-[12px] bg-sunken p-4 sm:p-5">
          <p className="text-sm leading-snug text-ink-soft">{t.intro}</p>
          {media.length < MAX_MEDIA ? <FileUpload bookId={bookId} onUploaded={uploaded} /> : null}
          <div className="flex items-center gap-3 pt-1 text-xs text-muted" aria-hidden>
            <span className="h-px flex-1 bg-line" /> {t.upload.orLink} <span className="h-px flex-1 bg-line" />
          </div>
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
                className={cn("input min-w-0 flex-1", error && "border-danger")}
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
            <p className="text-sm text-danger" role="alert">
              {error}
            </p>
          ) : null}
        </form>
      ) : null}
      {media.length ? <p className="text-xs leading-snug text-muted">{t.printNote}</p> : null}
    </section>
  );
}
