"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";

/**
 * Фильтры CRM применяются сразу, как чипы: список, поле, флажок, дата — при изменении; поиск — через паузу в наборе.
 * Кладётся внутрь GET-формы фильтров. Переход мягкий (router.replace): страница не перезагружается, фокус и набранный
 * текст остаются в поле. Кнопка отправки формы остаётся для Enter и без JS, её можно спрятать (`sr-only`).
 */
export function AutoApply({ delay = 450 }: { delay?: number }) {
  const anchor = useRef<HTMLSpanElement>(null);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const form = anchor.current?.closest("form");
    if (!form) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const apply = () => {
      const params = new URLSearchParams();
      for (const [key, value] of new FormData(form)) if (typeof value === "string" && value !== "") params.append(key, value);
      const target = form.getAttribute("action") || pathname;
      const qs = params.toString();
      router.replace(qs ? `${target}?${qs}` : target, { scroll: false });
    };
    const isText = (el: EventTarget | null) => el instanceof HTMLInputElement && ["search", "text", "tel", "email"].includes(el.type);
    const onInput = (e: Event) => {
      if (!isText(e.target)) return;
      clearTimeout(timer);
      timer = setTimeout(apply, delay);
    };
    const onChange = (e: Event) => {
      if (isText(e.target)) return; // текст применяется по паузе в наборе (onInput), а не по уходу из поля
      clearTimeout(timer);
      apply();
    };
    const onSubmit = (e: SubmitEvent) => {
      e.preventDefault();
      clearTimeout(timer);
      apply();
    };
    form.addEventListener("input", onInput);
    form.addEventListener("change", onChange);
    form.addEventListener("submit", onSubmit);
    return () => {
      clearTimeout(timer);
      form.removeEventListener("input", onInput);
      form.removeEventListener("change", onChange);
      form.removeEventListener("submit", onSubmit);
    };
  }, [delay, pathname, router]);

  return <span ref={anchor} hidden />;
}
