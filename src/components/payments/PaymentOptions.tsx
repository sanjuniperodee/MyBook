"use client";

import Script from "next/script";
import { useRouter } from "next/navigation";
import { useLocale, useMessages } from "@/i18n/client";
import { useState, useTransition, type ReactNode, type TransitionStartFunction } from "react";
import { CreditCard, Landmark, LoaderCircle, Smartphone } from "lucide-react";
import { cn } from "@/lib/class-names";
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

  const pm = useMessages().bookStudio.pay;
  const manualBlock = props.manual ? (
    <div>
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
        <button className="btn btn-dark btn-lg mt-5" disabled={pending} onClick={() => start(props.onClaim)}>
          {pending ? <LoaderCircle className="size-5 animate-spin" /> : null} {t.claim}
        </button>
      )}
    </div>
  ) : null;

  // Способы оплаты: Kaspi, карта, перевод. Перевод — отдельный способ, если он единственный или его просили показывать всегда;
  // иначе он остаётся запасным (внутри Kaspi, если тот недоступен).
  const methods: { id: "kaspi" | "card" | "transfer"; label: string; icon: typeof Smartphone }[] = [];
  if (props.kaspi) methods.push({ id: "kaspi", label: pm.kaspi, icon: Smartphone });
  if (props.online) methods.push({ id: "card", label: pm.card, icon: CreditCard });
  if (manualBlock && (props.manualAlways || methods.length === 0)) methods.push({ id: "transfer", label: pm.transfer, icon: Landmark });
  const [picked, setPicked] = useState<string | null>(null);
  const method = methods.find((m) => m.id === picked)?.id ?? methods[0]?.id ?? null;

  return (
    <section className="panel p-5 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-1">
        <h2 className="text-xl font-semibold">{t.title}</h2>
        <p className="text-muted">
          {t.toPay} <b className="font-serif text-2xl font-medium text-ink tabular-nums">{props.amountLabel}</b>
        </p>
      </header>
      {error ? <Alert className="mt-4">{error}</Alert> : null}
      {props.online ? <Script src="https://widget.cloudpayments.ru/bundles/cloudpayments.js" onReady={() => setReady(true)} /> : null}

      {methods.length > 1 ? (
        <div role="tablist" aria-label={pm.method} className="mt-5 flex flex-wrap gap-2">
          {methods.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              id={`pay-tab-${id}`}
              aria-selected={method === id}
              aria-controls={`pay-panel-${id}`}
              onClick={() => setPicked(id)}
              className={cn("flex min-h-11 items-center gap-2 rounded-[10px] border px-4 text-sm font-medium transition-colors", method === id ? "border-wine bg-rose/25 text-ink ring-2 ring-wine/15" : "border-line-strong bg-white text-ink-soft hover:border-ink/35")}
            >
              <Icon className="size-4" aria-hidden /> {label}
            </button>
          ))}
        </div>
      ) : null}

      {method === "kaspi" && props.kaspi ? (
        <div role={methods.length > 1 ? "tabpanel" : undefined} id="pay-panel-kaspi" aria-labelledby={methods.length > 1 ? "pay-tab-kaspi" : undefined}>
          <KaspiPay target={props.kaspiTarget} amountLabel={props.amountLabel} defaultPhone={props.kaspi.defaultPhone} initial={props.kaspi.initial} hints={props.kaspi.hints} fallback={props.manualAlways ? null : manualBlock} />
        </div>
      ) : null}
      {method === "card" && props.online ? (
        <div role={methods.length > 1 ? "tabpanel" : undefined} id="pay-panel-card" aria-labelledby={methods.length > 1 ? "pay-tab-card" : undefined} className="mt-5">
          <button className="btn btn-primary btn-lg w-full sm:w-auto" onClick={pay} disabled={!ready}>
            {ready ? <CreditCard className="size-5" /> : <LoaderCircle className="size-5 animate-spin" />} {t.card}
          </button>
          {t.cardNote ? <p className="mt-3 text-xs text-muted">{t.cardNote}</p> : null}
        </div>
      ) : null}
      {method === "transfer" ? (
        <div role={methods.length > 1 ? "tabpanel" : undefined} id="pay-panel-transfer" aria-labelledby={methods.length > 1 ? "pay-tab-transfer" : undefined} className="mt-5">
          {manualBlock}
        </div>
      ) : null}
      {method === null ? <p className="mt-5 text-[15px] text-ink-soft">{props.unavailable}</p> : null}
      {props.footer?.({ pending, start })}
    </section>
  );
}
