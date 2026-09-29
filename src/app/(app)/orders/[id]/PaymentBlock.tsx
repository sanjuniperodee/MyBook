"use client";

import { confirmDialog } from "@/components/ui/overlays";
import Script from "next/script";
import { useRouter } from "next/navigation";
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
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [scriptReady, setScriptReady] = useState(false);

  const payOnline = () => {
    if (!window.cp || !props.online) return setError("Платёжный модуль ещё загружается, попробуйте через секунду.");
    const widget = new window.cp.CloudPayments({ language: "ru-RU" });
    widget.pay(
      "charge",
      {
        publicId: props.online.publicId,
        description: `Персональная книга, заказ №${props.number}`,
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
        onFail: (reason: unknown) => setError(typeof reason === "string" ? `Оплата не прошла: ${reason}` : "Оплата не прошла"),
      },
    );
  };

  return (
    <section className="card p-6 sm:p-8">
      <h2 className="text-xl font-semibold">Оплата</h2>
      <p className="mt-1 text-muted">К оплате: <b className="text-ink">{props.amountLabel}</b></p>
      {error ? <Alert className="mt-4">{error}</Alert> : null}
      {props.online ? (
        <>
          <Script src="https://widget.cloudpayments.ru/bundles/cloudpayments.js" onReady={() => setScriptReady(true)} />
          <button className="btn btn-primary btn-lg mt-6 w-full sm:w-auto" onClick={payOnline} disabled={!scriptReady}>
            {scriptReady ? <CreditCard className="size-5" /> : <LoaderCircle className="size-5 animate-spin" />} Оплатить картой
          </button>
          <p className="mt-3 text-xs text-muted">Оплата через защищённую платёжную страницу CloudPayments. Visa, Mastercard, Apple Pay, Google Pay.</p>
        </>
      ) : (
        <div className="mt-5">
          <div className="font-medium">{props.manual.title}</div>
          <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-[15px] text-ink-soft">
            {props.manual.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
            <li>
              Сумма: <b>{props.amountLabel}</b>, комментарий: <b>Заказ {props.number}</b>
            </li>
          </ol>
          {props.claimed ? (
            <Alert kind="success" className="mt-5">Спасибо! Мы проверим поступление оплаты и подтвердим заказ — обычно в течение часа в рабочее время.</Alert>
          ) : (
            <button className="btn btn-primary btn-lg mt-6" disabled={pending} onClick={() => start(() => claimPaymentAction(props.orderId))}>
              {pending ? <LoaderCircle className="size-5 animate-spin" /> : null} Я оплатил(а)
            </button>
          )}
        </div>
      )}
      <div className="mt-8 border-t border-line pt-5">
        <button
          className="text-sm text-muted underline underline-offset-4 hover:text-red-700"
          disabled={pending}
          onClick={async () => {
            if (await confirmDialog({ title: "Отменить заказ?", text: "Книгу снова можно будет редактировать и оформить заказ заново.", confirmLabel: "Отменить заказ", cancelLabel: "Оставить", danger: true }))
              start(() => cancelOrderAction(props.orderId));
          }}
        >
          Отменить заказ и вернуться к редактированию
        </button>
      </div>
    </section>
  );
}
