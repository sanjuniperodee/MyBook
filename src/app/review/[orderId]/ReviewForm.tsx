"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Gift, ImagePlus, Star, X } from "lucide-react";
import { Link, useMessages } from "@/i18n/client";
import { apiFetch } from "@/lib/client-api";
import { toastError } from "@/components/ui/overlays";
import { cn } from "@/lib/utils";

export interface ReviewDraft {
  rating: number;
  text: string;
  authorName: string;
  city: string;
  consent: boolean;
  hasPhoto: boolean;
  status: "new" | "published" | "hidden";
  thankYouCode: string | null;
}

const TEXT_MAX = 2000;
const PHOTO_MAX_BYTES = 15 * 1024 * 1024;

/**
 * Форма отзыва: звёзды, текст (подсказка меняется от оценки), фото, имя и согласие на показ.
 * После отправки — благодарность и промокод; пока отзыв не проверен, его можно поправить.
 */
export function ReviewForm({
  orderId,
  token,
  defaultName,
  initial,
  thankYou,
}: {
  orderId: string;
  token: string | null;
  defaultName: string;
  initial: ReviewDraft | null;
  thankYou: { percent: number; validDays: number };
}) {
  const m = useMessages();
  const t = m.review;
  const [rating, setRating] = useState(initial?.rating ?? 0);
  const [hover, setHover] = useState(0);
  const [text, setText] = useState(initial?.text ?? "");
  const [authorName, setAuthorName] = useState(initial?.authorName ?? defaultName);
  const [city, setCity] = useState(initial?.city ?? "");
  const [consent, setConsent] = useState(initial?.consent ?? true);
  const [photo, setPhoto] = useState<{ file: File; url: string } | null>(null);
  const [hadPhoto, setHadPhoto] = useState(initial?.hasPhoto ?? false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ low: boolean; code: string | null } | null>(null);
  const [copied, setCopied] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // Превью живёт, пока фото выбрано: при замене, удалении и уходе со страницы память освобождается.
  useEffect(() => () => void (photo && URL.revokeObjectURL(photo.url)), [photo]);

  const choosePhoto = (file: File | null) => {
    if (file && file.size > PHOTO_MAX_BYTES) {
      if (fileInput.current) fileInput.current.value = "";
      return toastError(new Error(m.api.reviewPhotoInvalid));
    }
    setPhoto(file ? { file, url: URL.createObjectURL(file) } : null);
  };

  const locked = !!initial && initial.status !== "new";
  if (locked && !done) return <Thanks t={t} low={false} code={initial.thankYouCode} thankYou={thankYou} lead={t.locked} copied={copied} onCopy={setCopied} />;
  if (done) return <Thanks t={t} low={done.low} code={done.code} thankYou={thankYou} lead={done.low ? t.thanksLow : t.thanksHigh} copied={copied} onCopy={setCopied} />;

  const shown = hover || rating;
  const low = rating > 0 && rating <= 3;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rating) return toastError(new Error(t.chooseRating));
    setBusy(true);
    try {
      const form = new FormData();
      if (token) form.set("t", token);
      form.set("rating", String(rating));
      form.set("text", text);
      form.set("authorName", authorName);
      form.set("city", city);
      form.set("consent", consent ? "1" : "0");
      if (photo) form.set("photo", photo.file);
      else if (initial?.hasPhoto && !hadPhoto) form.set("removePhoto", "1");
      const res = await apiFetch<{ thankYouCode: string | null }>(`/api/reviews/${orderId}`, { method: "POST", body: form });
      setDone({ low, code: res.thankYouCode });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="card space-y-7 p-6 sm:p-8">
      {initial ? <p className="rounded-xl bg-cream/70 px-4 py-2.5 text-sm text-ink-soft">{t.editable}</p> : null}

      <div className="text-center">
        <div role="radiogroup" aria-label={t.ratingAria} className="inline-flex gap-1" onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={rating === n}
              aria-label={`${n} — ${t.ratings[n - 1]}`}
              onClick={() => setRating(n)}
              onMouseEnter={() => setHover(n)}
              className="rounded-full p-1 transition hover:scale-110"
            >
              <Star className={cn("size-10 transition-colors sm:size-12", n <= shown ? "fill-amber-400 text-amber-400" : "text-line")} strokeWidth={1.5} />
            </button>
          ))}
        </div>
        <div className="mt-1 h-6 text-sm font-medium text-ink-soft" aria-live="polite">
          {shown ? t.ratings[shown - 1] : ""}
        </div>
      </div>

      <div>
        <label className="label" htmlFor="review-text">
          {t.textLabel}
        </label>
        <textarea
          id="review-text"
          className="input min-h-36"
          value={text}
          maxLength={TEXT_MAX}
          onChange={(e) => setText(e.target.value)}
          placeholder={low ? t.textLow : t.textHigh}
        />
        <div className="mt-1 text-right text-xs text-muted tabular-nums">
          {text.length} / {TEXT_MAX}
        </div>
      </div>

      <div>
        <span className="label">{t.photo}</span>
        <p className="-mt-1 mb-3 text-sm text-muted">{t.photoHint}</p>
        {photo || hadPhoto ? (
          <div className="flex items-center gap-4">
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photo.url} alt="" className="size-24 rounded-xl object-cover ring-1 ring-line" />
            ) : (
              <span className="inline-flex items-center gap-2 rounded-xl bg-cream/70 px-4 py-3 text-sm">
                <Check className="size-4 text-wine" /> {t.photoAttached}
              </span>
            )}
            <button
              type="button"
              className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"
              onClick={() => {
                choosePhoto(null);
                setHadPhoto(false);
                if (fileInput.current) fileInput.current.value = "";
              }}
            >
              <X className="size-4" /> {t.photoRemove}
            </button>
          </div>
        ) : (
          <button type="button" className="btn btn-outline btn-sm" onClick={() => fileInput.current?.click()}>
            <ImagePlus className="size-4" /> {t.photoChoose}
          </button>
        )}
        <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => choosePhoto(e.target.files?.[0] ?? null)} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="review-name">
            {t.name}
          </label>
          <input id="review-name" className="input" value={authorName} maxLength={40} required onChange={(e) => setAuthorName(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="review-city">
            {t.city}
          </label>
          <input id="review-city" className="input" value={city} maxLength={40} placeholder={t.cityPlaceholder} onChange={(e) => setCity(e.target.value)} />
        </div>
      </div>

      <label className="flex items-start gap-3 text-sm text-ink-soft">
        <input type="checkbox" className="mt-0.5 size-4 accent-wine" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        {t.consent}
      </label>

      <button type="submit" className="btn btn-primary btn-lg w-full" disabled={busy || !rating || !authorName.trim()}>
        {initial ? t.update : t.submit}
      </button>
    </form>
  );
}

function Thanks({
  t,
  low,
  code,
  thankYou,
  lead,
  copied,
  onCopy,
}: {
  t: ReturnType<typeof useMessages>["review"];
  low: boolean;
  code: string | null;
  thankYou: { percent: number; validDays: number };
  lead: string;
  copied: boolean;
  onCopy: (v: boolean) => void;
}) {
  return (
    <div className="card p-8 text-center sm:p-10">
      <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-rose/60 text-wine">
        <Check className="size-7" />
      </div>
      <h2 className="mt-5 font-serif text-3xl font-medium">{t.thanksTitle}</h2>
      <p className="mx-auto mt-3 max-w-md text-muted">{lead}</p>
      {code ? (
        <div className="mx-auto mt-8 max-w-md rounded-2xl border border-dashed border-wine/40 bg-rose/20 p-5 sm:p-6">
          <p className="text-sm font-medium text-balance text-wine">
            <Gift className="mr-1.5 inline size-4 align-[-3px]" />
            {t.promoTitle(thankYou.percent)}
          </p>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
            <code className="rounded-lg bg-white px-4 py-2 font-mono text-lg tracking-wider whitespace-nowrap ring-1 ring-line">{code}</code>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => {
                void navigator.clipboard?.writeText(code);
                onCopy(true);
              }}
            >
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />} {copied ? t.copied : t.copy}
            </button>
          </div>
          <p className="mt-3 text-sm text-muted">{t.promoText(thankYou.validDays)}</p>
        </div>
      ) : null}
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href={code ? `/redeem?code=${code}` : "/books/new"} className="btn btn-primary">
          {t.newBook}
        </Link>
        {!low ? (
          <Link href="/invite" className="btn btn-outline">
            {t.invite}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
