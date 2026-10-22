"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, LoaderCircle, QrCode, Smartphone } from "lucide-react";
import { useMessages } from "@/i18n/client";
import { ApiError, apiFetch } from "@/lib/client-api";
import { formatPhone } from "@/shared/domain/phone";
import { Alert } from "@/components/ui/Alert";
import type { KaspiInvoiceView as InvoiceView } from "@/modules/ordering/ui/kaspi";

export type KaspiTarget = { kind: "order"; orderId: string } | { kind: "gift"; token: string } | { kind: "deal_invoice"; token: string } | { kind: "ai_pack"; purchaseId: string };

/** Подсказки блока для оплаты по ссылке: получатель и комментарий, номер по умолчанию (с маской) — тексты уже на языке страницы. */
export interface KaspiHints {
  /** «Получатель — ИП …, комментарий — MyBooks P12». */
  note?: string | null;
  /** «Оставьте поле пустым — счёт придёт на номер +7 701 ••• •• 67». */
  phoneHint?: string | null;
  phonePlaceholder?: string | null;
  /** Текст после оплаты вместо «Подтверждаем заказ…». */
  paid?: string | null;
}

/** Как часто спрашиваем о счёте, пока клиент платит в приложении Kaspi. */
const POLL_MS = 3_000;

/** Сертификат — ?token=, счёт из чата — ?pay= (без входа: плательщика не уводит на страницу входа). */
function invoiceUrl(target: KaspiTarget, id: string) {
  const query = target.kind === "gift" ? `?token=${encodeURIComponent(target.token)}` : target.kind === "deal_invoice" ? `?pay=${encodeURIComponent(target.token)}` : "";
  return `/api/payments/kaspi/invoices/${id}${query}`;
}

function requestBody(target: KaspiTarget, method: "invoice" | "qr", phone: string) {
  switch (target.kind) {
    case "order":
      return { target: "order", orderId: target.orderId, method, phone };
    case "gift":
      return { target: "gift", token: target.token, method, phone };
    case "deal_invoice":
      // Пустое поле — номер из счёта (его знает только сервер).
      return { target: "deal_invoice", token: target.token, method, phone: phone.trim() || undefined };
    case "ai_pack":
      return { target: "ai_pack", purchaseId: target.purchaseId, method, phone };
  }
}

/** Номер в счёте: свой — красиво, чужой (счёт из чата) уже с маской «+7 701 ••• •• 67». */
const shownPhone = (phone: string | null) => (phone?.includes("•") ? phone : formatPhone(phone) || phone || "");

function timeLeft(expiresAt: string | null, now: number) {
  if (!expiresAt) return null;
  const s = Math.max(0, Math.floor((new Date(expiresAt).getTime() - now) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Оплата через Kaspi Pay: счёт в приложение по номеру телефона или QR-код. Пока счёт ждёт, страница опрашивает его
 * статус; после оплаты заказ подтверждается сам (вебхук или сверка), без менеджера. Если Kaspi недоступен —
 * показываем запасной способ (перевод по номеру и «Я оплатил(а)»).
 */
export function KaspiPay({
  target,
  amountLabel,
  defaultPhone,
  initial,
  fallback,
  hints,
  onPaid,
}: {
  target: KaspiTarget;
  amountLabel: string;
  defaultPhone: string;
  initial: InvoiceView | null;
  fallback: ReactNode;
  hints?: KaspiHints;
  /** Что сделать после оплаты вместо обновления страницы (оплата внутри редактора — его состояние не терять). */
  onPaid?: () => void;
}) {
  const t = useMessages().common.kaspiPay;
  const router = useRouter();
  const [invoice, setInvoice] = useState<InvoiceView | null>(initial);
  const [phone, setPhone] = useState(formatPhone(defaultPhone) || defaultPhone);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; unavailable: boolean } | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const pending = invoice?.status === "pending";
  useEffect(() => {
    if (!pending || !invoice) return;
    const timer = setInterval(async () => {
      setNow(Date.now());
      if (document.visibilityState !== "visible") return;
      try {
        const res = await apiFetch<{ invoice: InvoiceView }>(invoiceUrl(target, invoice.id));
        setInvoice(res.invoice);
        if (res.invoice.status === "paid") setTimeout(() => (onPaid ? onPaid() : router.refresh()), 1200);
      } catch {
        // Сеть мигнула — спросим на следующем шаге.
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [pending, invoice, target, router, onPaid]);

  const issue = async (method: "invoice" | "qr") => {
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch<{ invoice: InvoiceView }>("/api/payments/kaspi/invoices", { method: "POST", json: requestBody(target, method, phone) });
      setInvoice(res.invoice);
    } catch (e) {
      const code = e instanceof ApiError ? e.code : undefined;
      setError({ text: e instanceof Error ? e.message : String(e), unavailable: code === "kaspiUnavailable" || code === "kaspiNotConnected" });
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    if (invoice?.status === "pending") await apiFetch(invoiceUrl(target, invoice.id), { method: "DELETE" }).catch(() => {});
    setInvoice(null);
  };

  const left = timeLeft(invoice?.expiresAt ?? null, now);
  const closed = invoice && invoice.status !== "pending" && invoice.status !== "paid" ? t[invoice.status] : null;

  return (
    <div className="mt-5 space-y-4">
      <div className="font-medium">{t.title}</div>
      {hints?.note ? <p className="text-sm text-muted">{hints.note}</p> : null}
      {error ? <Alert>{error.text}</Alert> : null}

      {invoice?.status === "paid" ? <Alert kind="success">{hints?.paid || t.paid}</Alert> : null}

      {pending && invoice.method === "invoice" ? (
        <div className="space-y-3 rounded-2xl bg-cream p-4 text-[15px]">
          <p className="font-medium">{t.sent(amountLabel, shownPhone(invoice.phone))}</p>
          <p className="text-ink-soft">{t.sentSteps}</p>
        </div>
      ) : null}

      {pending && invoice.method === "qr" && invoice.qrSvg ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-cream p-4 text-center sm:flex-row sm:text-left">
          {/* SVG собран на сервере библиотекой qrcode из ссылки Kaspi — только пути, без текста извне. */}
          <div className="size-48 shrink-0 rounded-xl bg-white p-2" dangerouslySetInnerHTML={{ __html: invoice.qrSvg }} />
          <p className="text-[15px] text-ink-soft">{t.scanQr}</p>
        </div>
      ) : null}

      {pending ? (
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
          <LoaderCircle className="size-4 animate-spin" /> {t.waiting}
          {left ? <span>· {t.timeLeft(left)}</span> : null}
        </div>
      ) : null}

      {pending && invoice.link ? (
        <a href={invoice.link} target="_blank" rel="noopener noreferrer" className="btn btn-primary w-full sm:w-auto">
          <ExternalLink className="size-4" /> {t.openKaspi}
        </a>
      ) : null}

      {closed ? <Alert kind="info">{closed}</Alert> : null}

      {!invoice || closed ? (
        <div className="space-y-3">
          <label className="block">
            <span className="text-sm text-muted">{t.phoneLabel}</span>
            <input className="input mt-1 h-12 w-full sm:max-w-xs" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={hints?.phonePlaceholder || "+7 7XX XXX XX XX"} />
          </label>
          {hints?.phoneHint ? <p className="text-xs text-muted">{hints.phoneHint}</p> : null}
          <p className="text-xs text-muted">{t.invoiceNote}</p>
          <div className="flex flex-wrap gap-3">
            <button className="btn btn-primary btn-lg" disabled={busy} onClick={() => issue("invoice")}>
              {busy ? <LoaderCircle className="size-5 animate-spin" /> : <Smartphone className="size-5" />} {closed ? t.again : t.sendInvoice}
            </button>
            <button className="btn btn-outline btn-lg" disabled={busy} onClick={() => issue("qr")}>
              <QrCode className="size-5" /> {t.payByQr}
            </button>
          </div>
        </div>
      ) : null}

      {pending ? (
        <button className="text-sm text-muted underline underline-offset-4" onClick={reset}>
          {t.change}
        </button>
      ) : null}

      {/* Запасной способ — если он есть (у счёта из чата перевод и так показан ниже). */}
      {error?.unavailable && fallback ? (
        <div className="border-t border-line pt-4">
          <p className="mb-2 text-sm text-muted">{t.otherWay}</p>
          {fallback}
        </div>
      ) : null}
    </div>
  );
}
