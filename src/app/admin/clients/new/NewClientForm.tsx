"use client";

import Link from "next/link";
import { AgreementGiftsField } from "@/components/admin/AgreementGiftsField";
import { useActionState, useState } from "react";
import { Check, Copy, KeyRound, Paperclip } from "lucide-react";
import { createClientAction, type NewClientDone, type NewClientState } from "./actions";
import { PartsReceipts } from "./PartsReceipts";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Alert } from "@/components/ui/Alert";
import { formatPrice } from "@/config/site";
import { ruCount } from "@/i18n/plural";
import { channels, manualChannels } from "@/shared/domain/channels";
import { getVisiblePlans } from "@/config/site";
import { PlanDiscountHint } from "@/components/admin/DiscountHint";
import { planLabels } from "@/modules/ordering/ui/labels";
import { Panel } from "@/components/ui/Panel";
import { Field } from "@/components/ui/Field";

function CopyButton({ text, label = "Копировать" }: { text: string; label?: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-outline btn-sm"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setOk(true);
          setTimeout(() => setOk(false), 1800);
        });
      }}
    >
      {ok ? <Check className="size-4 text-success" aria-hidden /> : <Copy className="size-4" aria-hidden />} {ok ? "Скопировано" : label}
    </button>
  );
}

/** Выданный доступ: логин, пароль и готовое сообщение клиенту. Пароль виден только сейчас. */
export function AccessCard({ login, password, message, title = "Доступ клиента" }: { login: string; password: string; message: string; title?: string }) {
  return (
    <div className="space-y-3 rounded-[var(--r-panel)] border border-success/25 bg-success-bg p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-success">
        <KeyRound className="size-4" /> {title}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="min-w-0 rounded-[var(--r-ctl)] bg-white p-3">
          <div className="text-xs text-muted">Логин</div>
          <div className="mt-0.5 flex items-center justify-between gap-2">
            <span className="font-mono text-sm select-all">{login}</span>
            <CopyButton text={login} label="" />
          </div>
        </div>
        <div className="min-w-0 rounded-[var(--r-ctl)] bg-white p-3">
          <div className="text-xs text-muted">Пароль (виден только сейчас)</div>
          <div className="mt-0.5 flex items-center justify-between gap-2">
            <span className="font-mono text-sm select-all">{password}</span>
            <CopyButton text={password} label="" />
          </div>
        </div>
      </div>
      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs text-muted">Сообщение клиенту (WhatsApp, СМС)</span>
          <CopyButton text={message} label="Копировать сообщение" />
        </div>
        <textarea readOnly rows={6} value={message} className="input w-full resize-none bg-white text-sm" onFocus={(e) => e.currentTarget.select()} />
      </div>
    </div>
  );
}

function Done({ d, receipt }: { d: NewClientDone; receipt: File | null }) {
  const many = d.parts.length > 1;
  return (
    <div className="panel panel-body space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Клиент {d.clientName} создан</h2>
        {d.dealId ? (
          <p className="mt-1 text-sm text-muted">
            {many ? `${ruCount(d.parts.length, "сделка", "сделки", "сделок")} (по книге на каждую): №${d.parts.map((p) => p.dealNumber).join(", №")}. ` : `Сделка №${d.dealNumber}: `}
            договорились на {formatPrice(d.agreed)}{many ? " за книгу" : ""}, предоплата {formatPrice(d.prepaid)}
            {d.remainder > 0 ? `, остаток ${formatPrice(d.remainder)}` : ", оплачено полностью"}. Задач создано: {d.tasks}.
          </p>
        ) : null}
      </div>
      <PartsReceipts parts={d.parts} receipt={receipt} />
      <AccessCard login={d.loginText} password={d.password} message={d.message} />
      <p className="text-xs text-muted">Пароль в системе не хранится в открытом виде и больше не покажется. Если клиент потеряет его, выдайте новый на карточке клиента.</p>
      <div className="flex flex-wrap gap-2">
        {d.dealId ? (
          <Link href={`/admin/deals/${d.dealId}`} className="btn btn-dark btn-sm">
            Открыть сделку №{d.dealNumber}
          </Link>
        ) : null}
        <Link href={`/admin/clients/${d.clientId}`} className="btn btn-outline btn-sm">
          Карточка клиента
        </Link>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => window.location.reload()}>
          Завести ещё
        </button>
      </div>
    </div>
  );
}

export function NewClientForm({ canDeal, stages, defaultStageId, admins, me, canAssign, maxDiscountPercent = null }: { canDeal: boolean; stages: { id: string; name: string }[]; defaultStageId?: string; admins: { id: string; label: string }[]; me: string; canAssign: boolean; /** Лимит скидки сотрудника от прайса, %; null — без лимита. */ maxDiscountPercent?: number | null }) {
  const [state, formAction] = useActionState<NewClientState, FormData>(createClientAction, {});
  const [deal, setDeal] = useState(canDeal);
  const [receipt, setReceipt] = useState<File | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [agreed, setAgreed] = useState("");
  const [planId, setPlanId] = useState("");
  const [prepaid, setPrepaid] = useState("");
  const [count, setCount] = useState("1");
  if (state.done) return <Done d={state.done} receipt={receipt} />;
  const v = state.values ?? {};
  const n = Math.max(1, Math.min(20, Math.floor(Number(count) || 1)));
  const a = (Number(agreed) || 0) * n; // всего за пакет
  const p = Number(prepaid) || 0;
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        // Предоплата без чека не принимается: файл отправляется отдельно (он может быть крупнее лимита форм).
        if (deal && (Number(prepaid) || 0) > 0 && !receipt) {
          e.preventDefault();
          setLocalError("Приложите чек предоплаты: скриншот или фото перевода");
        } else setLocalError(null);
      }}
      className="space-y-5"
    >
      {localError ? <Alert>{localError}</Alert> : null}
      {state.error ? (
        <Alert>
          {state.error}
          {state.existingId ? (
            <>
              {" "}
              <Link href={`/admin/clients/${state.existingId}`} className="font-medium underline">
                Открыть карточку
              </Link>
            </>
          ) : null}
        </Alert>
      ) : null}

      <Panel title="Клиент" description="Кто он и как войдёт в кабинет: логин — телефон или e-mail, пароль покажем один раз после создания.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Имя">
            <input name="name" required maxLength={100} className="input" placeholder="Насиба" defaultValue={v.name} />
          </Field>
          <Field label="Телефон">
            <input name="phone" required inputMode="tel" maxLength={40} className="input tabular-nums" placeholder="8 775 000 00 00" defaultValue={v.phone} />
          </Field>
          <Field label="E-mail" optional hint="Без почты клиент входит по номеру телефона.">
            <input name="email" type="email" maxLength={200} className="input" placeholder="если есть" defaultValue={v.email} />
          </Field>
          <Field label="Город" optional>
            <input name="city" maxLength={80} className="input" placeholder="Алматы" defaultValue={v.city} />
          </Field>
          <Field label="Откуда пришёл клиент" hint="Попадёт в отчёты по каналам и в аналитику продаж. Позже канал можно поменять в карточке клиента." className="sm:col-span-2">
            <select name="channel" required className="input" defaultValue={v.channel ?? ""}>
              <option value="" disabled>
                Выберите канал продаж
              </option>
              {manualChannels.map((k) => (
                <option key={k} value={k}>
                  {channels[k]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Язык кабинета">
            <select name="locale" className="input" defaultValue={v.locale ?? "ru"}>
              <option value="ru">Русский</option>
              <option value="kk">Қазақша</option>
            </select>
          </Field>
          <Field label="Пароль для входа" optional hint="Пусто — подберём надёжный и покажем после создания.">
            <input name="password" type="text" autoComplete="off" maxLength={200} className="input" placeholder="создать автоматически" defaultValue={v.password} />
          </Field>
        </div>
      </Panel>

      {canDeal ? (
        <section className="panel">
          <label className="panel-head cursor-pointer justify-start gap-3">
            <input type="checkbox" name="createDeal" checked={deal} onChange={(e) => setDeal(e.target.checked)} className="size-4 accent-wine" />
            <span>
              <span className="panel-title block">Сразу создать сделку, заметку и задачи</span>
              <span className="block text-xs text-muted">Договорённость о цене, предоплата с чеком, этап и ответственный</span>
            </span>
          </label>
          {deal ? (
            <div className="panel-body grid gap-4 sm:grid-cols-2">
              <Field label="Кому книга" optional hint="О себе или своя книга — оставьте пустым.">
                <input name="recipient" maxLength={80} className="input" placeholder="Мужу" defaultValue={v.recipient} />
              </Field>
              <Field label="Срок готовности" optional>
                <input name="deadline" type="date" className="input" defaultValue={v.deadline} />
              </Field>
              <Field label="Тариф" hint="Клиент оформит заказ именно на этот тариф — сменить его самому нельзя.">
                <select name="plan" required className="input" value={planId || v.plan || ""} onChange={(e) => setPlanId(e.target.value)}>
                  <option value="" disabled>
                    Выберите тариф
                  </option>
                  {getVisiblePlans().map((p) => (
                    <option key={p.id} value={p.id}>
                      {planLabels[p.id]} · по прайсу {formatPrice(p.price)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Сколько книг оплачено сразу" hint={n > 1 ? `Создадим ${ruCount(n, "сделку", "сделки", "сделок")} — по одной на книгу. Клиент оформит их по очереди.` : "Одна книга — одна сделка."}>
                <input name="count" type="number" min={1} max={20} step={1} inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value)} className="input tabular-nums" />
              </Field>
              <div className="min-w-0">
                <Field label="Цена одной книги, ₸" hint="Доставка и допы считаются сверху при оформлении заказа.">
                  <input name="agreed" type="number" min={0} step={1} required inputMode="numeric" value={agreed} onChange={(e) => setAgreed(e.target.value)} className="input tabular-nums" placeholder="20000" />
                </Field>
                <PlanDiscountHint plan={planId || v.plan || ""} price={Number(agreed) || 0} maxPercent={maxDiscountPercent} />
              </div>
              <Field label={n > 1 ? "Предоплата за все книги, ₸" : "Предоплата, ₸"} optional>
                <input name="prepaid" type="number" min={0} step={1} inputMode="numeric" value={prepaid} onChange={(e) => setPrepaid(e.target.value)} className="input tabular-nums" placeholder="10000" />
              </Field>
              <AgreementGiftsField values={v} />
              {p > 0 ? (
                <div className="sm:col-span-2">
                  <label className="label" htmlFor="new-client-receipt">
                    Чек предоплаты
                  </label>
                  <input id="new-client-receipt" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => setReceipt(e.target.files?.[0] ?? null)} className="input h-auto min-h-11 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-sunken file:px-2.5 file:py-1.5 file:text-xs file:font-medium file:text-ink" />
                  {receipt ? <p className="mt-1 text-xs text-success">Выбран файл: {receipt.name}</p> : null}
                  <p className="hint flex items-center gap-1">
                    <Paperclip className="size-3.5" aria-hidden /> Скриншот или фото перевода, PDF — до 12 МБ. Прикрепится к сделке.
                  </p>
                </div>
              ) : null}
              <div className={`rounded-[var(--r-ctl)] px-3.5 py-2.5 text-sm tabular-nums sm:col-span-2 ${p > a ? "bg-danger-bg text-danger" : "bg-sunken text-ink-soft"}`} role="status">
                {p > a ? "Предоплата больше суммы договорённости" : a > 0 ? `${n > 1 ? `Всего ${n} × ${formatPrice(Number(agreed) || 0)} = ${formatPrice(a)}. Остаток` : "Остаток за книгу"}: ${formatPrice(a - p)} (доставка — сверху)` : "Укажите сумму — посчитаем остаток"}
              </div>
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
                    {admins.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.label}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : null}
              <Field label="Комментарий" optional className="sm:col-span-2">
                <textarea name="comment" rows={3} maxLength={1000} className="input w-full" placeholder="Что ещё важно знать: пожелания, договорённости" defaultValue={v.comment} />
              </Field>
            </div>
          ) : null}
        </section>
      ) : null}

      <div className="sticky bottom-[var(--tabbar-h)] z-10 -mx-4 border-t border-line bg-canvas/95 px-4 py-3 backdrop-blur max-sm:[&>*]:w-full lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
        <SubmitButton className="w-full sm:w-auto" pendingText="Создаём…">
          Создать клиента и выдать доступ
        </SubmitButton>
      </div>
    </form>
  );
}
