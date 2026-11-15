"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ClipboardPaste, LoaderCircle, Pencil, Plus, Trash2 } from "lucide-react";
import { confirmDialog, toast } from "@/components/ui/overlays";
import { Field } from "@/components/ui/Field";
import { DrawerButton } from "@/components/admin/Drawer";
import { expenseCategories, expenseCategoryKeys, parseExpenseLines, type ExpenseCategory } from "@/shared/domain/expenses";
import { addExpenseAction, importExpensesAction, removeExpenseAction, updateExpenseAction } from "./actions";

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const money = (n: number) => `${n.toLocaleString("ru-RU")} ₸`;
const shortDay = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}`;

export interface ExpenseValue {
  id: string;
  day: string;
  category: string;
  title: string;
  amount: number;
  quantity: number | null;
  note: string;
}

const HINTS: Partial<Record<ExpenseCategory, string>> = {
  print: "Укажите, сколько книг в партии, — отчёт посчитает цену печати одной книги",
  fees: "Комиссия Kaspi, удержание по рассрочке и Red",
  payroll: "Оклад, процент с продаж, бонусы",
};

/** Форма расхода: новая запись или правка. Реклама — с каналом вместо названия (правке не подлежит). */
function ExpenseForm({ channels, value, close }: { channels: { key: string; label: string }[]; value?: ExpenseValue; close: () => void }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const [category, setCategory] = useState<string>(value?.category ?? "print");
  const [day, setDay] = useState(value?.day ?? today);
  const [amount, setAmount] = useState(value ? String(value.amount) : "");
  const [title, setTitle] = useState(value?.title ?? "");
  const [quantity, setQuantity] = useState(value?.quantity ? String(value.quantity) : "");
  const [note, setNote] = useState(value?.note ?? "");
  const [channel, setChannel] = useState("instagram");
  const ads = category === "ads";
  const submit = () =>
    start(async () => {
      const input = { category, day, amount, title, quantity, note, channel: ads ? channel : undefined };
      const r = value ? await updateExpenseAction(value.id, input) : await addExpenseAction(input);
      if (!r.ok) return toast(r.error, "error");
      toast(value ? "Расход изменён" : "Расход добавлен", "success");
      if (value) close();
      else {
        setAmount("");
        setTitle("");
        setQuantity("");
        setNote("");
      }
      router.refresh();
    });
  return (
    <form
      className="grid grid-cols-2 gap-3"
      data-testid="expense-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (amount) submit();
      }}
    >
      <Field label="Категория" className="col-span-2" hint={HINTS[category as ExpenseCategory]}>
        <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
          {expenseCategoryKeys
            .filter((k) => !value || k !== "ads")
            .map((k) => (
              <option key={k} value={k}>
                {expenseCategories[k]}
              </option>
            ))}
        </select>
      </Field>
      {ads ? (
        <Field label="Канал" className="col-span-2" hint="По каналу считаются стоимость заявки и окупаемость рекламы">
          <select className="input" value={channel} onChange={(e) => setChannel(e.target.value)}>
            {channels.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
      ) : null}
      <Field label={ads ? "Что за реклама" : "Что оплатили"} optional={ads} className="col-span-2">
        <input className="input" placeholder={ads ? "Таргет, блогер, кампания" : category === "print" ? "Печать партии книг" : "Название расхода"} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
      </Field>
      <Field label="День">
        <input type="date" className="input" value={day} onChange={(e) => setDay(e.target.value)} max={today()} />
      </Field>
      <Field label="Сумма, ₸">
        <input type="number" inputMode="numeric" min={1} className="input tabular-nums" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </Field>
      {category === "print" ? (
        <Field label="Сколько книг" optional className="col-span-2">
          <input type="number" inputMode="numeric" min={1} className="input tabular-nums" placeholder="Например, 8" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        </Field>
      ) : null}
      {ads ? null : (
        <Field label="Заметка" optional className="col-span-2">
          <input className="input" placeholder="Кому, за что, номер счёта" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
        </Field>
      )}
      <button type="submit" className="btn btn-dark col-span-2" disabled={pending || !amount}>
        {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : value ? null : <Plus className="size-4" strokeWidth={1.8} aria-hidden />} {value ? "Сохранить" : "Добавить расход"}
      </button>
    </form>
  );
}

/** «Добавить расход» — главная кнопка страницы: форма в боковой панели, после записи остаётся открытой для следующей. */
export function AddExpenseButton({ channels }: { channels: { key: string; label: string }[] }) {
  return (
    <DrawerButton variant="primary" label="Добавить расход" icon={<Plus className="size-4" strokeWidth={1.8} aria-hidden />} title="Новый расход" description="Печать, доставка, зарплата, реклама — всё, на что ушли деньги" testId="new-expense">
      {(close) => <ExpenseForm channels={channels} close={close} />}
    </DrawerButton>
  );
}

/**
 * «Вставить из таблицы»: список расходов строками «название сумма» (можно с датой) разбирается на экране — видно, что
 * распозналось и в какую категорию попадёт; категорию строки можно поправить, строки с ошибкой не записываются.
 */
export function PasteExpensesButton() {
  return (
    <DrawerButton variant="outline" label="Вставить из таблицы" icon={<ClipboardPaste className="size-4" strokeWidth={1.8} aria-hidden />} title="Расходы из таблицы" description="Скопируйте столбцы «название» и «сумма» из своей таблицы и вставьте сюда" testId="paste-expenses" wide lazy>
      {(close) => <PasteForm close={close} />}
    </DrawerButton>
  );
}

function PasteForm({ close }: { close: () => void }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const [text, setText] = useState("");
  const [day, setDay] = useState(today);
  const [fixed, setFixed] = useState<Record<number, ExpenseCategory>>({});
  const lines = useMemo(() => parseExpenseLines(text, day), [text, day]);
  const good = lines.filter((l) => l.expense).map((l) => ({ line: l.line, ...l.expense!, category: fixed[l.line] ?? l.expense!.category }));
  const bad = lines.filter((l) => l.error);
  const total = good.reduce((s, r) => s + r.amount, 0);
  const submit = () =>
    start(async () => {
      const r = await importExpensesAction(good.map(({ category, day, amount, title }) => ({ category, day, amount, title })));
      if (!r.ok) return toast(r.error, "error");
      toast(`Записано расходов: ${r.count}`, "success");
      close();
      router.refresh();
    });
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_11rem]">
        <Field label="Список расходов" hint="По строке на расход: «таргет 52 756», «02.11 книги 68 000». Дата в строке важнее дня справа">
          <textarea className="input min-h-40 font-mono text-sm" value={text} onChange={(e) => setText(e.target.value)} placeholder={"таргет 52 756\nкниги 68 000\nдоставка 1 615"} data-testid="paste-text" />
        </Field>
        <Field label="День для строк без даты">
          <input type="date" className="input" value={day} onChange={(e) => setDay(e.target.value)} max={today()} />
        </Field>
      </div>
      {bad.length ? (
        <div className="rounded-[var(--r-ctl)] border border-line bg-sunken/60 p-3 text-sm">
          <p className="font-medium text-danger">Не распознано строк: {bad.length} — они не запишутся</p>
          <ul className="mt-1 space-y-0.5 text-ink-soft">
            {bad.slice(0, 8).map((l) => (
              <li key={l.line}>
                <span className="text-muted">Строка {l.line}:</span> {l.raw} — {l.error}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {good.length ? (
        <div className="overflow-x-auto rounded-[var(--r-ctl)] border border-line">
          <table className="table min-w-[520px]" data-testid="paste-preview">
            <thead>
              <tr>
                <th>День</th>
                <th>Что</th>
                <th>Категория</th>
                <th className="num">Сумма</th>
              </tr>
            </thead>
            <tbody>
              {good.map((r) => (
                <tr key={r.line}>
                  <td className="whitespace-nowrap text-muted tabular-nums">{shortDay(r.day)}</td>
                  <td>{r.title}</td>
                  <td>
                    <select className="input h-8 py-0 text-sm" value={r.category} onChange={(e) => setFixed((f) => ({ ...f, [r.line]: e.target.value as ExpenseCategory }))} aria-label={`Категория: ${r.title}`}>
                      {expenseCategoryKeys.map((k) => (
                        <option key={k} value={k}>
                          {expenseCategories[k]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="num font-medium whitespace-nowrap">{money(r.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <button type="button" className="btn btn-dark w-full" disabled={pending || !good.length} onClick={submit}>
        {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
        {good.length ? `Записать ${good.length} на ${money(total)}` : "Вставьте список расходов"}
      </button>
    </div>
  );
}

/** Действия строки ведомости: правка (кроме рекламы) и удаление с подтверждением. */
export function ExpenseRowActions({ value, source, channels }: { value: ExpenseValue; source: "expense" | "ads"; channels: { key: string; label: string }[] }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const remove = async () => {
    if (!(await confirmDialog({ title: `Удалить расход на ${money(value.amount)}?`, text: "Запись исчезнет из отчёта о прибыли. Удаление останется в журнале действий.", confirmLabel: "Удалить", danger: true }))) return;
    start(async () => {
      const r = await removeExpenseAction(value.id, source);
      if (!r.ok) return toast(r.error, "error");
      toast("Расход удалён", "success");
      router.refresh();
    });
  };
  return (
    <span className="flex justify-end gap-1">
      {source === "expense" ? (
        <DrawerButton variant="ghost" label="" icon={<Pencil className="size-4" strokeWidth={1.8} aria-label="Изменить" />} title="Изменить расход" className="btn-icon text-muted" lazy>
          {(close) => <ExpenseForm channels={channels} value={value} close={close} />}
        </DrawerButton>
      ) : null}
      <button type="button" className="btn btn-ghost btn-icon btn-sm text-muted hover:text-danger" aria-label={`Удалить расход ${money(value.amount)}`} disabled={pending} onClick={remove}>
        <Trash2 className="size-4" strokeWidth={1.8} />
      </button>
    </span>
  );
}
