"use client";

import { CustomFieldInputs, type FieldDef } from "@/components/admin/CustomFields";
import type { CustomFieldValues } from "@/shared/domain/customFields";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { requestFormReset } from "react-dom";
import { Check, ChevronDown, Eye, Trash2 } from "lucide-react";
import { ask, toast, toastError } from "@/components/ui/overlays";
import { revealContactAction } from "@/app/admin/crm-actions";
import { AccessCard } from "@/app/admin/clients/new/NewClientForm";
import { channels, manualChannels } from "@/shared/domain/channels";
import { movePipelineAction, acceptDealAction, assignDealAction, deleteDealAction, linkDealClientAction, mergeDealAction, moveDealAction, rejectDealAction, declineRejectionAction, updateDealAction, createClientFromDealAction, type ClientFromDealState, type DealFormState } from "../actions";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Ban, Inbox, LoaderCircle, Merge, UserRound } from "lucide-react";
import { askRejectReason, LostDialog } from "../DealsBoard";
import { ManagerSelect } from "@/components/admin/ContactActions";
import { dealSourceLabels, dealSources } from "@/shared/domain/dealSources";
import { dealListPrice } from "@/modules/sales/domain/pricing";
import { DiscountHint } from "@/components/admin/DiscountHint";
import { cn } from "@/lib/class-names";
import { StageLabel } from "../StageLabel";
import { Alert } from "@/components/ui/Alert";

interface Stage {
  id: string;
  name: string;
  color: string;
  kind: "open" | "won" | "lost";
}

/** Этапы как в amoCRM: полоса с текущим положением; клик — перевести сделку. */
export function StageBar({ dealId, current, stages, disabled }: { dealId: string; current: string; stages: Stage[]; disabled: boolean }) {
  const [value, setValue] = useState(current);
  // Этап сменили не здесь (доска, бот, оплата, другой сотрудник) и страница обновилась — полоса показывает новый.
  const [serverStage, setServerStage] = useState(current);
  if (current !== serverStage) {
    setServerStage(current);
    setValue(current);
  }
  const [lost, setLost] = useState<string | null>(null);
  const [pending, start] = useTransition();
  // Телефон: полоса этапов листается вбок — текущий этап сразу в середине видимой части (без прокрутки страницы).
  const strip = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const box = strip.current;
    const here = box?.querySelector<HTMLElement>("[data-current]");
    if (box && here && box.scrollWidth > box.clientWidth) box.scrollLeft = here.offsetLeft - (box.clientWidth - here.offsetWidth) / 2;
  }, [value]);
  const idx = stages.findIndex((s) => s.id === value);
  const cur = stages[idx];
  const go = (stageId: string, reason?: string) => {
    const prev = value;
    setValue(stageId);
    start(async () => {
      try {
        const r = await moveDealAction(dealId, stageId, reason);
        if (!r.ok) {
          setValue(prev);
          toast(r.message, "error");
        }
      } catch (e) {
        setValue(prev);
        toastError(e);
      }
    });
  };
  return (
    <>
      <div ref={strip} className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0" data-testid="stage-bar" role="group" aria-label="Этап сделки">
        {stages.map((s, i) => {
          const passed = cur?.kind === "open" ? s.kind === "open" && i <= idx : s.id === value;
          const here = s.id === value;
          return (
            <button
              key={s.id}
              type="button"
              data-current={here || undefined}
              aria-current={here ? "step" : undefined}
              disabled={disabled || pending || here}
              onClick={() => (s.kind === "lost" ? setLost(s.id) : go(s.id))}
              className="group flex min-h-11 min-w-28 flex-1 shrink-0 flex-col justify-center gap-1.5 rounded-lg px-1.5 py-1.5 text-left transition-colors hover:bg-sunken disabled:cursor-default disabled:hover:bg-transparent lg:min-w-0 lg:shrink"
              title={here ? `Сейчас: ${s.name}` : disabled ? s.name : `Перевести на этап «${s.name}»`}
            >
              <span className={cn("h-1.5 w-full rounded-full transition-colors", passed ? null : "bg-line group-enabled:group-hover:bg-line-strong")} style={passed ? { background: s.color } : undefined} aria-hidden />
              <span className={cn("flex min-w-0 items-center gap-1 text-[13px] leading-tight whitespace-nowrap", here ? "font-semibold text-ink" : passed ? "text-ink-soft" : "text-muted")}>
                {here ? <Check className="size-3.5 shrink-0" aria-hidden /> : null}
                <span className="truncate">{s.name}</span>
              </span>
            </button>
          );
        })}
      </div>
      {lost ? (
        <LostDialog
          onCancel={() => setLost(null)}
          onSubmit={(r) => {
            go(lost, r);
            setLost(null);
          }}
        />
      ) : null}
    </>
  );
}

/** Что сотрудник набрал в поле и от какого значения с сервера начинал. */
export interface FieldDraft {
  from: string;
  value: string;
}

/**
 * Значение поля, которое может поменять не только форма (бюджет записал счёт из чата, затем router.refresh()): набранное —
 * пока на сервере то же значение, от которого начинали; сервер его сменил — действует новое значение с сервера.
 */
export function draftValue(draft: FieldDraft | null, server: string): string {
  return draft && draft.from === server ? draft.value : server;
}

export function DealFields({
  deal,
  masked,
  disabled,
  fields = [],
  values = {},
  pricing = null,
}: {
  /** Кнопка «Показать номер» (право clients.reveal): открытие пишется в журнал. */
  canReveal?: boolean;
  fields?: FieldDef[];
  values?: CustomFieldValues;
  deal: { id: string; title: string; amount: number; source: string; contactName: string; contactPhone: string; contactEmail: string; extraPhones: string[]; tags: string[] };
  masked: { phone: string; email: string } | null;
  disabled: boolean;
  /** Бюджет — цена продажи (по сделке ещё нет заказа): тариф договорённости и лимит скидки сотрудника (null — без лимита). */
  pricing?: { plan: string | null; maxPercent: number | null } | null;
}) {
  // Не action формы: после него React сбрасывает поля к значениям с сервера — при ошибке набранное пропало бы.
  // Сохранили — сбрасываем сами (requestFormReset), и поля берут сохранённое с сервера.
  const [state, setState] = useState<DealFormState>({});
  const [pending, start] = useTransition();
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    start(async () => {
      let r: DealFormState;
      try {
        r = await updateDealAction({}, data);
      } catch (err) {
        r = { error: err instanceof Error && err.message ? err.message : "Не получилось сохранить — попробуйте ещё раз" };
      }
      start(() => {
        setState(r);
        if (r.ok) requestFormReset(form);
      });
    });
  };
  // Бюджет и источник может поменять не эта форма: счёт из чата записывает сумму договорённости, затем router.refresh().
  // Поля неуправляемые и пересоздаются по значению с сервера (key) — в форму уходит новая сумма, а не та, что была при
  // открытии страницы. Набранное хранится только для подсказки «ниже прайса» и действует, пока на сервере то же значение.
  const [amountDraft, setAmountDraft] = useState<FieldDraft | null>(null);
  const [sourceDraft, setSourceDraft] = useState<FieldDraft | null>(null);
  const serverAmount = String(deal.amount);
  return (
    <form
      onSubmit={submit}
      // После сохранения поля сбрасываются к значениям с сервера — черновик подсказки тоже.
      onReset={() => {
        setAmountDraft(null);
        setSourceDraft(null);
      }}
      className="space-y-5"
    >
      <input type="hidden" name="id" value={deal.id} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Название" className="sm:col-span-2">
          <input name="title" defaultValue={deal.title} required maxLength={200} disabled={disabled} className={inputCls} />
        </Field>
        <div className="min-w-0">
          <Field label="Бюджет, ₸">
            <input key={`amount:${serverAmount}`} name="amount" type="number" min={0} step={1000} inputMode="numeric" defaultValue={serverAmount} onChange={(e) => setAmountDraft({ from: serverAmount, value: e.target.value })} disabled={disabled} className={cn(inputCls, "tabular-nums")} />
          </Field>
          {pricing ? <DiscountHint list={dealListPrice(pricing.plan, draftValue(sourceDraft, deal.source))} price={Number(draftValue(amountDraft, serverAmount)) || 0} maxPercent={pricing.maxPercent} /> : null}
        </div>
        <Field label="Источник">
          <select key={`source:${deal.source}`} name="source" defaultValue={deal.source} onChange={(e) => setSourceDraft({ from: deal.source, value: e.target.value })} disabled={disabled} className={inputCls}>
            {dealSources.map((s) => (
              <option key={s} value={s}>
                {dealSourceLabels[s]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <CustomFieldInputs fields={fields} values={values} disabled={disabled} />
      <Field label="Теги" hint="Через запятую">
        <input name="tags" defaultValue={deal.tags.join(", ")} maxLength={300} disabled={disabled} className={inputCls} placeholder="юбилей, срочно" />
      </Field>
      {/* Контакт виден в листе «Контакт» наверху; править его нужно редко — поля свёрнуты, но уходят с формой. */}
      <details className="group rounded-[10px] border border-line" open={!deal.contactName}>
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3.5 text-sm font-medium text-ink-soft hover:text-ink [&::-webkit-details-marker]:hidden">
          <UserRound className="size-4 text-muted" aria-hidden />
          <span className="flex-1">Контакт в сделке</span>
          <span className="truncate text-xs font-normal text-muted">{deal.contactName}</span>
          <ChevronDown className="size-4 shrink-0 text-muted transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <div className="grid gap-3 border-t border-line p-3.5 sm:grid-cols-2">
          <Field label="Имя" className="sm:col-span-2">
            <input name="contactName" defaultValue={deal.contactName} maxLength={120} disabled={disabled} className={inputCls} placeholder="Как зовут клиента" />
          </Field>
          {masked ? (
            <p className="text-sm text-muted sm:col-span-2" title="Контакты скрыты настройками вашей роли" data-testid="masked-contacts">
              {/* Скрытые поля не отправляем: сервер сохранит прежние значения. */}
              Телефон и e-mail скрыты настройками вашей роли — их видно в листе «Контакт».
            </p>
          ) : (
            <>
              <Field label="Телефон">
                <input name="contactPhone" defaultValue={deal.contactPhone} maxLength={40} inputMode="tel" disabled={disabled} className={cn(inputCls, "tabular-nums")} />
              </Field>
              <Field label="E-mail">
                <input name="contactEmail" type="email" defaultValue={deal.contactEmail} maxLength={200} disabled={disabled} className={inputCls} />
              </Field>
              <Field label="Дополнительные телефоны" hint="Через запятую: второй номер, WhatsApp" className="sm:col-span-2">
                <input name="extraPhones" defaultValue={deal.extraPhones.join(", ")} maxLength={200} disabled={disabled} className={cn(inputCls, "tabular-nums")} />
              </Field>
            </>
          )}
        </div>
      </details>
      {disabled ? null : (
        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
          <button type="submit" className="btn btn-dark btn-sm" disabled={pending}>
            {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : null} Сохранить
          </button>
          {state.error ? (
            <span className="text-sm text-danger" role="alert">
              {state.error}
            </span>
          ) : null}
          {state.ok ? (
            <span className="flex items-center gap-1 text-sm text-success" role="status">
              <Check className="size-4" aria-hidden /> {state.ok}
            </span>
          ) : null}
        </div>
      )}
    </form>
  );
}

const inputCls = "input h-10 text-sm";

/** Подпись над полем и подсказка под ним (DESIGN.md §6); поле — внутри label, без лишних id. */
function Field({ label, hint, className, children }: { label: string; hint?: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={cn("block min-w-0", className)}>
      <span className="label">{label}</span>
      {children}
      {hint ? <span className="hint">{hint}</span> : null}
    </label>
  );
}

export function DealAssignee({ dealId, value, options, disabled }: { dealId: string; value: string | null; options: { id: string; label: string }[]; disabled: boolean }) {
  return <ManagerSelect value={value} options={options} disabled={disabled} onChange={(v) => assignDealAction(dealId, v)} />;
}

export function DealDelete({ id, number }: { id: string; number: number }) {
  const [pending, start] = useTransition();
  return (
    <button
      className="btn btn-ghost btn-sm text-danger hover:text-danger"
      disabled={pending}
      onClick={async () =>
        (await ask(`Удалить сделку №${number}? Задачи и история по ней тоже удалятся.`, true)) &&
        start(async () => {
          try {
            const r = await deleteDealAction(id);
            if (r?.error) toast(r.error, "error");
          } catch (e) {
            if ((e as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw e;
            toastError(e);
          }
        })
      }
    >
      {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Trash2 className="size-4" aria-hidden />} Удалить сделку
    </button>
  );
}

function useRun() {
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = (fn: () => Promise<unknown>, after?: () => void) =>
    start(async () => {
      try {
        // Отказ действия ({ ok: false, message }) — тостом; страницу не обновляем.
        const r = (await fn()) as { ok?: boolean; message?: string } | undefined;
        if (r && typeof r === "object" && r.ok === false) return toast(r.message ?? "", "error");
        if (after) after();
        else router.refresh();
      } catch (e) {
        if ((e as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw e;
        toastError(e);
      }
    });
  return { pending, run, router };
}

/**
 * Неразобранная заявка. Руководитель (canDecide) отклоняет и отмечает спамом сразу; менеджер только предлагает —
 * заявка остаётся у него с отметкой, руководитель подтверждает или оставляет в работе.
 */
export function UnsortedBanner({ dealId, canEdit, canDecide, request }: { dealId: string; canEdit: boolean; canDecide: boolean; request: "spam" | "reject" | null }) {
  const { pending, run, router } = useRun();
  const reject = async (spam: boolean) => {
    if (canDecide) {
      // Заявку с деньгами или счётом клиента сервер не удаляет, а закрывает «отказом» — тогда остаёмся на ней.
      if (await ask(spam ? "Это спам? Сделка удалится, с номера больше не будет заявок и уведомлений." : "Отклонить заявку? Сделка удалится, переписка и звонки останутся.", true)) {
        let deleted = false;
        run(
          async () => {
            const r = await rejectDealAction(dealId, spam);
            toast(r.message);
            deleted = r.deleted !== false;
          },
          () => (deleted ? router.push("/admin/deals") : router.refresh()),
        );
      }
      return;
    }
    const reason = await askRejectReason(spam);
    if (reason === null) return;
    run(async () => toast((await rejectDealAction(dealId, spam, reason)).message));
  };
  return (
    <section className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-[14px] border border-dashed border-wine/40 bg-rose/50 p-4 sm:px-5" data-testid="unsorted-banner">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-white text-wine">
        <Inbox className="size-5" strokeWidth={1.8} aria-hidden />
      </span>
      <div className="min-w-0 flex-1 basis-60">
        <h2 className="font-semibold">Неразобранная заявка</h2>
        <p className="text-sm text-ink-soft">
          {request
            ? `Менеджер предлагает ${request === "spam" ? "отметить спамом" : "отклонить"} — ${canDecide ? "подтвердите или оставьте в работе." : "ждёт решения руководителя."}`
            : "Новый номер. Примите в работу или отклоните; ответ в чате, звонок или запись о контакте в ленте тоже принимают заявку."}
        </p>
      </div>
      {canEdit ? (
        <div className="flex gap-2 max-lg:w-full max-lg:[&>*]:flex-1">
          {request && canDecide ? (
            <button className="btn btn-outline btn-sm" disabled={pending} onClick={() => run(() => declineRejectionAction(dealId))}>
              Оставить в работе
            </button>
          ) : (
            <button className="btn btn-dark btn-sm" disabled={pending} onClick={() => run(() => acceptDealAction(dealId))}>
              Принять
            </button>
          )}
          {request === "spam" && !canDecide ? null : (
            <button className="btn btn-outline btn-sm" disabled={pending || (!!request && !canDecide)} onClick={() => reject(request === "spam")}>
              {request && canDecide ? "Подтвердить" : "Отклонить"}
            </button>
          )}
          {request ? null : (
            <button className="btn btn-ghost btn-sm text-danger hover:text-danger" disabled={pending} onClick={() => reject(true)}>
              <Ban className="size-4" aria-hidden /> Спам
            </button>
          )}
        </div>
      ) : null}
    </section>
  );
}

/**
 * Подтверждение «Объединить сюда». В закрытую сделку — прямо: заявка уйдёт из работы, плана и воронки. Счета, которые слияние
 * отменит (cancels, «P77 на 15 000 ₸»), — поимённо: ссылка на оплату у клиента перестанет работать.
 */
export function mergeQuestion(number: number, intoClosed: boolean, cancels: readonly string[]) {
  const base = intoClosed
    ? `Влить заявку №${number} в эту закрытую сделку? Переписка, звонки, задачи и история перейдут сюда, №${number} удалится и уйдёт из работы — в план и воронку как новая продажа она не попадёт. Так делают, только если это та же покупка.`
    : `Объединить сделку №${number} с этой? Переписка, звонки, задачи и история перейдут сюда, №${number} удалится.`;
  if (!cancels.length) return base;
  return cancels.length === 1
    ? `${base} Будет отменён открытый счёт ${cancels[0]} — ссылка на оплату у клиента перестанет работать.`
    : `${base} Будут отменены открытые счета ${cancels.join(", ")} — ссылки на оплату у клиента перестанут работать.`;
}

export function DuplicateRow({ targetId, intoClosed, other, merge }: { targetId: string; intoClosed: boolean; other: { id: string; number: number; title: string; stage: string; color: string; created: string }; merge: { cancels: string[] } | null }) {
  const { pending, run } = useRun();
  const doMerge = async () => {
    const r = await mergeDealAction(targetId, other.id);
    if (r?.error) throw new Error(r.error);
  };
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5 text-sm">
      <Link href={`/admin/deals/${other.id}`} className="min-w-0 flex-1 basis-48 hover:text-wine">
        <span className="block truncate font-medium">
          №{other.number} {other.title}
        </span>
        <span className="block text-xs text-muted">создана {other.created}</span>
      </Link>
      <StageLabel name={other.stage} color={other.color} />
      {merge ? (
        <button className="btn btn-outline btn-sm" disabled={pending} onClick={async () => (await ask(mergeQuestion(other.number, intoClosed, merge.cancels), true)) && run(doMerge)}>
          {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Merge className="size-4" aria-hidden />} Объединить сюда
        </button>
      ) : null}
    </div>
  );
}

export function LinkClient({ dealId, client }: { dealId: string; client: { id: string; label: string } }) {
  const { pending, run } = useRun();
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-[10px] bg-info-bg p-3 text-sm text-info">
      <UserRound className="size-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 basis-40">
        По номеру найден клиент на сайте: <b className="font-semibold">{client.label}</b>
      </span>
      <button className="btn btn-dark btn-sm" disabled={pending} onClick={() => run(() => linkDealClientAction(dealId, client.id))}>
        Привязать
      </button>
    </div>
  );
}

export function PipelineSwitch({ dealId, value, pipelines, disabled }: { dealId: string; value: string; pipelines: { id: string; name: string }[]; disabled: boolean }) {
  const { pending, run } = useRun();
  return (
    <label className="flex items-center gap-2 text-sm text-muted max-sm:w-full">
      Воронка
      <select className="input h-9 min-w-0 text-sm sm:w-56" value={value} disabled={disabled || pending} onChange={(e) => run(() => movePipelineAction(dealId, e.target.value))} aria-label="Воронка">
        {pipelines.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Скрытый контакт; «Показать» открывает его (на сервере — проверка, что сделка своя, и запись в журнал). */
export function RevealContact({ dealId, masked, canReveal }: { dealId: string; masked: { phone: string; email: string }; canReveal: boolean }) {
  const [shown, setShown] = useState<{ phone: string; email: string } | null>(null);
  const [pending, start] = useTransition();
  const c = shown ?? masked;
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-2 tabular-nums">
        {c.phone || "—"}
        {canReveal && !shown && masked.phone ? (
          <button
            type="button"
            className="inline-flex min-h-8 items-center gap-1 text-xs text-wine hover:underline"
            title="Открытие номера записывается в журнал"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await revealContactAction({ dealId });
                if (r.ok) setShown({ phone: r.phone, email: r.email });
                else toastError(new Error(r.message));
              })
            }
          >
            {pending ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <Eye className="size-3.5" aria-hidden />} показать (в журнал)
          </button>
        ) : null}
      </div>
      <div className="truncate text-muted">{c.email || "—"}</div>
    </>
  );
}

/**
 * Клиента ещё нет на сайте — завести аккаунт прямо из сделки: телефон берётся из сделки на сервере,
 * менеджер выбирает имя, язык кабинета и канал. Пароль показывается один раз — его нужно отправить клиенту.
 */
export function CreateClientFromDeal({ dealId, name }: { dealId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ClientFromDealState, FormData>(createClientFromDealAction.bind(null, dealId), {});
  if (state.done) return <AccessCard login={state.done.loginText} password={state.done.password} message={state.done.message} title="Клиент заведён — отправьте ему доступ" />;
  if (!open)
    return (
      <button type="button" className="btn btn-outline btn-sm w-full" onClick={() => setOpen(true)}>
        <UserRound className="size-4" aria-hidden /> Создать клиента на сайте
      </button>
    );
  return (
    <form action={action} className="space-y-3 rounded-[10px] border border-line p-3.5">
      <div>
        <h3 className="text-sm font-semibold">Новый клиент из сделки</h3>
        <p className="mt-0.5 text-xs text-muted">Логин — телефон из сделки. Сделка и переписка привяжутся к клиенту.</p>
      </div>
      <Field label="Имя">
        <input name="name" defaultValue={name} required maxLength={100} className={inputCls} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Язык кабинета">
          <select name="locale" defaultValue="ru" className={inputCls}>
            <option value="ru">русский</option>
            <option value="kk">қазақша</option>
          </select>
        </Field>
        <Field label="Откуда пришёл">
          <select name="channel" defaultValue="" required className={inputCls}>
            <option value="" disabled>
              выберите
            </option>
            {manualChannels.map((k) => (
              <option key={k} value={k}>
                {channels[k]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="E-mail (необязательно)">
        <input name="email" type="email" maxLength={200} className={inputCls} />
      </Field>
      {state.error ? (
        <Alert>
          {state.error}
          {state.existingId ? (
            <>
              {" "}
              <a href={`/admin/clients/${state.existingId}`} className="font-medium underline">
                Открыть клиента
              </a>
            </>
          ) : null}
        </Alert>
      ) : null}
      <div className="flex gap-2">
        <button className="btn btn-dark btn-sm" disabled={pending}>
          {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : null} Создать
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>
          Отмена
        </button>
      </div>
    </form>
  );
}
