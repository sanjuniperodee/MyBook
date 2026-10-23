"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, LoaderCircle, Sparkles, Undo2, Wand2, X } from "lucide-react";
import { useMessages } from "@/i18n/client";
import { ApiError, apiFetch } from "@/lib/client-api";
import { formatPrice } from "@/config/site";
import { cn } from "@/lib/class-names";
import type { DesignOp } from "@/lib/book/design-ai/ops";
import { Alert } from "@/components/ui/Alert";
import { toast, toastError } from "@/components/ui/overlays";
import { KaspiPay } from "@/components/payments/KaspiPay";
import type { KaspiInvoiceView } from "@/modules/ordering/ui/kaspi";

export interface DesignAiAllowance {
  limit: number;
  remaining: number;
  credits: number;
}

interface Pack {
  id: string;
  requests: number;
  price: number;
  featured: boolean;
}

/** Готовое оформление от ИИ: страниц (interior + interiorStyle) или обложки (coverTemplate + coverDesign). */
export interface DesignPatch {
  interior?: string;
  interiorStyle?: Record<string, unknown>;
  coverTemplate?: string;
  coverDesign?: unknown;
}

type Mode = "edit" | "create" | "variants" | "review";
const MODES: Mode[] = ["edit", "create", "variants", "review"];

type Answer =
  | { mode: "edit"; reply: string; concept?: string; changed: boolean; patch: DesignPatch; allowance: DesignAiAllowance }
  | { mode: "create"; reply: string; concept?: string; changed: boolean; patch: DesignPatch; allowance: DesignAiAllowance }
  | { mode: "variants"; reply: string; variants: { name: string; idea: string; patch: DesignPatch }[]; allowance: DesignAiAllowance }
  | { mode: "review"; score: number; summary: string; strengths: string[]; tips: { title: string; why: string; ops: DesignOp[]; patch: DesignPatch | null }[]; allowance: DesignAiAllowance };

interface Purchase {
  purchase: { id: string; number: number; requests: number; amount: number };
  kaspi: { initial: KaspiInvoiceView | null; defaultPhone: string } | null;
}

const PROMPT_MAX = 500;

/**
 * ИИ-дизайнер в редакторе. Три режима: «Изменить» (просьба словами, с памятью о прошлых просьбах), «3 варианта»
 * (превью трёх направлений, выбор одним нажатием) и «Оценить дизайн» (балл, сильные стороны и советы, каждый
 * применяется кнопкой). Остаток бесплатных запросов виден заранее, о последнем — предупреждение до отправки; когда
 * они кончились — пакеты с оплатой через Kaspi прямо здесь, не уходя из редактора.
 */
export function DesignAiPanel({
  bookId,
  target,
  payload,
  onApply,
  applyOps,
  onUndo,
  renderPreview,
  previewMin = 140,
  editable,
}: {
  bookId: string;
  target: "pages" | "cover";
  /** Текущее оформление из редактора (ещё не обязательно сохранённое) — тело запроса без просьбы. */
  payload: () => Record<string, unknown>;
  /** Поставить готовое оформление (ответ на правку, выбранный вариант) — одним шагом отмены. */
  onApply: (patch: DesignPatch) => void;
  /** Применить совет к текущему оформлению (советы складываются); false — не получилось. */
  applyOps: (ops: DesignOp[]) => boolean;
  /** Вернуть как было до ответа ИИ (шаг отмены редактора). */
  onUndo?: () => void;
  /** Превью варианта: разворот или обложка. */
  renderPreview: (patch: DesignPatch, key: string) => ReactNode;
  /** Минимальная ширина карточки варианта, px. */
  previewMin?: number;
  editable: boolean;
}) {
  const t = useMessages().design.ai;
  const [allowance, setAllowance] = useState<DesignAiAllowance | null>(null);
  const [packs, setPacks] = useState<Pack[]>([]);
  const [book, setBook] = useState<{ theme: string; hasPhotos: boolean } | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [mode, setMode] = useState<Mode>("edit");
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState<Mode | null>(null);
  const [log, setLog] = useState<{ prompt: string; reply: string; concept?: string; changed: boolean }[]>([]);
  const [variants, setVariants] = useState<{ reply: string; items: { name: string; idea: string; patch: DesignPatch }[]; picked: number | null } | null>(null);
  const [review, setReview] = useState<(Extract<Answer, { mode: "review" }> & { applied: number[] }) | null>(null);
  const [showPacks, setShowPacks] = useState(false);
  const [buying, setBuying] = useState<Purchase | null>(null);
  const [opening, setOpening] = useState<string | null>(null);

  type Info = { allowance: DesignAiAllowance; packs: Pack[]; theme: string; hasPhotos: boolean };
  const fetchInfo = useCallback(() => apiFetch<Info>(`/api/books/${bookId}/design-ai`), [bookId]);
  const take = (res: Info) => {
    setAllowance(res.allowance);
    setPacks(res.packs);
    setBook({ theme: res.theme, hasPhotos: res.hasPhotos });
  };
  const load = async () => {
    try {
      take(await fetchInfo());
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  };
  // Остаток, пакеты и тема книги — сразу при открытии, до первой просьбы.
  useEffect(() => {
    let alive = true;
    fetchInfo().then(
      (res) => {
        if (!alive) return;
        setAllowance(res.allowance);
        setPacks(res.packs);
        setBook({ theme: res.theme, hasPhotos: res.hasPhotos });
      },
      () => alive && setLoadError(true),
    );
    return () => {
      alive = false;
    };
  }, [fetchInfo]);

  const out = !!allowance && allowance.remaining === 0 && allowance.credits === 0;
  const text = prompt.trim();
  const canSend = !!allowance && !busy && !out && editable && (mode !== "edit" || text.length >= 2);

  const send = async () => {
    if (!canSend) return;
    const asked = text.length >= 2 ? text : mode === "variants" ? t.variantsDefault : mode === "create" ? t.createDefault : text;
    setBusy(mode);
    try {
      const history = mode === "edit" || mode === "create" ? log.filter((x) => x.changed).slice(-4).map((x) => ({ prompt: x.prompt, reply: x.reply })) : [];
      const res = await apiFetch<Answer>(`/api/books/${bookId}/design-ai`, { method: "POST", json: { target, mode, prompt: asked, history, ...payload() } });
      setAllowance(res.allowance);
      if (res.mode === "edit" || res.mode === "create") {
        if (res.changed) onApply(res.patch);
        setLog((l) => [...l.slice(-5), { prompt: asked, reply: res.reply || (res.changed ? "" : t.noChange), concept: res.concept || undefined, changed: res.changed }]);
      } else if (res.mode === "variants") setVariants({ reply: res.reply, items: res.variants, picked: null });
      else setReview({ ...res, applied: [] });
      setPrompt("");
    } catch (e) {
      if (e instanceof ApiError && e.code === "designAiLimit") {
        await load();
        setShowPacks(true);
      } else toastError(e);
    } finally {
      setBusy(null);
    }
  };

  const buy = async (pack: Pack) => {
    setOpening(pack.id);
    try {
      setBuying(await apiFetch<Purchase>("/api/design-ai/packs", { method: "POST", json: { packId: pack.id } }));
    } catch (e) {
      toastError(e);
    } finally {
      setOpening(null);
    }
  };

  // Предупреждение до отправки: сколько осталось и откуда спишется этот запрос.
  const notice = !allowance
    ? null
    : allowance.remaining === 0 && allowance.credits > 0
      ? t.fromCredits(allowance.credits)
      : allowance.remaining === 1 && allowance.credits === 0
        ? t.lastFree
        : allowance.remaining === 2 && allowance.credits === 0
          ? t.lowFree(allowance.remaining)
          : null;
  const ideas =
    mode === "create"
      ? [...t.drawIdeas[target].slice(0, 3), ...(book && t.themeIdeas[book.theme] ? [t.themeIdeas[book.theme][target]] : [])]
      : [
          ...(book && t.themeIdeas[book.theme] ? [t.themeIdeas[book.theme][target]] : []),
          ...(book?.hasPhotos ? [t.photoIdea] : []),
          t.matchIdea[target],
          ...t.examples[target].slice(0, 2),
          ...t.drawIdeas[target].slice(0, 1),
        ];
  const last = log.at(-1);

  return (
    <div className="space-y-4" data-testid="design-ai">
      <div>
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <Sparkles className="size-4 text-wine" /> {t.title}
        </h3>
        <p className="mt-1 text-sm text-muted">{t.lead[target]}</p>
      </div>

      {loadError ? <Alert>{t.loadFailed}</Alert> : null}

      {allowance ? (
        <div className="flex flex-wrap items-center gap-2 text-xs" data-testid="design-ai-allowance">
          <span className={cn("rounded-full px-2.5 py-1 font-medium", allowance.remaining > 1 ? "bg-emerald-50 text-emerald-800" : allowance.remaining === 1 ? "bg-amber-50 text-amber-900" : "bg-ink/5 text-ink-soft")}>{t.left(allowance.remaining, allowance.limit)}</span>
          {allowance.credits > 0 ? <span className="rounded-full bg-wine/10 px-2.5 py-1 font-medium text-wine">{t.credits(allowance.credits)}</span> : null}
          {!out && packs.length ? (
            <button type="button" className="text-muted underline-offset-4 hover:text-ink hover:underline" onClick={() => setShowPacks((v) => !v)}>
              {showPacks ? t.hidePacks : t.buyMore}
            </button>
          ) : null}
        </div>
      ) : null}

      {out ? (
        <div className="space-y-3 rounded-2xl border border-wine/20 bg-rose/40 p-4" data-testid="design-ai-out">
          <div>
            <p className="font-medium">{t.outTitle}</p>
            <p className="mt-1 text-sm text-ink-soft">{t.outText}</p>
          </div>
          <ul className="space-y-1 text-sm">
            {t.perks.map((p) => (
              <li key={p} className="flex items-start gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-wine" /> {p}
              </li>
            ))}
          </ul>
          <Packs packs={packs} opening={opening} onBuy={buy} />
        </div>
      ) : (
        <>
          <div role="tablist" aria-label={t.modesAria} className="grid grid-cols-2 gap-1 rounded-2xl bg-cream/80 p-1 sm:grid-cols-4">
            {MODES.map((k) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={mode === k}
                disabled={!!busy}
                onClick={() => setMode(k)}
                className={cn("min-h-9 rounded-xl px-2 py-1.5 text-xs leading-tight transition sm:text-sm", mode === k ? "bg-white font-medium text-ink shadow-soft" : "text-muted hover:text-ink")}
              >
                {t.modes[k]}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted">{t.modeHint[mode]}</p>

          <div className="space-y-2">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value.slice(0, PROMPT_MAX))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void send();
              }}
              rows={mode === "review" ? 2 : 3}
              maxLength={PROMPT_MAX}
              disabled={!editable || !!busy}
              placeholder={mode === "edit" ? t.placeholder[target] : mode === "create" ? t.createPlaceholder[target] : mode === "variants" ? t.variantsPlaceholder[target] : t.reviewPlaceholder}
              aria-label={t.modes[mode]}
              className="input min-h-16 w-full resize-y py-2.5 text-[15px]"
            />
            {mode !== "review" ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-muted">{t.examplesLabel}</span>
                {ideas.map((ex) => (
                  <button key={ex} type="button" disabled={!editable || !!busy} onClick={() => setPrompt(ex)} className="rounded-full bg-white px-2.5 py-1 text-xs text-ink-soft ring-1 ring-line hover:ring-ink/30">
                    {ex}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          {notice ? (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900" role="status" data-testid="design-ai-warning">
              {notice}
            </p>
          ) : allowance ? (
            <p className="text-xs text-muted">{t.freeNote(allowance.limit)}</p>
          ) : null}
          <button type="button" className="btn btn-primary w-full" disabled={!canSend} onClick={() => void send()} data-testid="design-ai-send">
            {busy ? <LoaderCircle className="size-4 animate-spin" /> : mode === "review" ? <Wand2 className="size-4" /> : <Sparkles className="size-4" />} {busy ? t.thinking[busy] : t.send[mode]}
          </button>
          {showPacks ? <Packs packs={packs} opening={opening} onBuy={buy} /> : null}
        </>
      )}

      {/* Правки: беседа с дизайнером. */}
      {(mode === "edit" || mode === "create") && log.length ? (
        <ol className="space-y-2 text-sm">
          {log.map((x, i) => (
            <li key={i} className="space-y-1.5">
              <p className="ml-8 rounded-2xl rounded-br-md bg-ink/5 px-3 py-2">{x.prompt}</p>
              <p className="mr-8 rounded-2xl rounded-bl-md bg-rose/60 px-3 py-2 text-ink-soft">
                <span className="sr-only">{t.ai}: </span>
                {x.concept ? (
                  <>
                    <b className="font-medium text-ink">{t.concept}:</b> {x.concept}
                    <br />
                  </>
                ) : null}
                {x.reply}
              </p>
            </li>
          ))}
        </ol>
      ) : null}
      {(mode === "edit" || mode === "create") && last?.changed && onUndo ? (
        <button type="button" onClick={onUndo} disabled={!editable || !!busy} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
          <Undo2 className="size-3.5" /> {t.undo}
        </button>
      ) : null}

      {/* Три варианта. */}
      {mode === "variants" && variants ? (
        <section className="space-y-3" data-testid="design-ai-variants" aria-label={t.variantsTitle}>
          <div>
            <h4 className="text-sm font-semibold">{t.variantsTitle}</h4>
            {variants.reply ? <p className="mt-0.5 text-xs text-muted">{variants.reply}</p> : null}
          </div>
          {variants.items.length ? (
            <ul className="grid gap-3" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(min(${previewMin}px, 100%), 1fr))` }}>
              {variants.items.map((v, i) => (
                <li key={i} className={cn("flex flex-col gap-2 rounded-2xl bg-white p-2 ring-1 transition", variants.picked === i ? "ring-2 ring-wine" : "ring-line")}>
                  <button
                    type="button"
                    disabled={!editable}
                    onClick={() => {
                      onApply(v.patch);
                      setVariants((s) => (s ? { ...s, picked: i } : s));
                    }}
                    className="overflow-hidden rounded-lg"
                    aria-label={`${t.pick}: ${v.name}`}
                  >
                    {renderPreview(v.patch, `v${i}`)}
                  </button>
                  <div className="px-1">
                    <div className="text-sm font-medium">{v.name}</div>
                    <p className="text-xs text-muted">{v.idea}</p>
                  </div>
                  <button
                    type="button"
                    disabled={!editable}
                    className={cn("btn btn-sm mt-auto", variants.picked === i ? "btn-primary" : "btn-outline")}
                    onClick={() => {
                      onApply(v.patch);
                      setVariants((s) => (s ? { ...s, picked: i } : s));
                    }}
                  >
                    {variants.picked === i ? (
                      <>
                        <Check className="size-4" /> {t.picked}
                      </>
                    ) : (
                      t.pick
                    )}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <Alert kind="info">{t.noVariants}</Alert>
          )}
        </section>
      ) : null}

      {/* Оценка дизайна. */}
      {mode === "review" && review ? (
        <section className="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-line" data-testid="design-ai-review" aria-label={t.scoreLabel}>
          <div className="flex items-center gap-3">
            <ScoreRing score={review.score} label={t.score(review.score)} />
            <p className="text-sm text-ink-soft">{review.summary}</p>
          </div>
          {review.strengths.length ? (
            <div>
              <h4 className="text-xs font-semibold tracking-wide text-muted uppercase">{t.strengths}</h4>
              <ul className="mt-1 space-y-1 text-sm">
                {review.strengths.map((s) => (
                  <li key={s} className="flex items-start gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" /> {s}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {review.tips.length ? (
            <div>
              <h4 className="text-xs font-semibold tracking-wide text-muted uppercase">{t.tips}</h4>
              <ul className="mt-1 space-y-2">
                {review.tips.map((tip, i) => {
                  const done = review.applied.includes(i);
                  return (
                    <li key={i} className="rounded-xl bg-cream/70 p-3">
                      <div className="text-sm font-medium">{tip.title}</div>
                      <p className="mt-0.5 text-xs text-ink-soft">{tip.why}</p>
                      {tip.ops.length && tip.patch ? (
                        <button
                          type="button"
                          disabled={!editable || done}
                          className={cn("btn btn-sm mt-2", done ? "btn-ghost" : "btn-outline")}
                          onClick={() => {
                            if (applyOps(tip.ops)) setReview((r) => (r ? { ...r, applied: [...r.applied, i] } : r));
                          }}
                        >
                          {done ? (
                            <>
                              <Check className="size-4" /> {t.applied}
                            </>
                          ) : (
                            <>
                              <Wand2 className="size-4" /> {t.apply}
                            </>
                          )}
                        </button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      {buying ? (
        <PayDialog
          purchase={buying}
          onClose={() => setBuying(null)}
          onPaid={async () => {
            toast(t.paid(buying.purchase.requests));
            setBuying(null);
            setShowPacks(false);
            await load();
          }}
        />
      ) : null}
    </div>
  );
}

/** Балл кольцом: заполнение по оценке, цвет — от янтарного к зелёному. */
function ScoreRing({ score, label }: { score: number; label: string }) {
  const r = 22;
  const c = 2 * Math.PI * r;
  const color = score >= 8 ? "#059669" : score >= 6 ? "#B45309" : "#9F1239";
  return (
    <div className="relative size-14 shrink-0" role="img" aria-label={label}>
      <svg viewBox="0 0 56 56" className="size-14 -rotate-90">
        <circle cx="28" cy="28" r={r} fill="none" stroke="currentColor" strokeWidth="5" className="text-ink/10" />
        <circle cx="28" cy="28" r={r} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round" strokeDasharray={`${(c * score) / 10} ${c}`} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-lg font-semibold" style={{ color }}>
        {score}
      </span>
    </div>
  );
}

function Packs({ packs, opening, onBuy }: { packs: Pack[]; opening: string | null; onBuy: (p: Pack) => void }) {
  const t = useMessages().design.ai;
  return (
    <ul className="space-y-2" data-testid="design-ai-packs">
      {packs.map((p) => (
        <li key={p.id} className={cn("flex items-center gap-3 rounded-2xl bg-white px-3 py-2.5 ring-1", p.featured ? "ring-2 ring-wine" : "ring-line")}>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="font-medium">{t.packTitle(p.requests)}</span>
              {p.featured ? <span className="rounded-full bg-wine px-2 py-0.5 text-[10px] font-semibold text-white uppercase">{t.featured}</span> : null}
            </div>
            <div className="text-xs text-muted">
              <b className="text-sm font-semibold text-ink">{formatPrice(p.price)}</b> · {t.perRequest(formatPrice(Math.round(p.price / p.requests)))}
            </div>
          </div>
          <button type="button" className={cn("btn btn-sm shrink-0", p.featured ? "btn-primary" : "btn-outline")} disabled={!!opening} onClick={() => onBuy(p)}>
            {opening === p.id ? <LoaderCircle className="size-4 animate-spin" /> : null} {t.buy}
          </button>
        </li>
      ))}
    </ul>
  );
}

function PayDialog({ purchase, onClose, onPaid }: { purchase: Purchase; onClose: () => void; onPaid: () => void }) {
  const t = useMessages().design.ai;
  const { purchase: p, kaspi } = purchase;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-6" role="dialog" aria-modal="true" aria-label={t.payTitle(p.requests)} data-testid="design-ai-pay">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{t.payTitle(p.requests)}</h2>
            <p className="mt-0.5 text-2xl font-semibold">{formatPrice(p.amount)}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={t.close} className="flex size-9 items-center justify-center rounded-full hover:bg-ink/5">
            <X className="size-4" />
          </button>
        </div>
        {kaspi ? (
          <KaspiPay
            target={{ kind: "ai_pack", purchaseId: p.id }}
            amountLabel={formatPrice(p.amount)}
            defaultPhone={kaspi.defaultPhone}
            initial={kaspi.initial}
            fallback={null}
            hints={{ note: t.payNote(p.number), paid: t.paid(p.requests) }}
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
