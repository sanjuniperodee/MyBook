"use client";

import { useEffect, useRef } from "react";

/**
 * Черновик формы в localStorage: введённое переживает перезагрузку страницы (новая версия сайта — lib/stale-version.ts,
 * случайное закрытие вкладки) и удаляется после успешной отправки. Только для форм без паролей и платёжных данных.
 */

const PREFIX = "mybook:draft:";
/** Черновик старше недели не восстанавливаем. */
export const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

interface Saved<T> {
  at: number;
  value: T;
}

export function loadDraft<T>(store: Store, key: string, now: number, maxAge = DRAFT_MAX_AGE_MS): T | null {
  try {
    const saved = JSON.parse(store.getItem(PREFIX + key) ?? "null") as Saved<T> | null;
    if (!saved || typeof saved.at !== "number" || now - saved.at > maxAge) return null;
    return saved.value;
  } catch {
    return null;
  }
}

export function saveDraft<T>(store: Store, key: string, value: T, now: number) {
  try {
    store.setItem(PREFIX + key, JSON.stringify({ at: now, value } satisfies Saved<T>));
  } catch {
    // Хранилище переполнено или запрещено — форма работает и без черновика.
  }
}

export function clearDraft(store: Store, key: string) {
  try {
    store.removeItem(PREFIX + key);
  } catch {
    // нечего удалять
  }
}

const storage = (): Store | null => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

/**
 * Черновик формы: при первом показе восстанавливает сохранённое (restore — один раз, после гидрации), потом сохраняет
 * value при каждом изменении. sent() — форму отправили: если после этого страница ушла по другому адресу (успех —
 * действие перенаправило дальше), черновик удаляется. Ошибка отправки, страница ошибки или перезагрузка оставляют его.
 * key null — черновик выключен.
 */
export function useFormDraft<T>(key: string | null, value: T, restore: (value: T) => void) {
  const ready = useRef(false);
  const sentRef = useRef(false);
  const restoreRef = useRef(restore);
  useEffect(() => {
    restoreRef.current = restore;
  });

  useEffect(() => {
    const store = storage();
    if (!key || !store) return;
    const saved = loadDraft<T>(store, key, Date.now());
    if (saved !== null) restoreRef.current(saved);
    ready.current = true;
    const path = window.location.pathname;
    return () => {
      ready.current = false;
      if (!sentRef.current) return;
      // Ушли со страницы после отправки — проверяем уже новый адрес (навигация закончится после размонтирования).
      setTimeout(() => {
        if (window.location.pathname !== path) clearDraft(store, key);
      }, 1000);
    };
  }, [key]);

  const json = JSON.stringify(value);
  useEffect(() => {
    const store = storage();
    if (!key || !store || !ready.current) return;
    saveDraft(store, key, JSON.parse(json) as T, Date.now());
  }, [key, json]);

  return {
    sent: () => {
      sentRef.current = true;
    },
  };
}
