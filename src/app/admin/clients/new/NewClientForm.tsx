"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { Check, Copy, KeyRound, LoaderCircle, Paperclip, TriangleAlert } from "lucide-react";
import { createClientAction, type NewClientDone, type NewClientState } from "./actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Alert } from "@/components/ui/Alert";
import { formatPrice } from "@/config/site";

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
      {ok ? <Check className="size-4 text-emerald-600" /> : <Copy className="size-4" />} {ok ? "Скопировано" : label}
    </button>
  );
}

/** Выданный доступ: логин, пароль и готовое сообщение клиенту. Пароль виден только сейчас. */
export function AccessCard({ login, password, message, title = "Доступ клиента" }: { login: string; password: string; message: string; title?: string }) {
  return (
    <div className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
        <KeyRound className="size-4" /> {title}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-xl bg-white p-3">
          <div className="text-xs text-muted">Логин</div>
          <div className="mt-0.5 flex items-center justify-between gap-2">
            <span className="font-mono text-sm select-all">{login}</span>
            <CopyButton text={login} label="" />
          </div>
        </div>
        <div className="rounded-xl bg-white p-3">
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

type Upload = "none" | "uploading" | "ok" | "error";

function Done({ d, receipt }: { d: NewClientDone; receipt: File | null }) {
  const [upload, setUpload] = useState<Upload>(receipt && d.dealId && d.prepaid > 0 ? "uploading" : "none");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const started = useRef(false);

  async function send() {
    if (!receipt || !d.dealId) return;
    setUpload("uploading");
    setUploadError(null);
    try {
      const body = new FormData();
      body.set("file", receipt);
      body.set("amount", String(d.prepaid));
      const res = await fetch(`/api/admin/deals/${d.dealId}/receipts`, { method: "POST", body });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Не удалось загрузить чек");
      setUpload("ok");
    } catch (e) {
      setUploadError((e as Error).message);
      setUpload("error");
    }
  }
  useEffect(() => {
    if (started.current || upload !== "uploading") return;
    started.current = true;
    void send();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-4 rounded-2xl border border-line bg-white p-5">
      <div>
        <h2 className="text-lg font-semibold">Клиент {d.clientName} создан</h2>
        {d.dealId ? (
          <p className="mt-1 text-sm text-muted">
            Сделка №{d.dealNumber}: договорились на {formatPrice(d.agreed)}, предоплата {formatPrice(d.prepaid)}
            {d.remainder > 0 ? `, остаток ${formatPrice(d.remainder)}` : ", оплачено полностью"}. Задач создано: {d.tasks}.
          </p>
        ) : null}
      </div>
      {upload !== "none" ? (
        <div className={`flex items-center gap-2 rounded-xl p-3 text-sm ${upload === "error" ? "bg-red-50 text-red-800" : upload === "ok" ? "bg-emerald-50 text-emerald-900" : "bg-cream/70 text-ink-soft"}`} role={upload === "error" ? "alert" : "status"}>
          {upload === "uploading" ? <LoaderCircle className="size-4 animate-spin" /> : upload === "ok" ? <Check className="size-4" /> : <TriangleAlert className="size-4" />}
          <span className="flex-1">{upload === "uploading" ? "Загружаем чек предоплаты…" : upload === "ok" ? "Чек предоплаты приложен к сделке" : `Чек не загрузился: ${uploadError}. Его можно приложить на карточке сделки.`}</span>
          {upload === "error" ? (
            <button type="button" className="btn btn-outline btn-sm" onClick={() => void send()}>
              Повторить
            </button>
          ) : null}
        </div>
      ) : null}
      <AccessCard login={d.loginText} password={d.password} message={d.message} />
      <p className="text-xs text-muted">Пароль в системе не хранится в открытом виде и больше не покажется. Если клиент потеряет его, выдайте новый на карточке клиента.</p>
      <div className="flex flex-wrap gap-2">
        {d.dealId ? (
          <Link href={`/admin/deals/${d.dealId}`} className="btn btn-primary btn-sm">
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

export function NewClientForm({ canDeal, stages, defaultStageId, admins, me, canAssign }: { canDeal: boolean; stages: { id: string; name: string }[]; defaultStageId?: string; admins: { id: string; label: string }[]; me: string; canAssign: boolean }) {
  const [state, formAction] = useActionState<NewClientState, FormData>(createClientAction, {});
  const [deal, setDeal] = useState(canDeal);
  const [receipt, setReceipt] = useState<File | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [agreed, setAgreed] = useState("");
  const [prepaid, setPrepaid] = useState("");
  if (state.done) return <Done d={state.done} receipt={receipt} />;
  const v = state.values ?? {};
  const a = Number(agreed) || 0;
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

      <section className="grid gap-4 rounded-2xl border border-line bg-white p-5 sm:grid-cols-2">
        <h2 className="text-sm font-semibold sm:col-span-2">Клиент</h2>
        <div>
          <label className="label">Имя *</label>
          <input name="name" required maxLength={100} className="input h-11" placeholder="Насиба" defaultValue={v.name} />
        </div>
        <div>
          <label className="label">Телефон *</label>
          <input name="phone" required inputMode="tel" maxLength={40} className="input h-11" placeholder="8 775 000 00 00" defaultValue={v.phone} />
        </div>
        <div>
          <label className="label">E-mail</label>
          <input name="email" type="email" maxLength={200} className="input h-11" placeholder="если есть" defaultValue={v.email} />
          <p className="mt-1 text-xs text-muted">Без почты клиент входит по номеру телефона.</p>
        </div>
        <div>
          <label className="label">Город</label>
          <input name="city" maxLength={80} className="input h-11" placeholder="Алматы" defaultValue={v.city} />
        </div>
        <div>
          <label className="label">Язык</label>
          <select name="locale" className="input h-11" defaultValue={v.locale ?? "ru"}>
            <option value="ru">Русский</option>
            <option value="kk">Қазақша</option>
          </select>
        </div>
        <div>
          <label className="label">Пароль для входа</label>
          <input name="password" type="text" autoComplete="off" maxLength={200} className="input h-11" placeholder="создать автоматически" defaultValue={v.password} />
          <p className="mt-1 text-xs text-muted">Можно оставить пустым — подберём надёжный и покажем после создания.</p>
        </div>
      </section>

      {canDeal ? (
        <section className="grid gap-4 rounded-2xl border border-line bg-white p-5 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm font-semibold sm:col-span-2">
            <input type="checkbox" name="createDeal" checked={deal} onChange={(e) => setDeal(e.target.checked)} className="size-4" />
            Сразу создать сделку, заметку и задачи
          </label>
          {deal ? (
            <>
              <div>
                <label className="label">Кому книга</label>
                <input name="recipient" maxLength={80} className="input h-11" placeholder="Мужу" defaultValue={v.recipient} />
              </div>
              <div>
                <label className="label">Срок готовности</label>
                <input name="deadline" type="date" className="input h-11" defaultValue={v.deadline} />
              </div>
              <div>
                <label className="label">Договорились на, ₸ *</label>
                <input name="agreed" type="number" min={0} step={500} required value={agreed} onChange={(e) => setAgreed(e.target.value)} className="input h-11" placeholder="20000" />
              </div>
              <div>
                <label className="label">Предоплата, ₸</label>
                <input name="prepaid" type="number" min={0} step={500} value={prepaid} onChange={(e) => setPrepaid(e.target.value)} className="input h-11" placeholder="10000" />
              </div>
              {p > 0 ? (
                <div className="sm:col-span-2">
                  <label className="label">Чек предоплаты *</label>
                  <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => setReceipt(e.target.files?.[0] ?? null)} className="input h-11 w-full py-2 text-sm" />
                  {receipt ? <p className="mt-1 text-xs text-emerald-800">Выбран файл: {receipt.name}</p> : null}
                  <p className="mt-1 flex items-center gap-1 text-xs text-muted">
                    <Paperclip className="size-3.5" /> Скриншот или фото перевода, PDF — до 12 МБ. Прикрепится к сделке.
                  </p>
                </div>
              ) : null}
              <div className={`rounded-xl px-3 py-2 text-sm sm:col-span-2 ${p > a ? "bg-red-50 text-red-800" : "bg-cream/70 text-ink-soft"}`}>
                {p > a ? "Предоплата больше суммы договорённости" : a > 0 ? `Остаток к оплате: ${formatPrice(a - p)}` : "Укажите сумму — посчитаем остаток"}
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
                    {admins.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.label}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              <div className="sm:col-span-2">
                <label className="label">Комментарий</label>
                <textarea name="comment" rows={3} maxLength={1000} className="input w-full" placeholder="Что ещё важно знать: пожелания, договорённости" defaultValue={v.comment} />
              </div>
            </>
          ) : null}
        </section>
      ) : null}

      <SubmitButton className="btn-lg w-full" pendingText="Создаём…">
        Создать клиента и выдать доступ
      </SubmitButton>
    </form>
  );
}
