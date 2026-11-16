"use client";

import { PAY_FORM_OPTIONS } from "@/shared/domain/expenses";

/**
 * Форма оплаты при ручном приёме денег (сделка, заказ, новый клиент): Kaspi Gold, рассрочка, Red, перевод, наличные.
 * По ней «Прибыль» считает комиссию банка с этого платежа; не указана — по форме сделки.
 */
export function PayFormPicker({ value, options, onChange, name, id }: { value: string; options?: string[]; onChange?: (v: string) => void; name?: string; id?: string }) {
  const list = options?.length ? options : [...PAY_FORM_OPTIONS];
  return (
    <select id={id} name={name} className="input" value={value} onChange={(e) => onChange?.(e.target.value)} aria-label="Форма оплаты" data-testid="pay-form">
      <option value="">Не указана</option>
      {list.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
      {value && !list.includes(value) ? <option value={value}>{value}</option> : null}
    </select>
  );
}
