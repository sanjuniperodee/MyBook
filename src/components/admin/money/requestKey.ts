"use client";

import { useMemo, useRef } from "react";

/**
 * Ключ отправки формы денег (платёж, возврат): один на попытку, пока она не удалась. Ошибка или обрыв связи — повтор
 * уходит с тем же ключом, и если первая отправка всё же записала деньги, сервер вернёт тот же платёж, а не запишет второй.
 * Успех — ключ сбрасывается: следующий платёж — новая отправка. Без crypto.randomUUID (не https) — без ключа, как раньше.
 */
export function useRequestKey() {
  const key = useRef<string | null>(null);
  return useMemo(
    () => ({
      take: () => (key.current ??= typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : ""),
      done: () => void (key.current = null),
    }),
    [],
  );
}
