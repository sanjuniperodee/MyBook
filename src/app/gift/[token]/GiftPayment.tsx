"use client";

import { useMessages } from "@/i18n/client";
import { claimGiftPaymentAction } from "../actions";
import { PaymentOptions } from "@/components/payments/PaymentOptions";
import type { KaspiInvoiceView } from "@/modules/ordering/ui/kaspi";

/** Оплата сертификата: Kaspi, карта или перевод; сертификат приходит на почту после подтверждения оплаты. */
export function GiftPayment(props: {
  token: string;
  number: number;
  amount: number;
  amountLabel: string;
  currency: string;
  email: string;
  online: { publicId: string } | null;
  manual: { title: string; steps: string[] } | null;
  unavailable: string;
  claimed: boolean;
  /** Оплата через Kaspi Pay подключена: сертификат выпускается сам после оплаты. */
  kaspi: { initial: KaspiInvoiceView | null; defaultPhone: string } | null;
}) {
  const t = useMessages().gift.payment;
  return (
    <PaymentOptions
      t={t}
      number={props.number}
      amount={props.amount}
      amountLabel={props.amountLabel}
      currency={props.currency}
      email={props.email}
      invoiceId={`G${props.number}`}
      online={props.online}
      manual={props.manual}
      unavailable={props.unavailable}
      claimedText={props.claimed ? t.claimed(props.email) : null}
      onClaim={() => claimGiftPaymentAction(props.token)}
      kaspiTarget={{ kind: "gift", token: props.token }}
      kaspi={props.kaspi}
    />
  );
}
