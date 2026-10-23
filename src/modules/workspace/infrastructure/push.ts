import "server-only";
import webpush from "web-push";
import { and, count, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/shared/infrastructure/db";
import { crmMobileDevices, crmNotifications, crmPushSubscriptions } from "@/shared/infrastructure/db/schema";
import { env } from "@/config/env";
import { site } from "@/config/site";
import { getSetting, saveSettings } from "@/modules/workspace/infrastructure/settings";
import { apnsConfig, sendApns } from "./apns";

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

/**
 * Push на телефоны сотрудников с мобильным приложением (iPhone — APNs). На значке — число непрочитанных уведомлений
 * сотрудника. Токены, которые Apple больше не принимает, удаляются. Ключ APNs не задан — тихо ничего не делаем.
 */
export async function pushToMobile(userIds: string[], payload: PushPayload) {
  const cfg = apnsConfig();
  if (!cfg || !userIds.length) return;
  const devices = await db.select().from(crmMobileDevices).where(and(inArray(crmMobileDevices.userId, userIds), eq(crmMobileDevices.platform, "ios")));
  if (!devices.length) return;
  const unread = new Map<string, number>();
  const rows = await db.select({ userId: crmNotifications.userId, n: count() }).from(crmNotifications).where(and(inArray(crmNotifications.userId, userIds), isNull(crmNotifications.readAt))).groupBy(crmNotifications.userId);
  for (const r of rows) unread.set(r.userId, r.n);
  await Promise.all(
    devices.map(async (d) => {
      const result = await sendApns(cfg, d, { title: payload.title, body: payload.body, link: payload.link, badge: unread.get(d.userId) ?? 0 });
      if (result === "gone") await db.delete(crmMobileDevices).where(eq(crmMobileDevices.id, d.id));
    }),
  );
}

/** Push на все устройства сотрудников: браузеры (Web Push) и телефоны. Устаревшие подписки (410/404) удаляются. */
export async function pushTo(userIds: string[], payload: PushPayload) {
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
