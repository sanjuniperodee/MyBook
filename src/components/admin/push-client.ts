"use client";

import { apiFetch } from "@/lib/client-api";

/*
 * Push на этом устройстве: подписка браузера и её копия в CRM. Общая часть для переключателя в колокольчике, «Ещё» и
 * плашки-приглашения (PushPrompt). Сервер шлёт push только на подписки из своей таблицы — браузерная подписка без копии
 * в CRM молчит, поэтому копия отправляется заново при каждом входе (сервер мог удалить её после ответа 404/410).
 */

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function pushSupported() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/** Воркер CRM: регистрирует его CrmLive; если ещё не успел — регистрируем сами, чтобы ready не висел вечно. */
async function worker(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration("/admin");
  if (!existing) await navigator.serviceWorker.register("/crm-sw.js", { scope: "/admin" });
  return navigator.serviceWorker.ready;
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const reg = await worker();
  return reg.pushManager.getSubscription();
}

/** Подписать устройство (разрешение уже дано) и сохранить подписку в CRM. Ключ VAPID сменился — подписка пересоздаётся. */
export async function subscribeDevice(): Promise<void> {
  const reg = await worker();
  const { publicKey } = await apiFetch<{ publicKey: string }>("/api/admin/push");
  const key = urlBase64ToUint8Array(publicKey);
  let sub = await reg.pushManager.getSubscription();
  const current = sub?.options.applicationServerKey;
  if (sub && current && !sameKey(new Uint8Array(current), key)) {
    await sub.unsubscribe().catch(() => {});
    sub = null;
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  await apiFetch("/api/admin/push", { method: "POST", json: sub.toJSON() });
}

export async function unsubscribeDevice(): Promise<void> {
  const sub = await currentSubscription();
  if (!sub) return;
  await apiFetch("/api/admin/push", { method: "DELETE", json: { endpoint: sub.endpoint } }).catch(() => {});
  await sub.unsubscribe();
}

/** Спросить разрешение (только из нажатия) и подписаться. Возвращает итоговое разрешение. */
export async function enablePush(): Promise<NotificationPermission> {
  const permission = await Notification.requestPermission();
  if (permission === "granted") await subscribeDevice();
  return permission;
}

/**
 * Тихое восстановление при входе в CRM: разрешение есть — подписка (новая или прежняя) ещё раз уходит в CRM.
 * Так push возвращаются после смены ключей, истёкшей подписки или удаления её сервером. Раз за сессию вкладки.
 */
export async function healPush(): Promise<boolean> {
  if (!pushSupported() || Notification.permission !== "granted") return false;
  if (sessionStorage.getItem("crm-push-healed")) return true;
  await subscribeDevice();
  sessionStorage.setItem("crm-push-healed", "1");
  return true;
}

function sameKey(a: Uint8Array, b: Uint8Array) {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}
