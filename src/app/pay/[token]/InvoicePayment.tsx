"use client";

import { useMessages } from "@/i18n/client";
import { PaymentOptions } from "@/components/payments/PaymentOptions";
import type { KaspiHints } from "@/components/payments/KaspiPay";
import type { KaspiInvoiceView } from "@/modules/ordering/ui/kaspi";
import { claimDealInvoicePaymentAction } from "../actions";

/**
 * Оплата счёта из чата: Kaspi (счёт на номер или QR), карта, перевод по реквизитам с «Я оплатил(а)». Деньги
 * подтверждает платёжная система или менеджер (перевод); страница сама обновится и покажет «Оплата получена».
 */
export function InvoicePayment(props: {
  token: string;
  number: number;
  amount: number;
  amountLabel: string;
  currency: string;
  online: { publicId: string } | null;
  manual: { title: string; steps: string[] } | null;
  unavailable: string;
  claimed: boolean;
  kaspi: { initial: KaspiInvoiceView | null; defaultPhone: string; hints: KaspiHints } | null;
}) {
  const t = useMessages().pay.payment;
  const label = `P${props.number}`;
  return (
    <PaymentOptions
      t={t}
      number={props.number}
      amount={props.amount}
      amountLabel={props.amountLabel}
      currency={props.currency}
      // Контакты клиента странице не нужны: почту в CloudPayments не передаём, плательщик — номер счёта.
      email={null}
      invoiceId={label}
      accountId={label}
      online={props.online}
      manual={props.manual}
      manualAlways
      unavailable={props.unavailable}
      claimedText={props.claimed ? t.claimed : null}
      onClaim={() => claimDealInvoicePaymentAction(props.token)}
      kaspiTarget={{ kind: "deal_invoice", token: props.token }}
      kaspi={props.kaspi}
    />
  );
}
