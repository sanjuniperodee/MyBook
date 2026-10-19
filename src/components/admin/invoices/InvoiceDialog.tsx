"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Copy, LoaderCircle, TriangleAlert, X } from "lucide-react";
import { invoiceFormInfoAction, issueInvoiceAction, type InvoiceFormInfo, type InvoiceResult } from "@/app/admin/invoices/actions";
import { channels, manualChannels } from "@/shared/domain/channels";
import { formatPrice } from "@/config/site";
import { toast } from "@/components/ui/overlays";
import { cn } from "@/lib/class-names";
import { discountProblem, giftOptions, invoicePreview, pickAmount, amountOptions, type AmountKind } from "./model";
import type { AgreementGift } from "@/shared/domain/agreementGifts";

/** Скопировать ссылку или текст счёта; не вышло (старый браузер, нет прав) — подсказать выделить вручную. */
export async function copyText(text: string, done: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast(done);
  } catch {
    toast("Не удалось скопировать — выделите текст и скопируйте вручную", "error");
  }
}

type Loaded = { kind: "loading" } | { kind: "error"; message: string } | { kind: "form"; info: InvoiceFormInfo };

/**
 * «Счёт» из чата или сделки: форма договорённости и суммы, выпуск — одним нажатием. issueKey создаёт открывший диалог
 * (crypto.randomUUID() на каждое открытие): повторное нажатие или повтор запроса вернёт тот же счёт, а не выпустит второй.
 */
export function InvoiceDialog({ issueKey, dealId = null, conversationId = null, onClose }: { issueKey: string; dealId?: string | null; conversationId?: string | null; onClose: () => void }) {
  const [state, setState] = useState<Loaded>({ kind: "loading" });

  useEffect(() => {
    let alive = true;
    invoiceFormInfoAction({ dealId: dealId ?? "", conversationId: conversationId ?? "" }).then(
      (r) => alive && setState(r.ok ? { kind: "form", info: r.info } : { kind: "error", message: r.message }),
      (e: unknown) => alive && setState({ kind: "error", message: (e instanceof Error && e.message) || "Не удалось открыть форму счёта" }),
    );
    return () => {
      alive = false;
    };
  }, [dealId, conversationId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/30 p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="invoice-title">
      <div className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 text-sm shadow-xl" data-testid="invoice-dialog">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id="invoice-title" className="text-base font-semibold">
            Счёт на оплату{state.kind === "form" && state.info.dealNumber ? ` · сделка №${state.info.dealNumber}` : ""}
          </h2>
          <button type="button" onClick={onClose} aria-label="Закрыть" className="text-muted hover:text-ink">
            <X className="size-4" />
          </button>
        </div>
        {state.kind === "loading" ? (
          <p className="flex items-center gap-2 py-6 text-muted">
            <LoaderCircle className="size-4 animate-spin" /> Загружаем договорённость и способы оплаты…
          </p>
        ) : state.kind === "error" ? (
          <p className="rounded-xl bg-red-50 p-3 text-red-800">{state.message}</p>
        ) : (
          <InvoiceForm info={state.info} issueKey={issueKey} conversationId={conversationId} onClose={onClose} />
        )}
      </div>
    </div>
  );
}

const noMethodsText = "Нет способа оплаты: подключите Kaspi или укажите реквизиты перевода в «Интеграциях»";

/** Форма счёта по данным invoiceFormInfoAction. Отдельно от диалога — её рисуют тесты. */
export function InvoiceForm({ info, issueKey, conversationId = null, onClose }: { info: InvoiceFormInfo; issueKey: string; conversationId?: string | null; onClose: () => void }) {
  const router = useRouter();
  const priceOf = (id: string) => info.plans.find((p) => p.id === id)?.price ?? 0;
  const [plan, setPlan] = useState(info.plan ?? "");
  // Цена договорённости — из сделки; пока её нет — прайс выбранного тарифа (меняется вместе с тарифом, пока не правили руками).
  const [agreed, setAgreed] = useState(info.agreedTotal > 0 ? String(info.agreedTotal) : info.plan && priceOf(info.plan) ? String(priceOf(info.plan)) : "");
  const [agreedTouched, setAgreedTouched] = useState(info.agreedTotal > 0);
  const [count, setCount] = useState(String(info.batchSize ?? 1));
  const [kind, setKind] = useState<AmountKind>("remainder");
  const [custom, setCustom] = useState("");
  const [locale, setLocale] = useState(info.locale);
  const [channel, setChannel] = useState(info.channel);
  const [name, setName] = useState(info.clientName);
  // Кассир Kaspi отключён — счёт на номер не выставится, поэтому по умолчанию не отмечаем.
  const [kaspiPush, setKaspiPush] = useState(!!info.kaspiPhoneMasked && !info.kaspiWarning);
  // Что по договорённости бесплатно — из сделки; менеджер отмечает сам, ничего не включается по умолчанию.
  const [gifts, setGifts] = useState<AgreementGift[]>(info.gifts);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Extract<InvoiceResult, { ok: true }> | null>(null);

  if (info.hasOrder)
    return (
      <div className="space-y-3" data-testid="invoice-has-order">
        <p className="rounded-xl bg-emerald-50 p-3 text-emerald-900">По сделке уже оформлен заказ — счёт не нужен: оплата и остаток идут в заказе.</p>
        {info.orderId ? (
          <Link href={`/admin/orders/${info.orderId}`} className="btn btn-sm inline-flex">
            Открыть заказ
          </Link>
        ) : null}
      </div>
    );
  if (info.closed) return <p className="rounded-xl bg-amber-50 p-3 text-amber-900">Сделка закрыта — верните её в работу, чтобы выставить счёт.</p>;
  if (result) return <IssuedResult result={result} onClose={onClose} />;

  const agreedNum = Number(agreed);
  const agreedOk = Number.isInteger(agreedNum) && agreedNum > 0;
  const countNum = info.batchSize ?? Math.max(1, Math.min(20, Math.floor(Number(count) || 1)));
  const totalNum = agreedOk ? agreedNum * countNum : 0; // договорённость по всем книгам счёта
  const options = amountOptions(totalNum, info.paid);
  const picked = agreedOk ? pickAmount(kind, totalNum, info.paid, custom) : { error: "Укажите цену книги по договорённости" };
  const discount = discountProblem(priceOf(plan), agreedOk ? agreedNum : 0, info.maxDiscountPercent);
  const noMethods = !info.methods.kaspi && !info.methods.card && !info.methods.transfer;
  const problem = noMethods ? noMethodsText : !plan ? "Выберите тариф договорённости" : "error" in picked ? picked.error : !channel ? "Укажите, откуда пришёл клиент" : discount;
  const methods = [info.methods.kaspi && "Kaspi", info.methods.card && "картой", info.methods.transfer && "переводом по реквизитам"].filter(Boolean).join(" · ");
  // Бесплатным можно отметить только то, что есть у выбранного тарифа (у электронной книги нет упаковки и доставки).
  const giftChoices = giftOptions(info.plans.find((p) => p.id === plan));
  const chosenGifts = gifts.filter((g) => giftChoices.includes(g));
  const preview =
    plan && "amount" in picked
      ? invoicePreview({ locale, clientName: name, plan, books: countNum, purpose: picked.purpose, amount: picked.amount, link: info.preview.link[locale], until: info.preview.until[locale], kaspiPhone: kaspiPush ? info.kaspiPhoneMasked : null, gifts: chosenGifts })
      : null;

  const submit = async () => {
    if (problem || !("amount" in picked)) return setError(problem ?? null);
    setBusy(true);
    setError(null);
    try {
      const r = await issueInvoiceAction({ dealId: info.dealId ?? "", conversationId: conversationId ?? "", clientName: name, locale, channel, plan, agreedTotal: agreedNum, count: countNum, amount: picked.amount, purpose: picked.purpose, issueKey, kaspiPush: !!info.kaspiPhoneMasked && kaspiPush, gifts: chosenGifts });
      if (!r.ok) return setError(r.message);
      setResult(r);
      router.refresh();
    } catch (e) {
      setError((e instanceof Error && e.message) || "Не удалось выставить счёт");
    } finally {
      setBusy(false);
    }
  };

  const amountChoice = (k: AmountKind, label: string, hint: string | null, disabled = false) => (
    <label className={cn("flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2", kind === k ? "border-ink bg-cream/60" : "border-line", disabled && "cursor-not-allowed opacity-50")}>
      <input type="radio" name="invoice-amount" checked={kind === k} disabled={disabled} onChange={() => setKind(k)} />
      <span className="flex-1">{label}</span>
      {hint ? <span className="tabular-nums text-muted">{hint}</span> : null}
    </label>
  );

  return (
    <div className="space-y-3" data-testid="invoice-form">
      {noMethods ? (
        <p className="flex items-start gap-2 rounded-xl bg-red-50 p-3 text-red-800" role="alert">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span>
            {noMethodsText}.{" "}
            <Link href="/admin/settings?tab=payments" className="underline">
              Открыть интеграции
            </Link>
          </span>
        </p>
      ) : null}
      {info.kaspiWarning ? (
        <p className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-amber-900" role="status" data-testid="invoice-kaspi-warning">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span>{info.kaspiWarning}</span>
        </p>
      ) : null}
      {info.open ? (
        <p className="rounded-xl bg-amber-50 p-3 text-amber-900" data-testid="invoice-open-warning">
          Открыт счёт {info.open.label} на {formatPrice(info.open.amount)} — новый счёт его заменит: прежняя ссылка перестанет работать.
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-1 block text-[11px] text-muted">Тариф договорённости</span>
          <select
            className="input h-10 w-full text-sm"
            value={plan}
            onChange={(e) => {
              setPlan(e.target.value);
              if (!agreedTouched && priceOf(e.target.value)) setAgreed(String(priceOf(e.target.value)));
            }}
            aria-label="Тариф договорённости"
          >
            <option value="" disabled>
              выберите тариф
            </option>
            {info.plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label} — {formatPrice(p.price)}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] text-muted">{countNum > 1 ? "Цена одной книги по договорённости, ₸" : "Цена книги по договорённости, ₸"}</span>
          <input
            className="input h-10 w-full"
            type="number"
            min={1}
            step={100}
            value={agreed}
            onChange={(e) => {
              setAgreed(e.target.value);
              setAgreedTouched(true);
            }}
            aria-label="Цена книги по договорённости"
          />
        </label>
      </div>
      {giftChoices.length ? (
        <fieldset className="rounded-xl border border-line px-3 py-2" data-testid="invoice-gifts">
          <legend className="px-1 text-[11px] text-muted">Бесплатно по договорённости</legend>
          <div className="flex flex-wrap gap-x-5 gap-y-1.5">
            {giftChoices.map((g) => (
              <label key={g} className="flex items-center gap-2">
                <input type="checkbox" checked={chosenGifts.includes(g)} onChange={(e) => setGifts((l) => (e.target.checked ? [...l.filter((x) => x !== g), g] : l.filter((x) => x !== g)))} aria-label={g === "giftwrap" ? "Подарочная упаковка бесплатно" : "Доставка бесплатно"} />
                <span>
                  {g === "giftwrap" ? "Подарочная упаковка" : "Доставка"}
                  <span className="text-muted"> · {formatPrice(g === "giftwrap" ? info.giftPrices.giftwrap : info.giftPrices.delivery)}{g === "delivery" ? " и меньше" : ""}</span>
                </span>
              </label>
            ))}
          </div>
          <span className="mt-1 block text-[11px] text-muted">Не отмечено — клиент платит по прайсу. Отмеченное клиент выбирает при оформлении сам, и оно стоит 0 ₸; в счёте и сообщении будет строка «Бесплатно по договорённости».</span>
        </fieldset>
      ) : null}
      <label className="block">
        <span className="mb-1 block text-[11px] text-muted">Сколько книг оплачивает счёт</span>
        <input className="input h-10 w-32" type="number" min={1} max={20} step={1} value={info.batchSize ?? count} disabled={!!info.batchSize} onChange={(e) => setCount(e.target.value)} aria-label="Количество книг" />
        <span className="mt-1 block text-[11px] text-muted">{info.batchSize ? `Сделка уже пакет из ${info.batchSize} книг — счёт на весь пакет.` : countNum > 1 ? `Сумма договорённости: ${countNum} × ${formatPrice(agreedNum || 0)} = ${formatPrice(totalNum)}. Для остальных книг создадим отдельные сделки — клиент оформит их по очереди.` : "Одна книга. Если клиент платит сразу за несколько — укажите количество."}</span>
      </label>
      {discount ? (
        <p className="rounded-xl bg-red-50 p-2.5 text-xs text-red-800" data-testid="invoice-discount">
          {discount}
        </p>
      ) : info.maxDiscountPercent !== null ? (
        <p className="text-[11px] text-muted">Скидка от прайса тарифа — не больше {info.maxDiscountPercent}%: ниже цену согласует руководитель.</p>
      ) : null}
      <p className="text-xs text-muted">
        Оплачено по сделке: {formatPrice(info.paid)} · остаток по договорённости: {formatPrice(options.left)}
      </p>

      <fieldset className="space-y-1.5">
        <legend className="mb-1 text-[11px] text-muted">Сколько платить сейчас</legend>
        {options.prepayment ? amountChoice("prepayment", "Предоплата 50%", formatPrice(options.prepayment)) : null}
        {amountChoice("remainder", info.paid > 0 ? "Остаток" : "Полная оплата", options.left > 0 ? formatPrice(options.left) : null, options.left <= 0)}
        {amountChoice("custom", "Своя сумма", null, options.left <= 0)}
        {kind === "custom" ? <input className="input h-10 w-full" type="number" min={1} max={options.left || undefined} step={100} value={custom} onChange={(e) => setCustom(e.target.value)} placeholder={`От 1 до ${formatPrice(options.left)}`} aria-label="Своя сумма" /> : null}
      </fieldset>

      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-1 block text-[11px] text-muted">Имя клиента</span>
          <input className="input h-10 w-full" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} aria-label="Имя клиента" />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] text-muted">Откуда пришёл клиент</span>
          <select className="input h-10 w-full text-sm" value={channel} onChange={(e) => setChannel(e.target.value)} aria-label="Откуда пришёл клиент">
            <option value="" disabled>
              выберите
            </option>
            {manualChannels.map((k) => (
              <option key={k} value={k}>
                {channels[k]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-[11px] text-muted">Язык счёта и кабинета</span>
        {(["ru", "kk"] as const).map((l) => (
          <label key={l} className="flex items-center gap-1.5">
            <input type="radio" name="invoice-locale" checked={locale === l} onChange={() => setLocale(l)} />
            {l === "ru" ? "русский" : "казахский"}
          </label>
        ))}
      </div>
      {info.kaspiPhoneMasked ? (
        <label className="flex items-start gap-2 rounded-xl border border-line px-3 py-2">
          <input type="checkbox" className="mt-0.5" checked={kaspiPush} onChange={(e) => setKaspiPush(e.target.checked)} />
          <span>
            Счёт Kaspi на номер клиента {info.kaspiPhoneMasked}
            <span className="block text-[11px] text-muted">Придёт в приложение Kaspi; номер — из чата WhatsApp.</span>
          </span>
        </label>
      ) : null}
      <p className="text-xs text-muted">
        {methods ? `Клиент сможет оплатить: ${methods}. ` : ""}
        {info.chat ? `Счёт уйдёт клиенту в чат ${info.chat}.` : "Чата с клиентом нет — после выпуска скопируйте ссылку и отправьте её сами."}
      </p>
      {preview ? (
        <div>
          <div className="mb-1 text-[11px] text-muted">Клиент получит</div>
          <pre className="rounded-xl bg-[#f4efe7] p-3 font-sans text-xs whitespace-pre-wrap" data-testid="invoice-preview">
            {preview}
          </pre>
        </div>
      ) : null}
      {error ? <p className="text-xs text-red-700" role="alert">{error}</p> : null}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
          Отмена
        </button>
        <button type="button" className="btn btn-primary btn-sm" disabled={busy || !!problem} title={problem ?? undefined} onClick={() => void submit()}>
          {busy ? <LoaderCircle className="size-4 animate-spin" /> : null} Выставить счёт{"amount" in picked ? ` на ${formatPrice(picked.amount)}` : ""}
        </button>
      </div>
    </div>
  );
}

/** После выпуска: ушло в чат — сказать об этом; не ушло или чата нет — ссылка и текст для копирования. */
function IssuedResult({ result, onClose }: { result: Extract<InvoiceResult, { ok: true }>; onClose: () => void }) {
  return (
    <div className="space-y-3" data-testid="invoice-issued">
      <p className={cn("rounded-xl p-3", result.sent ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900")}>{result.message}</p>
      <div className="flex gap-2">
        <input readOnly value={result.link} className="input h-9 min-w-0 flex-1 text-xs" aria-label="Ссылка на оплату" onFocus={(e) => e.target.select()} />
        <button type="button" className="btn btn-outline btn-sm shrink-0" onClick={() => void copyText(result.link, "Ссылка скопирована")}>
          <Copy className="size-4" /> Ссылка
        </button>
      </div>
      {!result.sent ? (
        <div className="space-y-2">
          <textarea readOnly value={result.text} rows={6} className="input w-full py-2 text-xs" aria-label="Текст счёта" onFocus={(e) => e.target.select()} />
          <button type="button" className="btn btn-outline btn-sm" onClick={() => void copyText(result.text, "Текст скопирован")}>
            <Copy className="size-4" /> Скопировать текст
          </button>
        </div>
      ) : null}
      <div className="flex justify-end">
        <button type="button" className="btn btn-primary btn-sm" onClick={onClose}>
          Готово
        </button>
      </div>
    </div>
  );
}
