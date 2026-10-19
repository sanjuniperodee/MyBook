"use client";

import { CustomFieldInputs, type FieldDef } from "@/components/admin/CustomFields";
import type { CustomFieldValues } from "@/shared/domain/customFields";
import { useActionState, useState, useTransition } from "react";
import { Check, Trash2 } from "lucide-react";
import { ask, toast, toastError } from "@/components/ui/overlays";
import { revealContactAction } from "@/app/admin/crm-actions";
import { AccessCard } from "@/app/admin/clients/new/NewClientForm";
import { channels, manualChannels } from "@/shared/domain/channels";
import { movePipelineAction, acceptDealAction, assignDealAction, deleteDealAction, linkDealClientAction, mergeDealAction, moveDealAction, rejectDealAction, declineRejectionAction, updateDealAction, createClientFromDealAction, type ClientFromDealState, type DealFormState } from "../actions";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Ban, Inbox, Merge, UserRound } from "lucide-react";
import { LostDialog } from "../DealsBoard";
import { ManagerSelect } from "@/components/admin/ContactActions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { dealSourceLabels, dealSources } from "@/shared/domain/dealSources";
import { dealListPrice } from "@/modules/sales/domain/pricing";
import { DiscountHint } from "@/components/admin/DiscountHint";
import { cn } from "@/lib/class-names";

interface Stage {
  id: string;
  name: string;
  color: string;
  kind: "open" | "won" | "lost";
}

/** Этапы как в amoCRM: полоса с текущим положением; клик — перевести сделку. */
export function StageBar({ dealId, current, stages, disabled }: { dealId: string; current: string; stages: Stage[]; disabled: boolean }) {
  const [value, setValue] = useState(current);
  const [lost, setLost] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const idx = stages.findIndex((s) => s.id === value);
  const cur = stages[idx];
  const go = (stageId: string, reason?: string) => {
    const prev = value;
    setValue(stageId);
    start(async () => {
      try {
        await moveDealAction(dealId, stageId, reason);
      } catch (e) {
        setValue(prev);
        toastError(e);
      }
    });
  };
  return (
    <>
      <div className="flex gap-1 overflow-x-auto pb-1" data-testid="stage-bar">
        {stages.map((s, i) => {
          const passed = cur?.kind === "open" ? s.kind === "open" && i <= idx : s.id === value;
          return (
            <button
              key={s.id}
              type="button"
              disabled={disabled || pending || s.id === value}
              onClick={() => (s.kind === "lost" ? setLost(s.id) : go(s.id))}
              className={cn(
                "min-w-24 flex-1 truncate rounded-lg px-3 py-2 text-xs font-medium transition disabled:cursor-default",
                passed ? "text-white" : "bg-white text-ink-soft hover:bg-cream",
                s.id === value && "ring-2 ring-ink/20",
              )}
              style={passed ? { background: s.color } : undefined}
              title={s.name}
            >
              {s.id === value ? <Check className="mr-1 inline size-3" /> : null}
              {s.name}
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

export function DealFields({
  deal,
  masked,
  canReveal = false,
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
  const [state, action] = useActionState<DealFormState, FormData>(updateDealAction, {});
  const [amount, setAmount] = useState(String(deal.amount));
  const [source, setSource] = useState(deal.source);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={deal.id} />
      <Field label="Название">
        <input name="title" defaultValue={deal.title} required maxLength={200} disabled={disabled} className="input h-9 text-sm" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Бюджет, ₸">
          <input name="amount" type="number" min={0} step={1000} value={amount} onChange={(e) => setAmount(e.target.value)} disabled={disabled} className="input h-9 text-sm" />
          {pricing ? <DiscountHint list={dealListPrice(pricing.plan, source)} price={Number(amount) || 0} maxPercent={pricing.maxPercent} /> : null}
        </Field>
        <Field label="Источник">
          <select name="source" value={source} onChange={(e) => setSource(e.target.value)} disabled={disabled} className="input h-9 text-sm">
            {dealSources.map((s) => (
              <option key={s} value={s}>
                {dealSourceLabels[s]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Контакт">
        <input name="contactName" defaultValue={deal.contactName} maxLength={120} disabled={disabled} className="input h-9 text-sm" placeholder="Имя" />
      </Field>
      {masked ? (
        <div className="space-y-1 text-sm text-ink-soft" title="Контакты скрыты настройками вашей роли" data-testid="masked-contacts">
          <RevealContact dealId={deal.id} masked={masked} canReveal={canReveal} />
          {/* Скрытые поля не отправляем: сервер сохранит прежние значения. */}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Телефон">
            <input name="contactPhone" defaultValue={deal.contactPhone} maxLength={40} inputMode="tel" disabled={disabled} className="input h-9 text-sm" />
          </Field>
          <Field label="E-mail">
            <input name="contactEmail" type="email" defaultValue={deal.contactEmail} maxLength={200} disabled={disabled} className="input h-9 text-sm" />
          </Field>
          <div className="col-span-2">
            <Field label="Доп. телефоны (через запятую)">
              <input name="extraPhones" defaultValue={deal.extraPhones.join(", ")} maxLength={200} disabled={disabled} className="input h-9 text-sm" placeholder="второй номер, WhatsApp" />
            </Field>
          </div>
        </div>
      )}
      <CustomFieldInputs fields={fields} values={values} disabled={disabled} />
      <Field label="Теги (через запятую)">
        <input name="tags" defaultValue={deal.tags.join(", ")} maxLength={300} disabled={disabled} className="input h-9 text-sm" placeholder="юбилей, срочно" />
      </Field>
      {disabled ? null : (
        <div className="flex items-center gap-3">
          <SubmitButton className="btn-sm">Сохранить</SubmitButton>
          {state.error ? <span className="text-xs text-red-700">{state.error}</span> : null}
          {state.ok ? <span className="text-xs text-emerald-700">{state.ok}</span> : null}
        </div>
      )}
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-muted">{label}</span>
      {children}
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
      className="btn btn-ghost btn-sm text-red-700"
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
      <Trash2 className="size-4" /> Удалить
    </button>
  );
}

function useRun() {
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = (fn: () => Promise<unknown>, after?: () => void) =>
    start(async () => {
      try {
        await fn();
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
    const reason = window.prompt(spam ? "Почему это спам? Руководитель увидит причину." : "Почему отклонить? Руководитель увидит причину.");
    if (reason === null) return;
    run(async () => toast((await rejectDealAction(dealId, spam, reason)).message));
  };
  return (
    <section className="flex flex-wrap items-center gap-3 rounded-2xl border-2 border-dashed border-wine/30 bg-rose/30 p-4" data-testid="unsorted-banner">
      <Inbox className="size-5 text-wine" />
      <div className="min-w-0 flex-1">
        <div className="font-semibold">Неразобранная заявка</div>
        <div className="text-sm text-muted">
          {request
            ? `Менеджер предлагает ${request === "spam" ? "отметить спамом" : "отклонить"} — ${canDecide ? "подтвердите или оставьте в работе." : "ждёт решения руководителя."}`
            : "Новый номер. Примите в работу или отклоните; ответ в чате, звонок или запись о контакте в ленте тоже принимают заявку."}
        </div>
      </div>
      {canEdit ? (
        <div className="flex gap-2">
          {request && canDecide ? (
            <button className="btn btn-sm" disabled={pending} onClick={() => run(() => declineRejectionAction(dealId))}>
              Оставить в работе
            </button>
          ) : (
            <button className="btn btn-sm" disabled={pending} onClick={() => run(() => acceptDealAction(dealId))}>
              Принять
            </button>
          )}
          {request === "spam" && !canDecide ? null : (
            <button className="btn btn-outline btn-sm" disabled={pending || (!!request && !canDecide)} onClick={() => reject(request === "spam")}>
              {request && canDecide ? "Подтвердить" : "Отклонить"}
            </button>
          )}
          {request ? null : (
            <button className="btn btn-ghost btn-sm text-red-700" disabled={pending} onClick={() => reject(true)}>
              <Ban className="size-4" /> Спам
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
    <div className="flex flex-wrap items-center gap-3 py-2 text-sm">
      <Link href={`/admin/deals/${other.id}`} className="min-w-0 flex-1 truncate hover:text-wine">
        №{other.number} {other.title} <span className="text-muted">· {other.created}</span>
      </Link>
      <span className="rounded-full px-2 py-0.5 text-[11px] text-white" style={{ background: other.color }}>
        {other.stage}
      </span>
      {merge ? (
        <button className="btn btn-outline btn-sm h-8" disabled={pending} onClick={async () => (await ask(mergeQuestion(other.number, intoClosed, merge.cancels), true)) && run(doMerge)}>
          <Merge className="size-3.5" /> Объединить сюда
        </button>
      ) : null}
    </div>
  );
}

export function LinkClient({ dealId, client }: { dealId: string; client: { id: string; label: string } }) {
  const { pending, run } = useRun();
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl bg-cream/60 p-2.5">
      <UserRound className="size-4 text-muted" />
      <span className="min-w-0 flex-1">
        По номеру найден клиент на сайте: <b>{client.label}</b>
      </span>
      <button className="btn btn-sm h-8" disabled={pending} onClick={() => run(() => linkDealClientAction(dealId, client.id))}>
        Привязать
      </button>
    </div>
  );
}

export function PipelineSwitch({ dealId, value, pipelines, disabled }: { dealId: string; value: string; pipelines: { id: string; name: string }[]; disabled: boolean }) {
  const { pending, run } = useRun();
  return (
    <label className="flex items-center gap-2 text-sm text-muted">
      Воронка
      <select className="input h-8 w-56 text-sm" value={value} disabled={disabled || pending} onChange={(e) => run(() => movePipelineAction(dealId, e.target.value))} aria-label="Воронка">
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
function RevealContact({ dealId, masked, canReveal }: { dealId: string; masked: { phone: string; email: string }; canReveal: boolean }) {
  const [shown, setShown] = useState<{ phone: string; email: string } | null>(null);
  const [pending, start] = useTransition();
  const c = shown ?? masked;
  return (
    <>
      <div className="flex items-center gap-2 tabular-nums">
        {c.phone || "—"}
        {canReveal && !shown && masked.phone ? (
          <button
            type="button"
            className="text-xs text-wine underline"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await revealContactAction({ dealId });
                if (r.ok) setShown({ phone: r.phone, email: r.email });
                else toastError(new Error(r.message));
              })
            }
          >
            показать (в журнал)
          </button>
        ) : null}
      </div>
      <div>{c.email || "—"}</div>
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
        <UserRound className="size-4" /> Создать клиента на сайте
      </button>
    );
  return (
    <form action={action} className="space-y-3 rounded-2xl border border-line bg-white p-4">
      <div className="text-sm font-semibold">Новый клиент из сделки</div>
      <p className="text-xs text-muted">Логин — телефон из сделки. Сделка и переписка привяжутся к клиенту.</p>
      <Field label="Имя">
        <input name="name" defaultValue={name} required maxLength={100} className="input h-9 text-sm" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Язык кабинета">
          <select name="locale" defaultValue="ru" className="input h-9 text-sm">
            <option value="ru">русский</option>
            <option value="kk">қазақша</option>
          </select>
        </Field>
        <Field label="Откуда пришёл">
          <select name="channel" defaultValue="" required className="input h-9 text-sm">
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
        <input name="email" type="email" maxLength={200} className="input h-9 text-sm" />
      </Field>
      {state.error ? (
        <p className="text-sm text-red-700">
          {state.error}
          {state.existingId ? (
            <>
              {" "}
              <a href={`/admin/clients/${state.existingId}`} className="underline">
                Открыть клиента
              </a>
            </>
          ) : null}
        </p>
      ) : null}
      <div className="flex gap-2">
        <button className="btn btn-sm" disabled={pending}>
          Создать
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>
          Отмена
        </button>
      </div>
    </form>
  );
}
