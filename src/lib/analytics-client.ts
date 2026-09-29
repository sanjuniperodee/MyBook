"use client";

type Fn = (...args: unknown[]) => void;
declare global {
  interface Window {
    ym?: Fn;
    gtag?: Fn;
    fbq?: Fn;
    __mbYm?: number;
  }
}

/** Цели в счётчиках. Названия одинаковые для Метрики, GA4 и Meta Pixel (как custom event). */
const pixelStandard: Record<string, string> = { sign_up: "CompleteRegistration", begin_checkout: "InitiateCheckout", purchase: "Purchase", gift_purchase: "Purchase" };

export function track(name: string, value?: number) {
  try {
    const currency = "KZT";
    if (window.ym && window.__mbYm) window.ym(window.__mbYm, "reachGoal", name, value ? { order_price: value, currency } : undefined);
    window.gtag?.("event", name, value ? { value, currency } : {});
    if (window.fbq) {
      const std = pixelStandard[name];
      if (std) window.fbq("track", std, value ? { value, currency } : {});
      else window.fbq("trackCustom", name);
    }
  } catch {}
}

/** Событие один раз на браузер (например, покупка при повторном открытии страницы заказа). */
export function trackOnce(key: string, name: string, value?: number) {
  try {
    if (localStorage.getItem(`mb_t_${key}`)) return;
    localStorage.setItem(`mb_t_${key}`, "1");
  } catch {}
  track(name, value);
}
