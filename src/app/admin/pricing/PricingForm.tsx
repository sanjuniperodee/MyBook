"use client";

import { useActionState, useTransition } from "react";
import { LoaderCircle } from "lucide-react";
import {
  formatPrice,
  MAX_AI_PACK_REQUESTS,
  type AddonId,
  type AiPackId,
  type DeliveryId,
  type MediaPackId,
  type PlanId,
} from "@/config/site";
import {
  MAX_FREE_MINUTES,
  MAX_PACK_MINUTES,
  MAX_SECONDS,
} from "@/lib/book/answer-files";
import {
  addonLabels,
  deliveryLabels,
  planLabels,
} from "@/modules/ordering/ui/labels";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Alert } from "@/components/ui/Alert";
import { ask, toast } from "@/components/ui/overlays";
import { Panel } from "@/components/ui/Panel";
import { Intro } from "@/components/admin/Intro";
import {
  resetPricingAction,
  savePricingAction,
  type PricingState,
} from "./actions";

/** Пояснение к допу в подписи поля цены. */
const addonNotes: Partial<Record<AddonId, string>> = {
  express: " (приоритетное производство)",
};

interface Props {
  plans: {
    id: PlanId;
    printed: boolean;
    price: number;
    extraCopyPrice: number;
    visible: boolean;
  }[];
  addons: { id: AddonId; price: number; visible: boolean }[];
  /** price null — «рассчитывается индивидуально» (optional: поле можно оставить пустым). */
  delivery: { id: DeliveryId; price: number | null; optional: boolean }[];
  aiPacks: {
    id: AiPackId;
    price: number;
    requests: number;
    visible: boolean;
  }[];
  mediaPacks: {
    id: MediaPackId;
    price: number;
    minutes: number;
    visible: boolean;
  }[];
  mediaFreeMinutes: number;
  factory: {
    plans: Record<
      string,
      { price: number; extraCopyPrice: number; visible: boolean }
    >;
    addons: Record<string, number>;
    delivery: Record<string, number>;
    aiPacks: Record<string, { price: number; requests: number }>;
    mediaPacks: Record<string, { price: number; minutes: number }>;
    mediaFreeMinutes: number;
  };
  changed: boolean;
}

function Price({
  name,
  label,
  value,
  factory,
  hint,
  optional = false,
}: {
  name: string;
  label: string;
  value: number | null;
  factory: number;
  hint?: string;
  optional?: boolean;
}) {
  return (
    <div>
      <label className="label" htmlFor={name}>
        {label}
      </label>
      <div className="relative">
        <input
          id={name}
          name={name}
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          required={!optional}
          defaultValue={value ?? ""}
          placeholder={optional ? "индивидуально" : undefined}
          className="input h-10 pr-9 tabular-nums"
          aria-describedby={`${name}-hint`}
        />
        <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted">
          ₸
        </span>
      </div>
      <p id={`${name}-hint`} className="hint">
        {hint ??
          (factory === value ? (
            "заводская цена"
          ) : (
            <span className="text-warning">
              изменена, заводская {formatPrice(factory)}
            </span>
          ))}
      </p>
    </div>
  );
}

/** «Продаётся»: галочка с подписью, нажимается пальцем (44 px на телефоне). */
function Sells({ name, on }: { name: string; on: boolean }) {
  return (
    <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 text-sm text-ink-soft">
      <input
        type="checkbox"
        name={name}
        defaultChecked={on}
        className="size-4 accent-wine"
      />{" "}
      Продаётся
    </label>
  );
}

export function PricingForm({
  plans,
  addons,
  delivery,
  aiPacks,
  mediaPacks,
  mediaFreeMinutes,
  factory,
  changed,
}: Props) {
  const [state, action] = useActionState<PricingState, FormData>(
    savePricingAction,
    {},
  );
  const [resetting, startReset] = useTransition();
  return (
    <form action={action} className="space-y-4" data-testid="pricing-form">
      <Panel
        flush
        title="Тарифы"
        description="Что продаётся на витрине, в оформлении заказа и сертификатах"
      >
        <div className="divide-y divide-line">
          {plans.map((p) => (
            <div
              key={p.id}
              className="grid gap-x-6 gap-y-3 px-4 py-4 sm:px-5 lg:grid-cols-[14rem_minmax(0,1fr)]"
              data-testid={`plan-${p.id}`}
            >
              <div className="flex items-start justify-between gap-3 lg:flex-col lg:justify-start">
                <div className="font-medium">{planLabels[p.id]}</div>
                <Sells name={`plan_${p.id}_visible`} on={p.visible} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Price
                  name={`plan_${p.id}_price`}
                  label="Цена"
                  value={p.price}
                  factory={factory.plans[p.id].price}
                />
                {p.printed ? (
                  <Price
                    name={`plan_${p.id}_extra`}
                    label="Каждый следующий экземпляр"
                    value={p.extraCopyPrice}
                    factory={factory.plans[p.id].extraCopyPrice}
                  />
                ) : null}
              </div>
              {!p.visible ? (
                <p className="text-xs text-warning lg:col-start-2">
                  Тариф скрыт: нет на витрине, в оформлении и сертификатах.
                  Старые заказы с ним остаются как были.
                </p>
              ) : null}
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Допы к печатному заказу">
        <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
          {addons.map((a) => (
            <div key={a.id} className="space-y-2">
              <Price
                name={`addon_${a.id}_price`}
                label={addonLabels[a.id] + (addonNotes[a.id] ?? "")}
                value={a.price}
                factory={factory.addons[a.id]}
              />
              <Sells name={`addon_${a.id}_visible`} on={a.visible} />
              {!a.visible ? (
                <p className="text-xs text-warning">
                  Скрыт: клиенты не видят его при оформлении заказа. Старые
                  заказы остаются как были.
                </p>
              ) : null}
            </div>
          ))}
        </div>
      </Panel>

      <Panel
        title="Доставка"
        description="Пустое поле — стоимость рассчитывается индивидуально"
      >
        <div className="grid gap-x-6 gap-y-5 sm:grid-cols-3">
          {delivery.map((d) => (
            <Price
              key={d.id}
              name={`delivery_${d.id}_price`}
              label={deliveryLabels[d.id]}
              value={d.price}
              factory={factory.delivery[d.id]}
              optional={d.optional}
              hint={
                d.optional
                  ? d.price === null
                    ? "рассчитывается индивидуально"
                    : "фиксированная цена; очистите поле — снова индивидуально"
                  : undefined
              }
            />
          ))}
        </div>
        <p className="mt-4 text-xs text-muted">
          Пустое поле — доставка в сумму заказа не входит, клиент видит
          «рассчитывается индивидуально», менеджер получает задачу рассчитать её
          и согласовать. Доставка в другую страну — всегда так.
        </p>
      </Panel>

      <Panel
        title="Пакеты запросов к ИИ-дизайнеру"
        description="Предлагаются, когда кончились бесплатные запросы; купленные не сгорают"
      >
        <div className="space-y-4" data-testid="pricing-ai-packs">
          <div className="grid gap-3 lg:grid-cols-3">
            {aiPacks.map((p, i) => {
              const f = factory.aiPacks[p.id];
              return (
                <div
                  key={p.id}
                  className="space-y-3 rounded-[10px] border border-line p-4"
                  data-testid={`ai-pack-${p.id}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-medium">Пакет {i + 1}</div>
                    <Sells name={`ai_${p.id}_visible`} on={p.visible} />
                  </div>
                  <div>
                    <label className="label" htmlFor={`ai_${p.id}_requests`}>
                      Запросов
                    </label>
                    <input
                      id={`ai_${p.id}_requests`}
                      name={`ai_${p.id}_requests`}
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={MAX_AI_PACK_REQUESTS}
                      step={1}
                      required
                      defaultValue={p.requests}
                      className="input h-10 tabular-nums"
                    />
                    <p className="hint">
                      {f.requests === p.requests
                        ? "заводское число"
                        : `заводское: ${f.requests}`}
                    </p>
                  </div>
                  <Price
                    name={`ai_${p.id}_price`}
                    label="Цена"
                    value={p.price}
                    factory={f.price}
                  />
                  <p className="border-t border-line pt-2 text-xs text-muted tabular-nums">
                    ≈{" "}
                    {formatPrice(Math.round(p.price / Math.max(1, p.requests)))}{" "}
                    за запрос
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </Panel>

      <Panel
        title="Свои видео и аудио по QR-коду"
        description="Бесплатные минуты на книгу и пакеты сверх них"
      >
        <div className="space-y-4" data-testid="pricing-media">
          <div>
            <Intro small>
              Клиент загружает к ответу своё видео (до {MAX_SECONDS.video / 60}{" "}
              мин) или аудио (до {MAX_SECONDS.audio / 60} мин), в книге
              печатается QR-код страницы с файлом. Бесплатные минуты — на каждую
              книгу. Пока ни один пакет не продаётся, клиент не видит цен: сверх
              бесплатных минут загрузить просто нельзя. Отметьте «Продаётся» — и
              когда минуты кончатся, клиенту предложат пакет с оплатой Kaspi;
              купленные минуты добавляются книге.
            </Intro>
          </div>
          <div className="max-w-xs">
            <label className="label" htmlFor="media_free_minutes">
              Бесплатно на книгу, минут
            </label>
            <input
              id="media_free_minutes"
              name="media_free_minutes"
              type="number"
              inputMode="numeric"
              min={0}
              max={MAX_FREE_MINUTES}
              step={1}
              required
              defaultValue={mediaFreeMinutes}
              className="input h-10 tabular-nums"
            />
            <p className="hint">
              {factory.mediaFreeMinutes === mediaFreeMinutes
                ? "заводское число"
                : `заводское: ${factory.mediaFreeMinutes}`}
            </p>
          </div>
          <div className="grid gap-3 lg:grid-cols-3">
            {mediaPacks.map((p, i) => {
              const f = factory.mediaPacks[p.id];
              return (
                <div
                  key={p.id}
                  className="space-y-3 rounded-[10px] border border-line p-4"
                  data-testid={`media-pack-${p.id}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-medium">Пакет минут {i + 1}</div>
                    <Sells name={`media_${p.id}_visible`} on={p.visible} />
                  </div>
                  <div>
                    <label className="label" htmlFor={`media_${p.id}_minutes`}>
                      Минут
                    </label>
                    <input
                      id={`media_${p.id}_minutes`}
                      name={`media_${p.id}_minutes`}
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={MAX_PACK_MINUTES}
                      step={1}
                      required
                      defaultValue={p.minutes}
                      className="input h-10 tabular-nums"
                    />
                    <p className="hint">
                      {f.minutes === p.minutes
                        ? "заводское число"
                        : `заводское: ${f.minutes}`}
                    </p>
                  </div>
                  <Price
                    name={`media_${p.id}_price`}
                    label="Цена"
                    value={p.price}
                    factory={f.price}
                  />
                  <p className="border-t border-line pt-2 text-xs text-muted tabular-nums">
                    ≈{" "}
                    {formatPrice(Math.round(p.price / Math.max(1, p.minutes)))}{" "}
                    за минуту
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </Panel>

      <Alert kind="info">
        Уже оформленные заказы и сертификаты не пересчитываются. Цена книги, о
        которой менеджер договорился с клиентом, остаётся в сделке как указана;
        доставка и допы по договорённости считаются сверху по ценам отсюда.
      </Alert>

      {state.error ? <Alert>{state.error}</Alert> : null}
      {state.ok ? (
        <Alert kind="success">
          <span data-testid="pricing-saved">{state.ok}</span>
        </Alert>
      ) : null}
      {state.warning ? (
        <Alert kind="warning">
          <span data-testid="pricing-bot-drift">{state.warning}</span>
        </Alert>
      ) : null}

      <div className="sticky bottom-[calc(var(--tabbar-h,0px)+0.75rem)] z-10 flex flex-wrap items-center gap-3 rounded-[14px] border border-line bg-white/95 p-3 shadow-soft backdrop-blur">
        <SubmitButton className="btn btn-primary max-sm:flex-1">
          Сохранить цены
        </SubmitButton>
        {changed ? (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={resetting}
            onClick={() => {
              startReset(async () => {
                if (
                  !(await ask(
                    "Вернуть заводские цены и тарифы из кода? Ваши изменения будут потеряны.",
                    true,
                  ))
                )
                  return;
                const r = await resetPricingAction();
                toast(
                  r.ok ?? r.error ?? "Готово",
                  r.error ? "error" : "success",
                );
                window.location.reload();
              });
            }}
          >
            {resetting ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : null}{" "}
            Вернуть заводские
          </button>
        ) : null}
      </div>
    </form>
  );
}
