"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Repeat } from "lucide-react";
import { toast } from "@/components/ui/overlays";
import { repeatSaleAction } from "../actions";

/** id формы: галочки строк таблицы привязаны к ней атрибутом form — таблица остаётся серверной. */
export const REPEAT_FORM = "repeat-sale";

const DEFAULT_RU = "{имя}, здравствуйте! Это MyBooks. Вы уже дарили нашу книгу — скоро снова праздник. Хотите в этот раз сделать книгу для другого близкого человека? Подскажу, как успеть к дате.";
const DEFAULT_KK = "{имя}, сәлеметсіз бе! Бұл MyBooks. Сіз біздің кітабымызды сыйлаған едіңіз — жақында тағы мереке. Бұл жолы басқа жақын адамыңызға кітап жасағыңыз келе ме? Күнге қалай үлгеруге болатынын айтып беремін.";

const boxes = () => [...document.querySelectorAll<HTMLInputElement>(`input[type=checkbox][form=${REPEAT_FORM}][name=ids]`)];

/**
 * Ручная добивка к празднику (contacts-14): выбрать клиентов в таблице → «Повторная продажа». Каждому — сделка, готовый
 * текст в истории сделки и задача написать; клиенту CRM ничего не отправляет. До 200 за раз; кто просил не писать
 * первым или уже в работе — пропускаются.
 */
export function RepeatSale({ occasionTitle }: { occasionTitle: string }) {
  const [count, setCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  useEffect(() => {
    const update = () => {
      setCount(boxes().filter((b) => b.checked).length);
      setTotal(boxes().length);
    };
    update();
    document.addEventListener("change", update);
    return () => document.removeEventListener("change", update);
  }, []);
  const toggleAll = (on: boolean) => {
    for (const b of boxes()) b.checked = on;
    setCount(on ? total : 0);
  };
  return (
    <form
      id={REPEAT_FORM}
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        start(async () => {
          const r = await repeatSaleAction(f.getAll("ids").map(String), { title: String(f.get("title")), text: String(f.get("text")), textKk: String(f.get("textKk") ?? ""), tag: String(f.get("tag") ?? "") });
          toast(r.message, r.ok ? "success" : "error");
          if (r.ok) {
            toggleAll(false);
            setOpen(false);
            router.refresh();
          }
        });
      }}
    >
      <div className="flex flex-wrap items-center gap-2 text-sm" data-testid="repeat-sale-bar">
        <label className="flex items-center gap-2 text-ink-soft">
          <input type="checkbox" className="size-4 accent-wine" checked={count > 0 && count === total} onChange={(e) => toggleAll(e.target.checked)} aria-label="Выбрать всех на странице" /> все на странице
        </label>
        {count ? <span className="font-medium">Выбрано: {count}</span> : <span className="text-muted">Отметьте клиентов для повторной продажи</span>}
        <button type="button" className="btn btn-outline btn-sm h-8" disabled={!count} onClick={() => setOpen((o) => !o)}>
          <Repeat className="size-4" /> Повторная продажа
        </button>
      </div>
      {open && count ? (
        <div className="space-y-3 rounded-2xl border border-line bg-white p-4">
          <p className="text-xs text-muted">
            Каждому выбранному — сделка «Повторная продажа», готовый текст в её истории (кнопка «Открыть в WhatsApp» откроет его на телефоне магазина) и задача написать ответственному. Клиентам CRM ничего не отправляет. Кто просил не писать первым или уже в работе (открытая сделка) — пропускаются. {"{имя}"} — имя клиента.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-muted">Название сделки</span>
              <input name="title" defaultValue={`Повторная продажа: ${occasionTitle}`} className="input h-10 w-full text-sm" required />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-muted">Тег сделки (кто откликнулся)</span>
              <input name="tag" defaultValue="добивка" className="input h-10 w-full text-sm" />
            </label>
          </div>
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-muted">Текст клиенту</span>
            <textarea name="text" rows={3} defaultValue={DEFAULT_RU} className="input w-full text-sm" required />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-muted">Текст на казахском — клиентам с казахским языком (пусто — русский)</span>
            <textarea name="textKk" rows={3} defaultValue={DEFAULT_KK} className="input w-full text-sm" />
          </label>
          <button className="btn btn-primary btn-sm h-10" disabled={pending}>
            Завести {count} сделок
          </button>
        </div>
      ) : null}
    </form>
  );
}
