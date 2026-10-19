"use client";

import { useActionState, useTransition } from "react";
import { LoaderCircle } from "lucide-react";
import { formatPrice, type AddonId, type DeliveryId, type PlanId } from "@/config/site";
import { addonLabels, deliveryLabels, planLabels } from "@/modules/ordering/ui/labels";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Alert } from "@/components/ui/Alert";
import { toast } from "@/components/ui/overlays";
import { resetPricingAction, savePricingAction, type PricingState } from "./actions";

/** Пояснение к допу в подписи поля цены. */
const addonNotes: Partial<Record<AddonId, string>> = { express: " (приоритетное производство)" };

interface Props {
  plans: { id: PlanId; printed: boolean; price: number; extraCopyPrice: number; visible: boolean }[];
  addons: { id: AddonId; price: number }[];
  /** price null — «рассчитывается индивидуально» (optional: поле можно оставить пустым). */
  delivery: { id: DeliveryId; price: number | null; optional: boolean }[];
  factory: { plans: Record<string, { price: number; extraCopyPrice: number; visible: boolean }>; addons: Record<string, number>; delivery: Record<string, number> };
  changed: boolean;
}

function Price({ name, label, value, factory, hint, optional = false }: { name: string; label: string; value: number | null; factory: number; hint?: string; optional?: boolean }) {
  return (
    <div>
      <label className="label" htmlFor={name}>
        {label}
      </label>
      <div className="relative">
        <input id={name} name={name} type="number" inputMode="numeric" min={0} step={100} required={!optional} defaultValue={value ?? ""} placeholder={optional ? "индивидуально" : undefined} className="input h-11 pr-9" />
        <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted">₸</span>
      </div>
      <p className="mt-1 text-xs text-muted">{hint ?? (factory === value ? "заводская цена" : `заводская: ${formatPrice(factory)}`)}</p>
    </div>
  );
}

export function PricingForm({ plans, addons, delivery, factory, changed }: Props) {
  const [state, action] = useActionState<PricingState, FormData>(savePricingAction, {});
  const [resetting, startReset] = useTransition();
  return (
    <form action={action} className="space-y-5" data-testid="pricing-form">
      {state.error ? <Alert>{state.error}</Alert> : null}
      {state.ok ? (
        <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900" role="status" data-testid="pricing-saved">
          {state.ok}
        </p>
      ) : null}

      <section className="space-y-4 rounded-2xl border border-line bg-white p-5">
        <h2 className="text-sm font-semibold">Тарифы</h2>
        {plans.map((p) => (
          <div key={p.id} className="space-y-3 rounded-xl border border-line p-4" data-testid={`plan-${p.id}`}>
            <div className="flex items-center justify-between gap-3">
              <div className="font-medium">{planLabels[p.id]}</div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name={`plan_${p.id}_visible`} defaultChecked={p.visible} className="size-4 accent-wine" /> Продаётся
              </label>
            </div>
            <div className={`grid gap-3 ${p.printed ? "sm:grid-cols-2" : ""}`}>
              <Price name={`plan_${p.id}_price`} label="Цена" value={p.price} factory={factory.plans[p.id].price} />
              {p.printed ? <Price name={`plan_${p.id}_extra`} label="Каждый следующий экземпляр" value={p.extraCopyPrice} factory={factory.plans[p.id].extraCopyPrice} /> : null}
            </div>
            {!p.visible ? <p className="text-xs text-amber-800">Тариф скрыт: нет на витрине, в оформлении и сертификатах. Старые заказы с ним остаются как были.</p> : null}
          </div>
        ))}
      </section>

      <section className="grid gap-4 rounded-2xl border border-line bg-white p-5 sm:grid-cols-2">
        <h2 className="text-sm font-semibold sm:col-span-2">Допы к печатному заказу</h2>
        {addons.map((a) => (
          <Price key={a.id} name={`addon_${a.id}_price`} label={addonLabels[a.id] + (addonNotes[a.id] ?? "")} value={a.price} factory={factory.addons[a.id]} />
        ))}
      </section>

      <section className="grid gap-4 rounded-2xl border border-line bg-white p-5 sm:grid-cols-3">
        <h2 className="text-sm font-semibold sm:col-span-3">Доставка</h2>
        {delivery.map((d) => (
          <Price key={d.id} name={`delivery_${d.id}_price`} label={deliveryLabels[d.id]} value={d.price} factory={factory.delivery[d.id]} optional={d.optional} hint={d.optional ? (d.price === null ? "рассчитывается индивидуально" : "фиксированная цена; очистите поле — снова индивидуально") : undefined} />
        ))}
        <p className="text-xs text-muted sm:col-span-3">Пустое поле — стоимость доставки рассчитывается индивидуально: в сумму заказа не входит, клиент видит «рассчитывается индивидуально», менеджер получает задачу рассчитать её и согласовать. Доставка в другую страну — всегда так.</p>
      </section>

      <div className="rounded-2xl bg-cream/70 p-4 text-xs leading-relaxed text-ink-soft">
        Уже оформленные заказы и сертификаты не пересчитываются. Цена книги, о которой менеджер договорился с клиентом, остаётся в сделке как указана; доставка и допы по договорённости считаются сверху по ценам отсюда.
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton className="btn btn-primary">Сохранить цены</SubmitButton>
        {changed ? (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={resetting}
            onClick={() => {
              if (!confirm("Вернуть заводские цены и тарифы из кода? Ваши изменения будут потеряны.")) return;
              startReset(async () => {
                const r = await resetPricingAction();
                toast(r.ok ?? r.error ?? "Готово", r.error ? "error" : "success");
                window.location.reload();
              });
            }}
          >
            {resetting ? <LoaderCircle className="size-4 animate-spin" /> : null} Вернуть заводские
          </button>
        ) : null}
      </div>
    </form>
  );
}
