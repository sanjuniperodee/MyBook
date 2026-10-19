"use client";

import { confirmDialog } from "@/components/ui/overlays";
import { useMessages } from "@/i18n/client";
import { cancelOrderAction, claimPaymentAction } from "../actions";
import { PaymentOptions } from "@/components/payments/PaymentOptions";
import type { KaspiInvoiceView } from "@/modules/ordering/ui/kaspi";

/** Оплата заказа: Kaspi, карта или перевод; внизу — отмена заказа (книга снова открывается для правки). */
export function PaymentBlock(props: {
  orderId: string;
  number: number;
  amountLabel: string;
  amount: number;
  currency: string;
  email: string;
  online: { publicId: string } | null;
  manual: { title: string; steps: string[] } | null;
  unavailable: string;
  claimed: boolean;
  /** Оплата через Kaspi Pay подключена: счёт по номеру или QR, подтверждение без менеджера. */
  kaspi: { initial: KaspiInvoiceView | null; defaultPhone: string } | null;
}) {
  const t = useMessages().orders.payment;
  return (
    <PaymentOptions
      t={t}
      number={props.number}
      amount={props.amount}
      amountLabel={props.amountLabel}
      currency={props.currency}
      email={props.email}
      invoiceId={String(props.number)}
      data={{ orderId: props.orderId }}
      online={props.online}
      manual={props.manual}
      unavailable={props.unavailable}
      claimedText={props.claimed ? t.claimed : null}
      onClaim={() => claimPaymentAction(props.orderId)}
      kaspiTarget={{ kind: "order", orderId: props.orderId }}
      kaspi={props.kaspi}
      footer={({ pending, start }) => (
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
      )}
    />
  );
}
