"use client";

import Script from "next/script";
import { useRouter } from "next/navigation";
import { useLocale } from "@/i18n/client";
import { useState, useTransition, type ReactNode, type TransitionStartFunction } from "react";
import { CreditCard, LoaderCircle } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { KaspiPay, type KaspiHints, type KaspiTarget } from "@/components/payments/KaspiPay";
import type { KaspiInvoiceView } from "@/modules/ordering/ui/kaspi";

declare global {
  interface Window {
    cp?: { CloudPayments: new (opts?: { language?: string }) => { pay: (type: string, params: Record<string, unknown>, cb: Record<string, (...a: unknown[]) => void>) => void } };
  }
}

/** Тексты блока оплаты — orders.payment или gift.payment. */
interface PaymentTexts {
  title: string;
  toPay: string;
  loading: string;
  description: (n: number) => string;
  failed: string;
  failedReason: (r: string) => string;
  card: string;
  cardNote?: string;
  sum: string;
  commentLabel: string;
  commentValue: (n: number) => string;
  claim: string;
}

/**
 * Оплата заказа, сертификата или счёта из чата: Kaspi Pay (если подключён), карта через CloudPayments или перевод по
 * реквизитам с кнопкой «Я оплатил(а)». footer — что-то под блоком в той же транзакции (отмена заказа).
 */
export function PaymentOptions(props: {
  t: PaymentTexts;
  number: number;
  amount: number;
  amountLabel: string;
  currency: string;
  /** Почта плательщика для чека CloudPayments; null — не передаём (счёт из чата: контакты клиента странице не нужны). */
  email: string | null;
  /** Номер счёта в CloudPayments и данные для уведомления. */
  invoiceId: string;
  /** AccountId в CloudPayments; по умолчанию — почта. */
  accountId?: string;
  data?: Record<string, unknown>;
  online: { publicId: string } | null;
  /** Перевод по реквизитам компании; null — реквизиты не заданы в «Интеграциях» (перевод не показываем). */
  manual: { title: string; steps: string[] } | null;
  /** Текст, если способов оплаты нет (ни Kaspi, ни карты, ни реквизитов). */
  unavailable?: string;
  /** Покупатель уже сообщил об оплате переводом — текст благодарности; null — ещё нет. */
  claimedText: string | null;
  onClaim: () => Promise<void>;
  kaspiTarget: KaspiTarget;
  kaspi: { initial: KaspiInvoiceView | null; defaultPhone: string; hints?: KaspiHints } | null;
  /** Перевод по реквизитам показывать всегда, а не только когда Kaspi недоступен (счёт из чата: менеджер обещал перевод). */
  manualAlways?: boolean;
  footer?: (ctx: { pending: boolean; start: TransitionStartFunction }) => ReactNode;
}) {
  const { t } = props;
  const router = useRouter();
  const locale = useLocale();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const pay = () => {
    if (!window.cp || !props.online) return setError(t.loading);
    // Виджет CloudPayments понимает «kk» (казахский) и «ru-RU».
    new window.cp.CloudPayments({ language: locale === "kk" ? "kk" : "ru-RU" }).pay(
      "charge",
      {
        publicId: props.online.publicId,
        description: t.description(props.number),
        amount: props.amount,
        currency: props.currency,
        invoiceId: props.invoiceId,
        accountId: props.accountId ?? props.email ?? undefined,
        ...(props.email ? { email: props.email } : {}),
        skin: "mini",
        ...(props.data ? { data: props.data } : {}),
      },
      {
        // Статус обновит серверное уведомление CloudPayments — даём ему пару секунд.
        onSuccess: () => setTimeout(() => router.refresh(), 2500),
        onFail: (reason: unknown) => setError(typeof reason === "string" ? t.failedReason(reason) : t.failed),
      },
    );
  };

  const manualTransfer = props.manual ? (
    <div className="mt-5">
      <div className="font-medium">{props.manual.title}</div>
      <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-[15px] text-ink-soft">
        {props.manual.steps.map((s) => (
          <li key={s}>{s}</li>
        ))}
        <li>
          {t.sum} <b>{props.amountLabel}</b>, {t.commentLabel} <b>{t.commentValue(props.number)}</b>
        </li>
      </ol>
      {props.claimedText !== null ? (
        <Alert kind="success" className="mt-5">
          {props.claimedText}
        </Alert>
      ) : (
        <button className="btn btn-primary btn-lg mt-6" disabled={pending} onClick={() => start(props.onClaim)}>
          {pending ? <LoaderCircle className="size-5 animate-spin" /> : null} {t.claim}
        </button>
      )}
    </div>
  ) : !props.kaspi && !props.online ? (
    <p className="mt-5 text-[15px] text-ink-soft">{props.unavailable}</p>
  ) : null;

  return (
    <section className="card p-6 sm:p-8">
      <h2 className="text-xl font-semibold">{t.title}</h2>
      <p className="mt-1 text-muted">
        {t.toPay} <b className="text-ink">{props.amountLabel}</b>
      </p>
      {error ? <Alert className="mt-4">{error}</Alert> : null}
      {props.kaspi ? <KaspiPay target={props.kaspiTarget} amountLabel={props.amountLabel} defaultPhone={props.kaspi.defaultPhone} initial={props.kaspi.initial} hints={props.kaspi.hints} fallback={props.manualAlways ? null : manualTransfer} /> : null}
      {props.kaspi && !props.online ? null : props.online ? (
        <>
          <Script src="https://widget.cloudpayments.ru/bundles/cloudpayments.js" onReady={() => setReady(true)} />
          <button className="btn btn-primary btn-lg mt-6 w-full sm:w-auto" onClick={pay} disabled={!ready}>
            {ready ? <CreditCard className="size-5" /> : <LoaderCircle className="size-5 animate-spin" />} {t.card}
          </button>
          {t.cardNote ? <p className="mt-3 text-xs text-muted">{t.cardNote}</p> : null}
        </>
      ) : (
        manualTransfer
      )}
      {/* Перевод в дополнение к Kaspi или карте: выше его не показали. */}
      {props.manualAlways && props.manual && (props.kaspi || props.online) ? <div className="mt-6 border-t border-line pt-1">{manualTransfer}</div> : null}
      {props.footer?.({ pending, start })}
    </section>
  );
}
