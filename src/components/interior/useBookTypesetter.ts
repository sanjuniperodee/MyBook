"use client";

import { useEffect, useMemo, useState } from "react";
import type { Locale } from "@/i18n/config";
import { createLineBreaker, type LineBreaker } from "./line-breaker";

/**
 * Переносы и строки книги для превью: модуль с шаблонами переносов (lib/book/hyphenate.ts) грузится отдельно. Пока его
 * нет — переносы и строки браузера. Потом — строки, как у PDF (line-breaker.ts: Кнут — Пласс по ширинам шрифтов
 * книги), а где шрифт ещё грузится — мягкие переносы PDF. Догрузился шрифт — новая версия набора, превью перестраивается.
 */
export function useBookTypesetter(language: Locale) {
  const [tools, setTools] = useState<{ hyphenate: (text: string) => string; breaker: LineBreaker } | undefined>(undefined);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let live = true;
    void import("@/lib/book/hyphenate").then(({ softHyphenate, hyphenateWord }) => {
      if (!live) return;
      const memo = new Map<string, string>();
      const hyphenate = (text: string) => {
        let out = memo.get(text);
        if (out === undefined) {
          out = softHyphenate(text, language);
          if (memo.size > 5000) memo.clear();
          memo.set(text, out);
        }
        return out;
      };
      const breaker = createLineBreaker(language, hyphenateWord, () => live && setVersion((v) => v + 1));
      setTools({ hyphenate, breaker });
    });
    return () => {
      live = false;
    };
  }, [language]);
  // Новая версия — новая функция: набор (kit) меняется, главы перерисовываются и перемеряются.
  const breaker = useMemo(() => (tools ? withVersion(tools.breaker, version) : undefined), [tools, version]);
  return { hyphenate: tools?.hyphenate, breaker, version };
}

/** Та же разбивка строк новой функцией (версия набора — в замыкании: функции разные, кэш общий). */
function withVersion(base: LineBreaker, version: number): LineBreaker {
  const fn: LineBreaker = (req) => (version >= 0 ? base(req) : null);
  fn.width = base.width;
  return fn;
}

