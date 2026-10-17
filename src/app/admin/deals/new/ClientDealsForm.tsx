"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Paperclip } from "lucide-react";
import { createClientDealsAction, type ClientDealsState } from "@/app/admin/clients/new/actions";
import { PartsReceipts } from "@/app/admin/clients/new/PartsReceipts";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Alert } from "@/components/ui/Alert";
import { formatPrice, getVisiblePlans } from "@/config/site";
import { ruCount } from "@/i18n/plural";

const planLabels: Record<string, string> = { digital: "Электронная версия", hardcover: "Твёрдая обложка", premium: "Премиум" };

/**
 * Сделки существующему клиенту «по договорённости»: клиент оплатил сразу несколько книг или менеджер договорился о цене и тарифе.
 * По сделке на книгу; предоплата делится поровну, один чек уходит ко всем платежам.
 */
export function ClientDealsForm({ stages, defaultStageId, admins, me, canAssign, client }: { stages: { id: string; name: string }[]; defaultStageId?: string; admins: { id: string; label: string }[]; me: string; canAssign: boolean; client: { id: string; name: string } }) {
  const [state, action] = useActionState<ClientDealsState, FormData>(createClientDealsAction, {});
  const [receipt, setReceipt] = useState<File | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [agreed, setAgreed] = useState("");
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
      <div className="space-y-4 rounded-2xl border border-line bg-white p-5" data-testid="client-deals-done">
        <div>
          <h2 className="text-lg font-semibold">{d.parts.length > 1 ? `Создано ${ruCount(d.parts.length, "сделка", "сделки", "сделок")}` : "Сделка создана"} для {d.clientName}</h2>
          <p className="mt-1 text-sm text-muted">
            {d.parts.length > 1 ? `По книге на сделку: №${d.parts.map((x) => x.dealNumber).join(", №")}. ` : `Сделка №${d.parts[0].dealNumber}. `}
            Договорились на {formatPrice(d.agreed)}{d.parts.length > 1 ? " за книгу" : ""}, предоплата {formatPrice(d.prepaid)}
            {d.remainder > 0 ? `, остаток ${formatPrice(d.remainder)}` : ", оплачено полностью"}. Задач создано: {d.tasks}.
          </p>
        </div>
        <PartsReceipts parts={d.parts} receipt={receipt} />
        <p className="text-xs text-muted">В кабинете клиента это одна карточка «Ваш заказ по договорённости»: сколько книг оплачено и сколько ещё осталось оформить.</p>
        <div className="flex flex-wrap gap-2">
          <Link href={`/admin/deals/${d.parts[0].dealId}`} className="btn btn-primary btn-sm">
            Открыть сделку №{d.parts[0].dealNumber}
          </Link>
          <Link href={`/admin/clients/${d.clientId}`} className="btn btn-outline btn-sm">
            Карточка клиента
          </Link>
        </div>
      </div>
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
      className="grid gap-4 rounded-2xl border border-line bg-white p-5 sm:grid-cols-2"
      data-testid="client-deals-form"
    >
      <input type="hidden" name="clientId" value={client.id} />
      {localError ? <Alert className="sm:col-span-2">{localError}</Alert> : null}
      {state.error ? <Alert className="sm:col-span-2">{state.error}</Alert> : null}
      <div>
        <label className="label">Сколько книг оплачено сразу</label>
        <input name="count" type="number" min={1} max={20} step={1} value={count} onChange={(e) => setCount(e.target.value)} className="input h-11" />
        <p className="mt-1 text-xs text-muted">{n > 1 ? `Создадим ${ruCount(n, "сделку", "сделки", "сделок")} — по одной на книгу.` : "Одна книга — одна сделка."}</p>
      </div>
      <div>
        <label className="label">Тариф *</label>
        <select name="plan" required className="input h-11" defaultValue={v.plan ?? ""}>
          <option value="" disabled>
            Выберите тариф
          </option>
          {getVisiblePlans().map((x) => (
            <option key={x.id} value={x.id}>
              {planLabels[x.id]} · по прайсу {formatPrice(x.price)}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Цена одной книги по договорённости, ₸ *</label>
        <input name="agreed" type="number" min={0} step={100} required value={agreed} onChange={(e) => setAgreed(e.target.value)} className="input h-11" placeholder="20000" />
        <p className="mt-1 text-xs text-muted">Доставка и допы считаются сверху при оформлении заказа.</p>
      </div>
      <div>
        <label className="label">{n > 1 ? "Предоплата за все книги, ₸" : "Предоплата, ₸"}</label>
        <input name="prepaid" type="number" min={0} step={100} value={prepaid} onChange={(e) => setPrepaid(e.target.value)} className="input h-11" placeholder="0" />
      </div>
      {p > 0 ? (
        <div className="sm:col-span-2">
          <label className="label">Чек предоплаты *</label>
          <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => setReceipt(e.target.files?.[0] ?? null)} className="input h-11 w-full py-2 text-sm" />
          {receipt ? <p className="mt-1 text-xs text-emerald-800">Выбран файл: {receipt.name}</p> : null}
          <p className="mt-1 flex items-center gap-1 text-xs text-muted">
            <Paperclip className="size-3.5" /> Скриншот или фото перевода, PDF — до 12 МБ. {n > 1 ? "Прикрепится к платежу каждой сделки." : "Прикрепится к сделке."}
          </p>
        </div>
      ) : null}
      <div className={`rounded-xl px-3 py-2 text-sm sm:col-span-2 ${p > total ? "bg-red-50 text-red-800" : "bg-cream/70 text-ink-soft"}`}>
        {p > total ? "Предоплата больше суммы договорённости" : total > 0 ? `${n > 1 ? `Всего ${n} × ${formatPrice(price)} = ${formatPrice(total)}. ` : ""}Остаток: ${formatPrice(total - p)} (доставка — сверху)` : "Укажите цену — посчитаем остаток"}
      </div>
      <div>
        <label className="label">Кому книга</label>
        <input name="recipient" maxLength={80} className="input h-11" placeholder="Мужу" defaultValue={v.recipient} />
      </div>
      <div>
        <label className="label">Срок готовности</label>
        <input name="deadline" type="date" className="input h-11" defaultValue={v.deadline} />
      </div>
      <div>
        <label className="label">Этап воронки</label>
        <select name="stageId" className="input h-11" defaultValue={v.stageId ?? defaultStageId}>
          {stages.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      {canAssign ? (
        <div>
          <label className="label">Ответственный</label>
          <select name="assigneeId" className="input h-11" defaultValue={v.assigneeId ?? me}>
            {admins.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <div className="sm:col-span-2">
        <label className="label">Комментарий для заметки</label>
        <textarea name="comment" rows={2} maxLength={1000} className="input min-h-20" placeholder="Например: книги в подарок трём подругам" defaultValue={v.comment} />
      </div>
      <div className="sm:col-span-2">
        <SubmitButton>{n > 1 ? `Создать ${ruCount(n, "сделку", "сделки", "сделок")}` : "Создать сделку"}</SubmitButton>
      </div>
      <p className="text-xs text-muted sm:col-span-2">Клиент: {client.name}. Книги он оформит в кабинете по очереди — каждая заберёт свою долю цены и предоплаты.</p>
    </form>
  );
}
