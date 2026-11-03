"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LoaderCircle, Upload, X } from "lucide-react";
import { useMessages } from "@/i18n/client";
import { clientLocale, LOCALE_HEADER } from "@/i18n/config";
import { ApiError, apiFetch } from "@/lib/client-api";
import { errorMessagesFor } from "@/i18n/messages/partial";
import { formatPrice } from "@/config/site";
import { cn } from "@/lib/class-names";
import { FILE_ACCEPT, FILE_CHUNK_BYTES, fileKindOf, MAX_SECONDS, MAX_SOURCE_BYTES, type AnswerFileView, type FileKind, type FileQuota, type MediaPackOffer } from "@/lib/book/answer-files";
import { Alert } from "@/components/ui/Alert";
import { toast, toastError } from "@/components/ui/overlays";
import { KaspiPay } from "@/components/payments/KaspiPay";
import type { KaspiInvoiceView } from "@/modules/ordering/ui/kaspi";

/** Сколько раз подряд пробуем отправить кусок, если пропала сеть (телефон в лифте, смена вышки). */
const RETRIES = 6;

type Info = { quota: FileQuota; packs: MediaPackOffer[] };
type Purchase = { purchase: { id: string; number: number; minutes: number; amount: number }; kaspi: { initial: KaspiInvoiceView | null; defaultPhone: string } | null };

/** Длительность по метаданным в браузере; null — браузер не смог прочитать (HEVC в Chrome, запись без длительности). */
function readDuration(file: File, kind: FileKind): Promise<number | null> {
  return new Promise((resolve) => {
    const el = document.createElement(kind);
    const url = URL.createObjectURL(file);
    const done = (v: number | null) => {
      clearTimeout(timer);
      el.removeAttribute("src");
      URL.revokeObjectURL(url);
      resolve(v);
    };
    const timer = setTimeout(() => done(null), 6000);
    el.preload = "metadata";
    el.muted = true;
    el.onloadedmetadata = () => done(Number.isFinite(el.duration) && el.duration > 0 ? el.duration : null);
    el.onerror = () => done(null);
    el.src = url;
  });
}

class NetworkError extends Error {}

/** Кусок файла: XHR, потому что у fetch нет прогресса отправки. */
function sendChunk(url: string, blob: Blob, onProgress: (loaded: number) => void, signal: AbortSignal): Promise<{ received: number }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.setRequestHeader(LOCALE_HEADER, clientLocale());
    xhr.upload.onprogress = (e) => onProgress(e.loaded);
    xhr.onload = () => {
      let data: { received?: number; error?: string; code?: string } = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {}
      if (xhr.status >= 200 && xhr.status < 300 && typeof data.received === "number") resolve({ received: data.received });
      else if (xhr.status >= 500 || xhr.status === 0) reject(new NetworkError());
      else reject(new ApiError(data.error ?? String(xhr.status), xhr.status, data.code));
    };
    xhr.onerror = () => reject(new NetworkError());
    xhr.ontimeout = () => reject(new NetworkError());
    signal.addEventListener("abort", () => xhr.abort());
    xhr.onabort = () => reject(new DOMException("aborted", "AbortError"));
    xhr.send(blob);
  });
}

const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => (clearTimeout(t), reject(new DOMException("aborted", "AbortError"))));
  });

type Phase = { kind: "idle" } | { kind: "reading" } | { kind: "uploading"; id: string; name: string; pct: number; retrying: boolean } | { kind: "error"; message: string; resume: { file: File; id: string } | null; quota?: boolean };

/**
 * Загрузка своего видео или аудио к ответу: проверка файла ещё в браузере (тип, размер, длительность — длинное видео не
 * придётся грузить зря), загрузка кусками с прогрессом и повтором после обрыва связи, остановка. Минуты книги видны сразу;
 * когда они кончились и пакеты минут продаются — предложение купить с оплатой Kaspi прямо здесь, без цен в остальное время.
 */
export function FileUpload({ bookId, onUploaded }: { bookId: string; onUploaded: (file: AnswerFileView) => void }) {
  const t = useMessages().editor.media.upload;
  const input = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [info, setInfo] = useState<Info | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [buying, setBuying] = useState<Purchase | null>(null);

  const load = useCallback(() => {
    void apiFetch<Info>(`/api/books/${bookId}/files`)
      .then(setInfo)
      .catch(() => {});
  }, [bookId]);
  useEffect(load, [load]);

  const busy = phase.kind === "reading" || phase.kind === "uploading";
  // Уход со страницы посреди загрузки — браузер переспросит.
  useEffect(() => {
    if (phase.kind !== "uploading") return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [phase.kind]);
  // Закрыли форму или перешли к другому вопросу посреди загрузки — она идёт дальше, и файл встанет в свой ответ.

  /** Отправить файл с места, которое сервер уже получил. */
  const upload = async (file: File, id: string, from: number) => {
    const ctrl = new AbortController();
    abort.current = ctrl;
    const url = `/api/books/${bookId}/files/${id}`;
    let offset = from;
    let failures = 0;
    setPhase({ kind: "uploading", id, name: file.name, pct: Math.floor((offset / file.size) * 100), retrying: false });
    try {
      while (offset < file.size) {
        const blob = file.slice(offset, Math.min(file.size, offset + FILE_CHUNK_BYTES));
        try {
          const start = offset;
          const { received } = await sendChunk(`${url}?offset=${offset}`, blob, (loaded) => setPhase({ kind: "uploading", id, name: file.name, pct: Math.min(99, Math.floor(((start + loaded) / file.size) * 100)), retrying: false }), ctrl.signal);
          offset = received;
          failures = 0;
        } catch (e) {
          if (e instanceof DOMException && e.name === "AbortError") throw e;
          if (!(e instanceof NetworkError) && !(e instanceof ApiError && e.code === "fileChunk")) throw e;
          if (++failures > RETRIES) throw e;
          setPhase({ kind: "uploading", id, name: file.name, pct: Math.floor((offset / file.size) * 100), retrying: true });
          await wait(Math.min(30_000, 2000 * 2 ** (failures - 1)), ctrl.signal);
          // Сколько сервер успел получить — с этого места и продолжаем.
          const state = await apiFetch<{ file: AnswerFileView }>(url).catch(() => null);
          if (state?.file.status === "uploading") offset = state.file.receivedBytes;
        }
      }
      const { file: done } = await apiFetch<{ file: AnswerFileView }>(url, { method: "POST" });
      setPhase({ kind: "idle" });
      onUploaded(done);
      load();
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      const message = e instanceof NetworkError ? errorMessagesFor(clientLocale()).network : e instanceof Error ? e.message : String(e);
      setPhase({ kind: "error", message, resume: { file, id } });
    } finally {
      if (abort.current === ctrl) abort.current = null;
    }
  };

  const pick = async (file: File) => {
    const kind = fileKindOf(file.name, file.type);
    if (!kind) return setPhase({ kind: "error", message: t.notMedia, resume: null });
    if (file.size > MAX_SOURCE_BYTES) return setPhase({ kind: "error", message: t.tooBig(Math.round(MAX_SOURCE_BYTES / 1024 ** 3)), resume: null });
    setPhase({ kind: "reading" });
    const duration = await readDuration(file, kind);
    if (duration !== null && duration > MAX_SECONDS[kind] + 1) return setPhase({ kind: "error", message: t.tooLong(MAX_SECONDS[kind] / 60), resume: null });
    if (duration !== null && info && duration > info.quota.leftSec + 1) return setPhase({ kind: "error", message: t.needMinutes(String(Math.floor(info.quota.leftSec / 60))), resume: null, quota: true });
    try {
      const { file: created } = await apiFetch<{ file: AnswerFileView }>(`/api/books/${bookId}/files`, { method: "POST", json: { name: file.name, size: file.size, type: file.type, durationSec: duration } });
      await upload(file, created.id, 0);
    } catch (e) {
      setPhase({ kind: "error", message: e instanceof Error ? e.message : String(e), resume: null, quota: e instanceof ApiError && e.code === "fileQuota" });
    }
  };

  const stop = () => {
    const current = phase;
    abort.current?.abort();
    setPhase({ kind: "idle" });
    const id = current.kind === "error" ? current.resume?.id : current.kind === "uploading" ? current.id : null;
    if (id) void apiFetch(`/api/books/${bookId}/files/${id}`, { method: "DELETE" }).catch(() => {});
  };

  const resume = async (file: File, id: string) => {
    const state = await apiFetch<{ file: AnswerFileView }>(`/api/books/${bookId}/files/${id}`).catch((e: unknown) => e);
    if (state instanceof Error) return setPhase({ kind: "error", message: state.message, resume: state instanceof ApiError && state.status === 404 ? null : { file, id } });
    if ((state as { file: AnswerFileView }).file.status !== "uploading") {
      setPhase({ kind: "idle" });
      onUploaded((state as { file: AnswerFileView }).file);
      return;
    }
    await upload(file, id, (state as { file: AnswerFileView }).file.receivedBytes);
  };

  const buy = async (pack: MediaPackOffer) => {
    setOpening(pack.id);
    try {
      setBuying(await apiFetch<Purchase>(`/api/books/${bookId}/files/packs`, { method: "POST", json: { packId: pack.id } }));
    } catch (e) {
      toastError(e);
    } finally {
      setOpening(null);
    }
  };

  const q = info?.quota;
  const full = !!q && (q.leftSec <= 0 || q.files >= q.maxFiles);
  const showPacks = !!info?.packs.length && q && q.files < q.maxFiles && (q.leftSec <= 0 || (phase.kind === "error" && phase.quota));

  return (
    <div className="space-y-3" data-testid="answer-file-upload">
      <input
        ref={input}
        type="file"
        accept={FILE_ACCEPT}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void pick(file);
        }}
      />
      {phase.kind === "uploading" ? (
        <div className="space-y-2 rounded-2xl bg-white p-3 ring-1 ring-line" role="status">
          <div className="flex items-center gap-2 text-sm">
            <LoaderCircle className="size-4 shrink-0 animate-spin text-wine" />
            <span className="min-w-0 flex-1 truncate">{phase.retrying ? t.retrying : t.progress(phase.pct)}</span>
            <button type="button" className="btn btn-ghost btn-sm h-9 text-muted" onClick={stop}>
              {t.stop}
            </button>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-cream" aria-hidden>
            <div className="h-full rounded-full bg-wine transition-[width] duration-300" style={{ width: `${phase.pct}%` }} />
          </div>
          <p className="truncate text-xs text-muted">
            {phase.name} · {t.keepOpen}
          </p>
        </div>
      ) : (
        <button type="button" className="btn btn-outline h-11 w-full gap-2 sm:w-auto" disabled={busy || full} onClick={() => input.current?.click()}>
          {phase.kind === "reading" ? <LoaderCircle className="size-4 animate-spin" /> : <Upload className="size-4" />}
          {phase.kind === "reading" ? t.reading : t.button}
        </button>
      )}
      {phase.kind === "error" ? (
        <div className="space-y-2">
          <p className="text-sm text-red-700" role="alert">
            {phase.message}
          </p>
          {phase.resume ? (
            <div className="flex gap-2">
              <button type="button" className="btn btn-primary btn-sm h-10" onClick={() => void resume(phase.resume!.file, phase.resume!.id)}>
                {t.retry}
              </button>
              <button type="button" className="btn btn-ghost btn-sm h-10 text-muted" onClick={stop}>
                {t.stop}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
      <p className="text-xs leading-snug text-muted">{t.hint(MAX_SECONDS.video / 60, MAX_SECONDS.audio / 60)}</p>
      {q ? (
        <p className={cn("text-xs leading-snug", full ? "text-ink" : "text-muted")}>
          {q.files >= q.maxFiles ? t.filesFull(q.maxFiles) : q.leftSec <= 0 ? t.full(q.minutes) : t.left(String(Math.floor(q.leftSec / 60)), q.minutes)}
        </p>
      ) : null}
      {showPacks && info ? (
        <div className="space-y-2" data-testid="answer-file-packs">
          <div className="text-sm font-medium">{t.more}</div>
          <ul className="space-y-2">
            {info.packs.map((p) => (
              <li key={p.id} className={cn("flex items-center gap-3 rounded-2xl bg-white p-3 ring-1", p.featured ? "ring-wine/40" : "ring-line")}>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {t.packMinutes(p.minutes)}
                    {p.featured ? <span className="rounded-full bg-wine px-2 py-0.5 text-[10px] font-semibold text-white uppercase">{t.featured}</span> : null}
                  </div>
                  <div className="text-xs text-muted">
                    <b className="text-sm font-semibold text-ink">{formatPrice(p.price)}</b> · {t.perMinute(formatPrice(Math.round(p.price / p.minutes)))}
                  </div>
                </div>
                <button type="button" className={cn("btn btn-sm shrink-0", p.featured ? "btn-primary" : "btn-outline")} disabled={!!opening} onClick={() => void buy(p)}>
                  {opening === p.id ? <LoaderCircle className="size-4 animate-spin" /> : null} {t.buy}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {buying ? (
        <PayDialog
          purchase={buying}
          onClose={() => setBuying(null)}
          onPaid={() => {
            toast(t.paid(buying.purchase.minutes));
            setBuying(null);
            setPhase({ kind: "idle" });
            load();
          }}
        />
      ) : null}
    </div>
  );
}

function PayDialog({ purchase, onClose, onPaid }: { purchase: Purchase; onClose: () => void; onPaid: () => void }) {
  const t = useMessages().editor.media.upload;
  const { purchase: p, kaspi } = purchase;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-6" role="dialog" aria-modal="true" aria-label={t.payTitle(p.minutes)} data-testid="answer-file-pay">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{t.payTitle(p.minutes)}</h2>
            <p className="mt-0.5 text-2xl font-semibold">{formatPrice(p.amount)}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={t.close} className="flex size-9 items-center justify-center rounded-full hover:bg-ink/5">
            <X className="size-4" />
          </button>
        </div>
        {kaspi ? (
          <KaspiPay
            target={{ kind: "media_pack", purchaseId: p.id }}
            amountLabel={formatPrice(p.amount)}
            defaultPhone={kaspi.defaultPhone}
            initial={kaspi.initial}
            fallback={null}
            hints={{ note: t.payNote(p.number), paid: t.paid(p.minutes) }}
            onPaid={onPaid}
          />
        ) : (
          <Alert kind="info">{t.payUnavailable}</Alert>
        )}
      </div>
    </div>,
    document.body,
  );
}
