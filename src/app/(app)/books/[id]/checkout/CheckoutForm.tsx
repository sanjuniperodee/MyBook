"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Check, Minus, Plus } from "lucide-react";
import { createOrderAction, type CheckoutState } from "./actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Alert } from "@/components/ui/Alert";
import { deliveryOptions, formatPrice, plans, type DeliveryId, type PlanId } from "@/config/site";
import { cn } from "@/lib/utils";
import { calculatePrice } from "@/lib/pricing";

export function CheckoutForm({ bookId, defaults, blocked }: { bookId: string; defaults: { name: string; email: string; phone: string }; blocked: boolean }) {
  const [state, action] = useActionState<CheckoutState, FormData>(createOrderAction, {});
  const [planId, setPlanId] = useState<PlanId>("hardcover");
  const [qty, setQty] = useState(1);
  const [delivery, setDelivery] = useState<DeliveryId>("courier");
  const plan = plans.find((p) => p.id === planId)!;
  const { itemsAmount: items, deliveryAmount: deliveryPrice, amount: total } = calculatePrice(planId, qty, delivery);

  return (
    <form action={action} className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_360px]">
      <input type="hidden" name="bookId" value={bookId} />
      <input type="hidden" name="plan" value={planId} />
      <input type="hidden" name="quantity" value={qty} />
      <input type="hidden" name="delivery" value={plan.printed ? delivery : ""} />

      <div className="space-y-10">
        <section>
          <h2 className="text-xl font-semibold">1. Вариант книги</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {plans.map((p) => (
              <button
                type="button"
                key={p.id}
                onClick={() => setPlanId(p.id)}
                className={cn("relative rounded-2xl border bg-white p-5 text-left transition", planId === p.id ? "border-wine ring-4 ring-wine/10" : "border-line hover:border-ink/30")}
              >
                {planId === p.id ? (
                  <span className="absolute top-3 right-3 flex size-6 items-center justify-center rounded-full bg-wine text-white">
                    <Check className="size-3.5" />
                  </span>
                ) : null}
                <div className="font-semibold">{p.name}</div>
                <div className="mt-1 font-serif text-2xl">{formatPrice(p.price)}</div>
                <ul className="mt-3 space-y-1 text-xs text-muted">
                  {p.features.slice(0, 3).map((f) => (
                    <li key={f}>· {f}</li>
                  ))}
                </ul>
              </button>
            ))}
          </div>
          {plan.printed ? (
            <div className="mt-5 flex items-center gap-4">
              <span className="text-sm text-ink-soft">Количество экземпляров</span>
              <div className="flex items-center rounded-full border border-line bg-white">
                <button type="button" className="flex size-10 items-center justify-center disabled:opacity-40" onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1} aria-label="Меньше">
                  <Minus className="size-4" />
                </button>
                <span className="w-8 text-center font-medium tabular-nums">{qty}</span>
                <button type="button" className="flex size-10 items-center justify-center disabled:opacity-40" onClick={() => setQty((q) => Math.min(20, q + 1))} disabled={qty >= 20} aria-label="Больше">
                  <Plus className="size-4" />
                </button>
              </div>
              {plan.extraCopyPrice ? <span className="text-sm text-muted">каждый следующий — {formatPrice(plan.extraCopyPrice)}</span> : null}
            </div>
          ) : null}
        </section>

        {plan.printed ? (
          <section>
            <h2 className="text-xl font-semibold">2. Доставка</h2>
            <div className="mt-4 grid gap-3">
              {deliveryOptions.map((d) => (
                <label key={d.id} className={cn("flex cursor-pointer items-center gap-4 rounded-2xl border bg-white p-4 transition", delivery === d.id ? "border-wine ring-4 ring-wine/10" : "border-line")}>
                  <input type="radio" name="_delivery" className="size-4 accent-wine" checked={delivery === d.id} onChange={() => setDelivery(d.id)} />
                  <div className="flex-1">
                    <div className="font-medium">{d.name}</div>
                    <div className="text-sm text-muted">{d.description}</div>
                  </div>
                  <div className="text-sm font-medium">{d.price ? formatPrice(d.price) : "Бесплатно"}</div>
                </label>
              ))}
            </div>
            {delivery !== "pickup" ? (
              <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_2fr]">
                <div>
                  <label className="label" htmlFor="city">Город</label>
                  <input className="input" id="city" name="city" required maxLength={100} autoComplete="address-level2" />
                </div>
                <div>
                  <label className="label" htmlFor="address">Адрес</label>
                  <input className="input" id="address" name="address" required maxLength={300} placeholder="Улица, дом, квартира" autoComplete="street-address" />
                </div>
                <div>
                  <label className="label" htmlFor="postalCode">Индекс</label>
                  <input className="input" id="postalCode" name="postalCode" maxLength={20} autoComplete="postal-code" />
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        <section>
          <h2 className="text-xl font-semibold">{plan.printed ? "3" : "2"}. Контакты</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label" htmlFor="contactName">{plan.printed ? "Имя получателя" : "Ваше имя"}</label>
              <input className="input" id="contactName" name="contactName" defaultValue={defaults.name} required maxLength={100} autoComplete="name" />
            </div>
            <div>
              <label className="label" htmlFor="contactPhone">Телефон</label>
              <input className="input" id="contactPhone" name="contactPhone" type="tel" defaultValue={defaults.phone} placeholder="+7 7__ ___ __ __" required autoComplete="tel" />
            </div>
            <div>
              <label className="label" htmlFor="contactEmail">E-mail</label>
              <input className="input" id="contactEmail" name="contactEmail" type="email" defaultValue={defaults.email} required autoComplete="email" />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="comment">Комментарий к заказу</label>
              <textarea className="input" id="comment" name="comment" rows={2} maxLength={1000} placeholder="Например, удобное время доставки" />
            </div>
          </div>
        </section>
      </div>

      <aside>
        <div className="card sticky top-24 p-6">
          <h2 className="text-lg font-semibold">Итого</h2>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">
                {plan.name}
                {plan.printed && qty > 1 ? ` × ${qty}` : ""}
              </dt>
              <dd>{formatPrice(items)}</dd>
            </div>
            {plan.printed ? (
              <div className="flex justify-between">
                <dt className="text-muted">Доставка</dt>
                <dd>{deliveryPrice ? formatPrice(deliveryPrice) : "Бесплатно"}</dd>
              </div>
            ) : null}
          </dl>
          <div className="mt-4 flex items-baseline justify-between border-t border-line pt-4">
            <span className="font-medium">К оплате</span>
            <span className="font-serif text-3xl font-medium">{formatPrice(total)}</span>
          </div>
          {state.error ? <Alert className="mt-4">{state.error}</Alert> : null}
          <label className="mt-5 flex items-start gap-2.5 text-xs text-muted">
            <input type="checkbox" name="consent" required className="mt-0.5 size-4 accent-wine" />
            <span>
              Я проверил(а) макет книги и принимаю <Link href="/offer" target="_blank" className="text-wine underline">условия оферты</Link>. После оформления редактирование книги будет закрыто.
            </span>
          </label>
          <SubmitButton className="btn-lg mt-5 w-full" pendingText="Оформляем…">
            Оформить заказ
          </SubmitButton>
          {blocked ? <p className="mt-3 text-center text-xs text-red-700">Сначала исправьте замечания выше</p> : null}
        </div>
      </aside>
    </form>
  );
}
