"use client";

import Link from "next/link";
import { AgreementGiftsField } from "@/components/admin/AgreementGiftsField";
import { useActionState, useState } from "react";
import { CircleCheck, Paperclip } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { Field } from "@/components/ui/Field";
import { cn } from "@/lib/class-names";
import { createClientDealsAction, type ClientDealsState } from "@/app/admin/clients/new/actions";
import { PartsReceipts } from "@/app/admin/clients/new/PartsReceipts";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Alert } from "@/components/ui/Alert";
import { formatPrice, getVisiblePlans } from "@/config/site";
import { PlanDiscountHint } from "@/components/admin/DiscountHint";
import { ruCount } from "@/i18n/plural";

const planLabels: Record<string, string> = { digital: "Электронная версия", hardcover: "Твёрдая обложка", premium: "Премиум" };

/**
 * Сделки существующему клиенту «по договорённости»: клиент оплатил сразу несколько книг или менеджер договорился о цене и тарифе.
 * По сделке на книгу; предоплата делится поровну, один чек уходит ко всем платежам.
 */
export function ClientDealsForm({ stages, defaultStageId, admins, me, canAssign, client, maxDiscountPercent = null }: { stages: { id: string; name: string }[]; defaultStageId?: string; admins: { id: string; label: string }[]; me: string; canAssign: boolean; client: { id: string; name: string }; /** Лимит скидки сотрудника от прайса, %; null — без лимита. */ maxDiscountPercent?: number | null }) {
  const [state, action] = useActionState<ClientDealsState, FormData>(createClientDealsAction, {});
  const [receipt, setReceipt] = useState<File | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [agreed, setAgreed] = useState("");
  const [planId, setPlanId] = useState("");
  const [prepaid, setPrepaid] = useState("");
  const [count, setCount] = useState("1");
  const v = state.values ?? {};
  const n = Math.max(1, Math.min(20, Math.floor(Number(count) || 1)));
  const price = Number(agreed) || 0;
  const total = price * n;
  const p = Number(prepaid) || 0;

  if (state.done) {
    const d = state.done;
    return (
      <Panel className="border-success/30" title={<span className="flex items-center gap-2"><CircleCheck className="size-5 text-success" aria-hidden />{d.parts.length > 1 ? `Создано ${ruCount(d.parts.length, "сделка", "сделки", "сделок")}` : "Сделка создана"} для {d.clientName}</span>}>
        <div className="space-y-4" data-testid="client-deals-done">
          <p className="text-sm text-ink-soft">
            {d.parts.length > 1 ? `По книге на сделку: №${d.parts.map((x) => x.dealNumber).join(", №")}. ` : `Сделка №${d.parts[0].dealNumber}. `}
            Договорились на {formatPrice(d.agreed)}{d.parts.length > 1 ? " за книгу" : ""}, предоплата {formatPrice(d.prepaid)}
            {d.remainder > 0 ? `, остаток ${formatPrice(d.remainder)}` : ", оплачено полностью"}. Задач создано: {d.tasks}.
          </p>
          <PartsReceipts parts={d.parts} receipt={receipt} />
          <p className="text-xs text-muted">В кабинете клиента это одна карточка «Ваш заказ по договорённости»: сколько книг оплачено и сколько ещё осталось оформить.</p>
          <div className="flex flex-wrap gap-2">
            <Link href={`/admin/deals/${d.parts[0].dealId}`} className="btn btn-dark btn-sm">
              Открыть сделку №{d.parts[0].dealNumber}
            </Link>
            <Link href={`/admin/clients/${d.clientId}`} className="btn btn-outline btn-sm">
              Карточка клиента
            </Link>
          </div>
        </div>
      </Panel>
    );
  }

  return (
    <form
      action={action}
      onSubmit={(e) => {
        // Предоплата без чека не принимается: файл отправляется отдельно (он может быть крупнее лимита форм).
        if (p > 0 && !receipt) {
          e.preventDefault();
          setLocalError("Приложите чек предоплаты: скриншот или фото перевода");
        } else setLocalError(null);
      }}
      className="space-y-4"
      data-testid="client-deals-form"
    >
      <input type="hidden" name="clientId" value={client.id} />
      <Panel title="Договорённость" description={`Клиент: ${client.name}. Книги он оформит в кабинете по очереди — каждая заберёт свою долю цены и предоплаты.`}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Сколько книг оплачено сразу" hint={n > 1 ? `Создадим ${ruCount(n, "сделку", "сделки", "сделок")} — по одной на книгу.` : "Одна книга — одна сделка."}>
            <input name="count" type="number" min={1} max={20} step={1} inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value)} className="input tabular-nums" />
          </Field>
          <Field label="Тариф">
            <select name="plan" required className="input" value={planId || v.plan || ""} onChange={(e) => setPlanId(e.target.value)}>
              <option value="" disabled>
                Выберите тариф
              </option>
              {getVisiblePlans().map((x) => (
                <option key={x.id} value={x.id}>
                  {planLabels[x.id]} · по прайсу {formatPrice(x.price)}
                </option>
              ))}
            </select>
          </Field>
          <div className="min-w-0">
            <Field label="Цена одной книги, ₸" hint="Доставка и допы считаются сверху при оформлении заказа.">
              <input name="agreed" type="number" min={0} step={1} required inputMode="numeric" value={agreed} onChange={(e) => setAgreed(e.target.value)} className="input tabular-nums" placeholder="20000" />
            </Field>
            <PlanDiscountHint plan={planId || v.plan || ""} price={price} maxPercent={maxDiscountPercent} />
          </div>
          <Field label={n > 1 ? "Предоплата за все книги, ₸" : "Предоплата, ₸"} optional>
            <input name="prepaid" type="number" min={0} step={1} inputMode="numeric" value={prepaid} onChange={(e) => setPrepaid(e.target.value)} className="input tabular-nums" placeholder="0" />
          </Field>
          <AgreementGiftsField values={v} />
          {p > 0 ? (
            <div className="sm:col-span-2">
              <label className="label" htmlFor="prepaid-receipt">
                Чек предоплаты
              </label>
              <input id="prepaid-receipt" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => setReceipt(e.target.files?.[0] ?? null)} className="input h-auto min-h-11 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-sunken file:px-2.5 file:py-1.5 file:text-xs file:font-medium file:text-ink" />
              {receipt ? <p className="mt-1 text-xs text-success">Выбран файл: {receipt.name}</p> : null}
              <p className="hint flex items-center gap-1">
                <Paperclip className="size-3.5" aria-hidden /> Скриншот или фото перевода, PDF — до 12 МБ. {n > 1 ? "Прикрепится к платежу каждой сделки." : "Прикрепится к сделке."}
              </p>
            </div>
          ) : null}
          <div className={cn("rounded-[var(--r-ctl)] px-3.5 py-2.5 text-sm tabular-nums sm:col-span-2", p > total ? "bg-danger-bg text-danger" : "bg-sunken text-ink-soft")} role="status">
            {p > total ? "Предоплата больше суммы договорённости" : total > 0 ? `${n > 1 ? `Всего ${n} × ${formatPrice(price)} = ${formatPrice(total)}. ` : ""}Остаток: ${formatPrice(total - p)} (доставка — сверху)` : "Укажите цену — посчитаем остаток"}
          </div>
        </div>
      </Panel>
      <Panel title="Книга и воронка">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Кому книга" optional>
            <input name="recipient" maxLength={80} className="input" placeholder="Мужу" defaultValue={v.recipient} />
          </Field>
          <Field label="Срок готовности" optional>
            <input name="deadline" type="date" className="input" defaultValue={v.deadline} />
          </Field>
          <Field label="Этап воронки">
            <select name="stageId" className="input" defaultValue={v.stageId ?? defaultStageId}>
              {stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          {canAssign ? (
            <Field label="Ответственный">
              <select name="assigneeId" className="input" defaultValue={v.assigneeId ?? me}>
                {admins.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
          <Field label="Комментарий для заметки" optional className="sm:col-span-2">
            <textarea name="comment" rows={2} maxLength={1000} className="input min-h-20" placeholder="Например: книги в подарок трём подругам" defaultValue={v.comment} />
          </Field>
        </div>
      </Panel>
      {localError ? <Alert>{localError}</Alert> : null}
      {state.error ? <Alert>{state.error}</Alert> : null}
      <div className="sticky bottom-[var(--tabbar-h)] z-10 -mx-4 border-t border-line bg-canvas/95 px-4 py-3 backdrop-blur max-sm:[&>*]:w-full lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
        <SubmitButton>{n > 1 ? `Создать ${ruCount(n, "сделку", "сделки", "сделок")}` : "Создать сделку"}</SubmitButton>
      </div>
    </form>
  );
}
