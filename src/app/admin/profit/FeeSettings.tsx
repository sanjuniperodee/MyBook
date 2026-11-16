"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Percent } from "lucide-react";
import { toast } from "@/components/ui/overlays";
import { DrawerButton } from "@/components/admin/Drawer";
import { saveFeeRatesAction } from "./actions";
import { BASE_FEE_KEY } from "@/shared/domain/expenses";

/**
 * «Проценты комиссий»: сколько банк удерживает с оплаты по каждой форме (Kaspi Рассрочка — 15%, Red — 12%…). Формы —
 * варианты поля сделки «Форма оплаты»; новую форму добавляют в настройках полей сделки.
 */
export function FeeSettingsButton({ forms, rates, taxRate }: { forms: string[]; rates: Record<string, number>; taxRate: number }) {
  return (
    <DrawerButton variant="outline" label="Комиссии и налог" icon={<Percent className="size-4" strokeWidth={1.8} aria-hidden />} title="Комиссии и налог" description="Сколько банк удерживает с оплаты по каждой форме и какой налог платится с выручки — отчёт считает их сам" testId="fee-settings" lazy>
      {(close) => <FeeForm forms={forms} rates={rates} taxRate={taxRate} close={close} />}
    </DrawerButton>
  );
}

function FeeForm({ forms, rates, taxRate, close }: { forms: string[]; rates: Record<string, number>; taxRate: number; close: () => void }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(forms.map((f) => [f, rates[f] ? String(rates[f]).replace(".", ",") : ""])));
  const [tax, setTax] = useState(taxRate ? String(taxRate).replace(".", ",") : "");
  const [base, setBase] = useState(rates[BASE_FEE_KEY] ? String(rates[BASE_FEE_KEY]).replace(".", ",") : "");
  const submit = () =>
    start(async () => {
      const r = await saveFeeRatesAction([...forms.map((form) => ({ form, rate: (values[form] ?? "").replace(",", ".") || "0" })), { form: BASE_FEE_KEY, rate: base.replace(",", ".") || "0" }], tax);
      if (!r.ok) return toast(r.error, "error");
      toast("Проценты сохранены", "success");
      close();
      router.refresh();
    });
  return (
    <form
      className="space-y-4"
      data-testid="fee-form"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="flex min-h-12 items-center gap-3 border-y border-line py-1.5">
        <label htmlFor="fee-base" className="min-w-0 flex-1 text-sm">
          Kaspi с каждой продажи
          <span className="block text-xs text-muted">Сверх процента формы и с оплат без формы; кроме наличных</span>
        </label>
        <span className="flex w-28 items-center gap-1.5">
          <input id="fee-base" inputMode="decimal" className="input h-9 text-right tabular-nums" placeholder="0" value={base} onChange={(e) => setBase(e.target.value)} data-testid="fee-base" />
          <span className="text-sm text-muted">%</span>
        </span>
      </div>
      <ul className="divide-y divide-line border-y border-line">
        {forms.map((form) => (
          <li key={form} className="flex min-h-12 items-center gap-3 py-1.5">
            <label htmlFor={`fee-${form}`} className="min-w-0 flex-1 text-sm">
              {form}
            </label>
            <span className="flex w-28 items-center gap-1.5">
              <input id={`fee-${form}`} inputMode="decimal" className="input h-9 text-right tabular-nums" placeholder="0" value={values[form] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [form]: e.target.value }))} />
              <span className="text-sm text-muted">%</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted">Пример: рассрочка 15% и 1% с каждой продажи — с оплаты 29 000 ₸ на счёт приходит 24 360 ₸, комиссия 4 640 ₸ попадает в себестоимость.</p>
      <div className="flex min-h-12 items-center gap-3 border-y border-line py-1.5">
        <label htmlFor="tax-rate" className="min-w-0 flex-1 text-sm">
          Налог с выручки
          <span className="block text-xs text-muted">Процент с дохода по вашему режиму; считается с денег периода строкой «Налоги»</span>
        </label>
        <span className="flex w-28 items-center gap-1.5">
          <input id="tax-rate" inputMode="decimal" className="input h-9 text-right tabular-nums" placeholder="0" value={tax} onChange={(e) => setTax(e.target.value)} data-testid="tax-rate" />
          <span className="text-sm text-muted">%</span>
        </span>
      </div>
      <button type="submit" className="btn btn-dark w-full" disabled={pending}>
        {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : null} Сохранить
      </button>
    </form>
  );
}
