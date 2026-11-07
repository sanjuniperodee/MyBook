"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { SidePanel } from "@/components/admin/SidePanel";
import { Alert } from "@/components/ui/Alert";
import { Field } from "@/components/ui/Field";
import { toast } from "@/components/ui/overlays";
import { formatPrice, getPlans } from "@/config/site";
import { planLabels } from "@/modules/ordering/ui/labels";
import { upgradeOrderToPrintedAction } from "@/app/admin/actions";

const fileCls = "block w-full text-sm file:mr-3 file:rounded-[var(--r-ctl)] file:border file:border-line-strong file:bg-white file:px-3 file:py-1.5 file:text-sm file:text-ink";

/** Кому и что возвращаем: сделка (роут платежей сделки, чек обязателен) или заказ (журнал денег заказа, чек по желанию). */
export interface RefundTarget {
  kind: "deal" | "order";
  id: string;
  /** «Сделка Д12», «Заказ №34» — в заголовок панели. */
  label: string;
  /** Сколько предлагаем вернуть (сумма случая); можно меньше — частичный возврат. */
  amount: number;
  /** Верхняя граница поля; правила денег всё равно проверяет сервер. */
  max?: number;
}

/**
 * «Вернуть клиенту»: сумма (по умолчанию — весь случай, можно часть), причина и чек перевода. Возврат по сделке идёт в
 * роут платежей сделки — те же правила и лимиты, что в карточке сделки (чек обязателен); по заказу — в журнал денег заказа
 * (чек по желанию). Успех — тост и обновление страницы: решённый случай уходит из очереди.
 */
export function RefundPanel({ target, open, onClose, onDone }: { target: RefundTarget; open: boolean; onClose: () => void; onDone?: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const receiptRequired = target.kind === "deal";
  const submit = (form: HTMLFormElement) =>
    start(async () => {
      setError(null);
      const body = new FormData(form);
      const amount = Number(body.get("amount"));
      if (!Number.isInteger(amount) || amount <= 0) return setError("Укажите сумму возврата в тенге");
      if (String(body.get("note") ?? "").trim().length < 3) return setError("Укажите причину возврата");
      const file = body.get("file");
      if (receiptRequired && !(file instanceof File && file.size)) return setError("Приложите чек возврата");
      if (target.kind === "deal") body.set("kind", "refund");
      const url = target.kind === "deal" ? `/api/admin/deals/${target.id}/payments` : `/api/admin/orders/${target.id}/refunds`;
      try {
        const res = await fetch(url, { method: "POST", body });
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          message?: string;
        };
        if (!res.ok) return setError(data.message ?? data.error ?? "Не удалось оформить возврат");
      } catch {
        return setError("Нет связи — попробуйте ещё раз");
      }
      toast(`Возврат ${formatPrice(amount)} оформлен`);
      onClose();
      onDone?.();
      router.refresh();
    });
  return (
    <SidePanel open={open} onClose={onClose} title="Вернуть клиенту" description={`${target.label}: можно вернуть всю сумму или часть`}>
      <form
        className="space-y-4"
        data-testid="refund-panel"
        onSubmit={(e) => {
          e.preventDefault();
          submit(e.currentTarget);
        }}
      >
        <Field label="Сумма, ₸" hint={target.max ? `Не больше ${formatPrice(target.max)}` : undefined}>
          <input name="amount" type="number" inputMode="numeric" min={1} max={target.max} step={1} required defaultValue={target.amount} className="input tabular-nums" />
        </Field>
        <Field label="Причина" hint="Попадёт в журнал и в «Проверить»: например, «вернули часть, остальное зачли»">
          <textarea name="note" required minLength={3} maxLength={300} rows={3} className="input" />
        </Field>
        <Field label="Чек возврата" hint="Скриншот, фото или PDF перевода до 12 МБ" optional={!receiptRequired}>
          <input name="file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" required={receiptRequired} className={fileCls} />
        </Field>
        {error ? <Alert>{error}</Alert> : null}
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-dark" disabled={pending}>
            {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : null} Оформить возврат
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Отмена
          </button>
        </div>
      </form>
    </SidePanel>
  );
}

/**
 * «Перевести в печатную»: оплаченная электронная версия — в печатный тариф (по умолчанию твёрдая обложка). Полученные деньги
 * засчитываются; точные «зачтено» и «к доплате» считает сервер (промокод заказа и предоплата по сделке остаются).
 */
export function UpgradePanel({ order, open, onClose }: { order: { id: string; number: number; received: number }; open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const printed = getPlans().filter((p) => p.printed);
  const [plan, setPlan] = useState<string>(printed.find((p) => p.id === "hardcover")?.id ?? printed[0]?.id ?? "");
  const price = printed.find((p) => p.id === plan)?.price ?? 0;
  const submit = () =>
    start(async () => {
      setError(null);
      const r: { ok?: string; error?: string } = await upgradeOrderToPrintedAction(order.id, plan).catch(() => ({ error: "Не удалось перевести — недостаточно прав или нет связи" }));
      if (r.error) return setError(r.error);
      toast(r.ok ?? "Заказ переведён в печатную");
      onClose();
      router.refresh();
    });
  return (
    <SidePanel open={open} onClose={onClose} title="Перевести в печатную" description={`Заказ №${order.number}: электронная версия станет печатной книгой`}>
      <div className="space-y-4" data-testid="upgrade-panel">
        <Field label="Печатный тариф">
          <select value={plan} onChange={(e) => setPlan(e.target.value)} className="input">
            {printed.map((p) => (
              <option key={p.id} value={p.id}>
                {planLabels[p.id] ?? p.id} — {formatPrice(p.price)}
              </option>
            ))}
          </select>
        </Field>
        <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1.5 text-sm">
          <dt className="text-muted">Цена по прайсу</dt>
          <dd className="text-right tabular-nums">{formatPrice(price)}</dd>
          <dt className="text-muted">Получено по заказу</dt>
          <dd className="text-right tabular-nums">{formatPrice(order.received)}</dd>
          <dt className="text-muted">{order.received >= price ? "Останется переплата" : "Останется доплатить"}</dt>
          <dd className="text-right font-semibold tabular-nums">{formatPrice(Math.abs(price - order.received))}</dd>
        </dl>
        <p className="text-xs text-muted">
          Деньги, уже полученные по заказу, засчитаются; промокод заказа и предоплата по сделке останутся. Хватает денег — заказ остаётся оплаченным и идёт в печать. Не хватает — заказ ждёт доплату, в
          печать — после оплаты. Доставку укажите в «Правке данных» заказа.
        </p>
        {error ? <Alert>{error}</Alert> : null}
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-dark" disabled={pending || !plan} onClick={submit}>
            {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : null} Перевести в печатную
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Отмена
          </button>
        </div>
      </div>
    </SidePanel>
  );
}
