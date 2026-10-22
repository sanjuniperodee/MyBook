"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { LoaderCircle, Sparkles, Undo2, X } from "lucide-react";
import { useMessages } from "@/i18n/client";
import { ApiError, apiFetch } from "@/lib/client-api";
import { formatPrice } from "@/config/site";
import { cn } from "@/lib/class-names";
import { Alert } from "@/components/ui/Alert";
import { toast, toastError } from "@/components/ui/overlays";
import { KaspiPay } from "@/components/payments/KaspiPay";
import type { KaspiInvoiceView } from "@/modules/ordering/ui/kaspi";

export interface DesignAiAllowance {
  limit: number;
  remaining: number;
  credits: number;
  resetAt: string;
}

interface Pack {
  id: string;
  requests: number;
  price: number;
  featured: boolean;
}

/** Ответ ИИ-дизайнера: новое оформление страниц (interior + interiorStyle) или обложки (coverTemplate + coverDesign). */
export interface DesignAiResponse {
  reply: string;
  changed: boolean;
  interior?: string;
  interiorStyle?: Record<string, unknown>;
  coverTemplate?: string;
  coverDesign?: unknown;
  allowance: DesignAiAllowance;
}

interface Purchase {
  purchase: { id: string; number: number; requests: number; amount: number };
  kaspi: { initial: KaspiInvoiceView | null; defaultPhone: string } | null;
}

const PROMPT_MAX = 500;

/**
 * ИИ-дизайнер в редакторе: просьба словами → новое оформление (редактор применяет его с отменой). Остаток бесплатных
 * запросов виден заранее, о последнем — предупреждение до отправки; когда они кончились — пакеты с оплатой через Kaspi
 * прямо здесь, не уходя из редактора.
 */
export function DesignAiPanel({
  bookId,
  target,
  payload,
  onApply,
  onUndo,
  editable,
}: {
  bookId: string;
  target: "pages" | "cover";
  /** Текущее оформление из редактора (ещё не обязательно сохранённое) — тело запроса без просьбы. */
  payload: () => Record<string, unknown>;
  onApply: (res: DesignAiResponse) => void;
  /** Вернуть как было до ответа ИИ (шаг отмены редактора). */
  onUndo?: () => void;
  editable: boolean;
}) {
  const t = useMessages().design.ai;
  const [allowance, setAllowance] = useState<DesignAiAllowance | null>(null);
  const [packs, setPacks] = useState<Pack[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<{ prompt: string; reply: string; changed: boolean }[]>([]);
  const [showPacks, setShowPacks] = useState(false);
  const [buying, setBuying] = useState<Purchase | null>(null);
  const [opening, setOpening] = useState<string | null>(null);

  const fetchInfo = useCallback(() => apiFetch<{ allowance: DesignAiAllowance; packs: Pack[] }>(`/api/books/${bookId}/design-ai`), [bookId]);
  const load = async () => {
    try {
      const res = await fetchInfo();
      setAllowance(res.allowance);
      setPacks(res.packs);
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  };
  // Остаток и пакеты — сразу при открытии, до первой просьбы.
  useEffect(() => {
    let alive = true;
    fetchInfo().then(
      (res) => {
        if (!alive) return;
        setAllowance(res.allowance);
        setPacks(res.packs);
      },
      () => alive && setLoadError(true),
    );
    return () => {
      alive = false;
    };
  }, [fetchInfo]);

  const out = !!allowance && allowance.remaining === 0 && allowance.credits === 0;
  const send = async () => {
    const text = prompt.trim();
    if (text.length < 2 || busy || out || !editable) return;
    setBusy(true);
    try {
      const res = await apiFetch<DesignAiResponse>(`/api/books/${bookId}/design-ai`, { method: "POST", json: { target, prompt: text, ...payload() } });
      setAllowance(res.allowance);
      if (res.changed) onApply(res);
      setLog((l) => [...l.slice(-5), { prompt: text, reply: res.reply || (res.changed ? "" : t.noChange), changed: res.changed }]);
      setPrompt("");
    } catch (e) {
      if (e instanceof ApiError && e.code === "designAiLimit") {
        await load();
        setShowPacks(true);
      } else toastError(e);
    } finally {
      setBusy(false);
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

  const resetTime = allowance ? new Date(allowance.resetAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Almaty" }) : "";
  // Предупреждение до отправки: сколько осталось и откуда спишется этот запрос.
  const notice = !allowance
    ? null
    : allowance.remaining === 0 && allowance.credits > 0
      ? t.fromCredits(allowance.credits)
      : allowance.remaining === 1 && allowance.credits === 0
        ? t.lastFree
        : allowance.remaining > 1 && allowance.remaining <= 2 && allowance.credits === 0
          ? t.lowFree(allowance.remaining)
          : null;
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

      {log.length ? (
        <ol className="space-y-2 text-sm">
          {log.map((x, i) => (
            <li key={i} className="space-y-1.5">
              <p className="ml-8 rounded-2xl rounded-br-md bg-ink/5 px-3 py-2">{x.prompt}</p>
              <p className="mr-8 rounded-2xl rounded-bl-md bg-rose/60 px-3 py-2 text-ink-soft">
                <span className="sr-only">{t.ai}: </span>
                {x.reply}
              </p>
            </li>
          ))}
        </ol>
      ) : null}
      {last?.changed && onUndo ? (
        <button type="button" onClick={onUndo} disabled={!editable || busy} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
          <Undo2 className="size-3.5" /> {t.undo}
        </button>
      ) : null}

      {out ? (
        <div className="space-y-3 rounded-2xl border border-wine/20 bg-rose/40 p-4" data-testid="design-ai-out">
          <div>
            <p className="font-medium">{t.outTitle}</p>
            <p className="mt-1 text-sm text-ink-soft">{t.outText}</p>
          </div>
          <Packs packs={packs} opening={opening} onBuy={buy} />
          <p className="text-xs text-muted">{t.resetAt(resetTime)}</p>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value.slice(0, PROMPT_MAX))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void send();
              }}
              rows={3}
              maxLength={PROMPT_MAX}
              disabled={!editable || busy}
              placeholder={t.placeholder[target]}
              aria-label={t.title}
              className="input min-h-24 w-full resize-y py-2.5 text-[15px]"
            />
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted">{t.examplesLabel}</span>
              {t.examples[target].map((ex) => (
                <button key={ex} type="button" disabled={!editable || busy} onClick={() => setPrompt(ex)} className="rounded-full bg-white px-2.5 py-1 text-xs text-ink-soft ring-1 ring-line hover:ring-ink/30">
                  {ex}
                </button>
              ))}
            </div>
          </div>
          {notice ? (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900" role="status" data-testid="design-ai-warning">
              {notice}
            </p>
          ) : allowance ? (
            <p className="text-xs text-muted">{t.dailyNote(allowance.limit)}</p>
          ) : null}
          <button type="button" className="btn btn-primary w-full" disabled={!editable || busy || prompt.trim().length < 2 || !allowance} onClick={() => void send()}>
            {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />} {busy ? t.thinking : t.send}
          </button>
          {showPacks ? <Packs packs={packs} opening={opening} onBuy={buy} /> : null}
        </>
      )}

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
