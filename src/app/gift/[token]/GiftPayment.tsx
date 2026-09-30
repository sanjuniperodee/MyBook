"use client";

import Script from "next/script";
import { useRouter } from "next/navigation";
import { useLocale, useMessages } from "@/i18n/client";
import { useState, useTransition } from "react";
import { CreditCard, LoaderCircle } from "lucide-react";
import { claimGiftPaymentAction } from "../actions";
import { Alert } from "@/components/ui/Alert";

export function GiftPayment(props: {
  token: string;
  number: number;
  amount: number;
  amountLabel: string;
  currency: string;
  email: string;
  online: { publicId: string } | null;
  manual: { title: string; steps: string[] };
  claimed: boolean;
}) {
  const router = useRouter();
  const t = useMessages().gift.payment;
  const locale = useLocale();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const pay = () => {
    if (!window.cp || !props.online) return setError(t.loading);
    new window.cp.CloudPayments({ language: locale === "kk" ? "kk" : "ru-RU" }).pay(
      "charge",
      {
        publicId: props.online.publicId,
        description: t.description(props.number),
        amount: props.amount,
        currency: props.currency,
        invoiceId: `G${props.number}`,
        accountId: props.email,
        email: props.email,
        skin: "mini",
      },
      {
        onSuccess: () => setTimeout(() => router.refresh(), 2500),
        onFail: (reason: unknown) => setError(typeof reason === "string" ? t.failedReason(reason) : t.failed),
      },
    );
  };

  return (
    <section className="card p-6 sm:p-8">
      <h2 className="text-xl font-semibold">{t.title}</h2>
      <p className="mt-1 text-muted">
        {t.toPay} <b className="text-ink">{props.amountLabel}</b>
      </p>
      {error ? <Alert className="mt-4">{error}</Alert> : null}
      {props.online ? (
        <>
          <Script src="https://widget.cloudpayments.ru/bundles/cloudpayments.js" onReady={() => setReady(true)} />
          <button className="btn btn-primary btn-lg mt-6 w-full sm:w-auto" onClick={pay} disabled={!ready}>
            {ready ? <CreditCard className="size-5" /> : <LoaderCircle className="size-5 animate-spin" />} {t.card}
          </button>
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
            <Alert kind="success" className="mt-5">
              {t.claimed(props.email)}
            </Alert>
          ) : (
            <button className="btn btn-primary btn-lg mt-6" disabled={pending} onClick={() => start(() => claimGiftPaymentAction(props.token))}>
              {pending ? <LoaderCircle className="size-5 animate-spin" /> : null} {t.claim}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
