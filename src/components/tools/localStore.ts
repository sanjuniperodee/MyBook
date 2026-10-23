"use client";

/**
 * Хранилище строки в браузере для useSyncExternalStore: подписка на изменения (в том числе из другой вкладки) и запись.
 * Если хранилище закрыто, значение живёт в памяти до перезагрузки страницы.
 */
export function createLocalStore(key: string) {
  const event = `mb-store:${key}`;
  let memory: string | null = null;
  return {
    subscribe(cb: () => void) {
      window.addEventListener("storage", cb);
      window.addEventListener(event, cb);
      return () => {
        window.removeEventListener("storage", cb);
        window.removeEventListener(event, cb);
      };
    },
    read(): string | null {
      try {
        return localStorage.getItem(key);
      } catch {
        return memory;
      }
    },
    write(value: string | null) {
      memory = value;
      try {
        if (value === null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
      } catch {}
      window.dispatchEvent(new Event(event));
    },
  };
}
