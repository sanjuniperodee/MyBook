"use client";

import { confirmDialog } from "@/components/ui/overlays";
import Script from "next/script";
import { useRouter } from "next/navigation";
import { useLocale, useMessages } from "@/i18n/client";
import { useState, useTransition } from "react";
import { CreditCard, LoaderCircle } from "lucide-react";
import { cancelOrderAction, claimPaymentAction } from "../actions";
import { Alert } from "@/components/ui/Alert";

declare global {
  interface Window {
    cp?: { CloudPayments: new (opts?: { language?: string }) => { pay: (type: string, params: Record<string, unknown>, cb: Record<string, (...a: unknown[]) => void>) => void } };
  }
}

export function PaymentBlock(props: {
  orderId: string;
  number: number;
  amountLabel: string;
  amount: number;
  currency: string;
  email: string;
  online: { publicId: string } | null;
  manual: { title: string; steps: string[] };
  claimed: boolean;
}) {
  const router = useRouter();
  const t = useMessages().orders.payment;
  const locale = useLocale();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [scriptReady, setScriptReady] = useState(false);

  const payOnline = () => {
    if (!window.cp || !props.online) return setError(t.loading);
    // Виджет CloudPayments понимает «kk» (казахский) и «ru-RU».
    const widget = new window.cp.CloudPayments({ language: locale === "kk" ? "kk" : "ru-RU" });
    widget.pay(
      "charge",
      {
        publicId: props.online.publicId,
        description: t.description(props.number),
        amount: props.amount,
        currency: props.currency,
        invoiceId: String(props.number),
        accountId: props.email,
        email: props.email,
        skin: "mini",
        data: { orderId: props.orderId },
      },
      {
        onSuccess: () => {
          // Статус обновит серверное уведомление CloudPayments — даём ему пару секунд.
          setTimeout(() => router.refresh(), 2500);
        },
        onFail: (reason: unknown) => setError(typeof reason === "string" ? t.failedReason(reason) : t.failed),
      },
    );
  };

  return (
    <section className="card p-6 sm:p-8">
      <h2 className="text-xl font-semibold">{t.title}</h2>
      <p className="mt-1 text-muted">{t.toPay} <b className="text-ink">{props.amountLabel}</b></p>
      {error ? <Alert className="mt-4">{error}</Alert> : null}
      {props.online ? (
        <>
          <Script src="https://widget.cloudpayments.ru/bundles/cloudpayments.js" onReady={() => setScriptReady(true)} />
          <button className="btn btn-primary btn-lg mt-6 w-full sm:w-auto" onClick={payOnline} disabled={!scriptReady}>
            {scriptReady ? <CreditCard className="size-5" /> : <LoaderCircle className="size-5 animate-spin" />} {t.card}
          </button>
          <p className="mt-3 text-xs text-muted">{t.cardNote}</p>
        </>
      ) : (
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
          {props.claimed ? (
            <Alert kind="success" className="mt-5">{t.claimed}</Alert>
          ) : (
            <button className="btn btn-primary btn-lg mt-6" disabled={pending} onClick={() => start(() => claimPaymentAction(props.orderId))}>
              {pending ? <LoaderCircle className="size-5 animate-spin" /> : null} {t.claim}
            </button>
          )}
        </div>
      )}
      <div className="mt-8 border-t border-line pt-5">
        <button
          className="text-sm text-muted underline underline-offset-4 hover:text-red-700"
          disabled={pending}
          onClick={async () => {
            if (await confirmDialog({ title: t.cancelTitle, text: t.cancelText, confirmLabel: t.cancelConfirm, cancelLabel: t.cancelKeep, danger: true }))
              start(() => cancelOrderAction(props.orderId));
          }}
        >
          {t.cancel}
        </button>
      </div>
    </section>
  );
}
