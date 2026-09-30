import "server-only";
import webpush from "web-push";
import { eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { crmPushSubscriptions } from "../db/schema";
import { env } from "../env";
import { site } from "@/config/site";
import { getSetting, saveSettings } from "./settings";

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

export interface PushPayload {
  title: string;
  body?: string;
  link?: string | null;
  tag?: string;
}

/** Push на все устройства сотрудников. Устаревшие подписки (410/404) удаляются. */
export async function pushTo(userIds: string[], payload: PushPayload) {
  if (!userIds.length) return;
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
