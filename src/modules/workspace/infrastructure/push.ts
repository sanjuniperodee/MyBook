import "server-only";
import webpush from "web-push";
import { and, count, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/shared/infrastructure/db";
import { crmMobileDevices, crmNotifications, crmPushSubscriptions } from "@/shared/infrastructure/db/schema";
import { env } from "@/config/env";
import { site } from "@/config/site";
import { getSetting, saveSettings } from "@/modules/workspace/infrastructure/settings";
import { apnsConfig, sendApns } from "./apns";
import { fcmConfig, sendFcm } from "./fcm";

/** Ключи VAPID создаются один раз и хранятся в настройках (приватный — зашифрованным). */
export async function vapidKeys() {
  let publicKey = await getSetting("push.vapidPublic");
  let privateKey = await getSetting("push.vapidPrivate");
  if (!publicKey || !privateKey) {
    const keys = webpush.generateVAPIDKeys();
    await saveSettings({ "push.vapidPublic": keys.publicKey, "push.vapidPrivate": keys.privateKey }, null);
    publicKey = keys.publicKey;
    privateKey = keys.privateKey;
  }
  return { publicKey, privateKey };
}

interface PushPayload {
  title: string;
  body?: string;
  link?: string | null;
  tag?: string;
}

/** Непрочитанные уведомления сотрудников — число на значке приложения. */
async function unreadCounts(userIds: string[]) {
  const unread = new Map<string, number>();
  const rows = await db.select({ userId: crmNotifications.userId, n: count() }).from(crmNotifications).where(and(inArray(crmNotifications.userId, userIds), isNull(crmNotifications.readAt))).groupBy(crmNotifications.userId);
  for (const r of rows) unread.set(r.userId, r.n);
  return unread;
}

/**
 * Push на телефоны сотрудников с мобильным приложением: iPhone — APNs, Android — FCM. На значке — число непрочитанных
 * уведомлений сотрудника. Токены, которые Apple или Google больше не принимают, удаляются. Ключей нет — тихо ничего не делаем.
 */
export async function pushToMobile(userIds: string[], payload: PushPayload & { kind?: string }) {
  await pushToApp("crm", userIds, payload);
}

/**
 * Push клиенту в «MyBooks» (ответ менеджера, заказ, оплата, письмо близкого): только устройства клиентского приложения,
 * без значка (у клиента нет счётчика уведомлений CRM). link — адрес страницы сайта; приложение открывает свой экран.
 */
export async function pushToClient(userId: string, payload: PushPayload & { kind?: string }) {
  await pushToApp("client", [userId], payload);
}

async function pushToApp(app: "crm" | "client", userIds: string[], payload: PushPayload & { kind?: string }) {
  const apns = apnsConfig();
  const fcm = fcmConfig();
  if ((!apns && !fcm) || !userIds.length) return;
  const platforms = [...(apns ? ["ios"] : []), ...(fcm ? ["android"] : [])];
  const devices = await db
    .select()
    .from(crmMobileDevices)
    .where(and(inArray(crmMobileDevices.userId, userIds), inArray(crmMobileDevices.platform, platforms), eq(crmMobileDevices.app, app)));
  if (!devices.length) return;
  const unread = app === "crm" ? await unreadCounts(userIds) : new Map<string, number>();
  await Promise.all(
    devices.map(async (d) => {
      const badge = app === "crm" ? (unread.get(d.userId) ?? 0) : undefined;
      const result =
        d.platform === "android"
          ? await sendFcm(fcm!, d.token, { title: payload.title, body: payload.body, link: payload.link, tag: payload.tag, kind: payload.kind, badge })
          : await sendApns(apns!, d, { title: payload.title, body: payload.body, link: payload.link, badge, collapseId: payload.tag });
      if (result === "gone") await db.delete(crmMobileDevices).where(eq(crmMobileDevices.id, d.id));
    }),
  );
}

/**
 * Сотрудник прочитал (открыл диалог, отметил уведомление): число на значке его iPhone обновляется тихим push без звука
 * и текста — иначе значок показывал бы старое число до следующего уведомления. Android значок считает сам.
 */
export async function syncMobileBadge(userId: string) {
  const apns = apnsConfig();
  if (!apns) return;
  const devices = await db.select().from(crmMobileDevices).where(and(eq(crmMobileDevices.userId, userId), eq(crmMobileDevices.platform, "ios"), eq(crmMobileDevices.app, "crm")));
  if (!devices.length) return;
  const badge = (await unreadCounts([userId])).get(userId) ?? 0;
  await Promise.all(
    devices.map(async (d) => {
      const result = await sendApns(apns, d, { badgeOnly: true, title: "", badge });
      if (result === "gone") await db.delete(crmMobileDevices).where(eq(crmMobileDevices.id, d.id));
    }),
  );
}

/**
 * Уведомления сотрудника о диалоге (ссылка /admin/chats?c=<id>) — прочитаны: он открыл чат в CRM или в приложении, и
 * колокольчик, значок и шторка телефона не должны звать его туда снова. Возвращает, было ли что снимать.
 */
export async function readChatNotifications(userId: string, conversationId: string) {
  const r = await db
    .update(crmNotifications)
    .set({ readAt: new Date() })
    .where(and(eq(crmNotifications.userId, userId), isNull(crmNotifications.readAt), eq(crmNotifications.link, `/admin/chats?c=${conversationId}`)))
    .returning({ id: crmNotifications.id });
  if (!r.length) return false;
  void syncMobileBadge(userId).catch((err) => console.error("[push:badge]", err));
  return true;
}

/** Push на все устройства сотрудников: браузеры (Web Push) и телефоны. Устаревшие подписки (410/404) удаляются. */
export async function pushTo(userIds: string[], payload: PushPayload & { kind?: string }) {
  if (!userIds.length) return;
  void pushToMobile(userIds, payload).catch((err) => console.error("[push:mobile]", err));
  const subs = await db.select().from(crmPushSubscriptions).where(inArray(crmPushSubscriptions.userId, userIds));
  if (!subs.length) return;
  const { publicKey, privateKey } = await vapidKeys();
  const subject = env.appUrl.startsWith("https://") ? env.appUrl : `mailto:${site.contacts.email}`;
  const body = JSON.stringify({ title: payload.title, body: payload.body ?? "", link: payload.link ?? "/admin", tag: payload.tag });
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { vapidDetails: { subject, publicKey, privateKey }, TTL: 3600 });
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await db.delete(crmPushSubscriptions).where(eq(crmPushSubscriptions.id, s.id));
        else console.error("[push]", code ?? err);
      }
    }),
  );
}
