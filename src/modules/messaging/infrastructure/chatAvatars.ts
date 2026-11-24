import "server-only";
import { createHash, createHmac } from "node:crypto";
import sharp from "sharp";
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { crmConversations } from "@/shared/infrastructure/db/schema";
import { executor } from "@/shared/infrastructure/database";
import { getFile, putFile } from "@/shared/infrastructure/storage";
import { GOWA_CHANNEL } from "../domain/gowa";
import type { AvatarDeps } from "../application/chatAvatars";
import type { GowaClient } from "./gowa";

/**
 * Фото профиля клиентов WhatsApp в чатах CRM и приложения. Адрес картинки от WhatsApp живёт недолго, поэтому храним
 * свою копию (192×192 webp) в хранилище сайта и отдаём её по подписанной ссылке /api/chat-avatar/<файл>: ссылка
 * не истекает и меняется вместе с фото (в имени id фото), поэтому браузер и приложение кэшируют её навсегда.
 */

const SIZE = 192;
const MAX_BYTES = 3 * 1024 * 1024;
/** id фото у WhatsApp — число; в имя файла и ссылку попадает только такое. */
const AVATAR_ID = /^\d{1,30}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function secret() {
  return process.env.APP_SECRET || createHash("sha256").update(`mybook:${process.env.DATABASE_URL ?? ""}`).digest("hex");
}

const sign = (conversationId: string, avatarId: string) => createHmac("sha256", secret()).update(`chat-avatar:${conversationId}:${avatarId}`).digest("base64url").slice(0, 22);
const storageKey = (conversationId: string, avatarId: string) => `chat-avatars/${conversationId}/${avatarId}.webp`;

/** Ссылка на фото для CRM и приложения (без входа: подпись не угадать). */
export function chatAvatarUrl(conversationId: string, avatarId: string) {
  return `/api/chat-avatar/${conversationId}_${avatarId}_${sign(conversationId, avatarId)}.webp`;
}

/** Файл фото по имени из ссылки; чужая подпись или нет файла — null. */
export async function readChatAvatar(file: string): Promise<Uint8Array | null> {
  const m = /^([0-9a-f-]{36})_(\d{1,30})_([\w-]{22})\.webp$/.exec(file);
  if (!m || !UUID.test(m[1]) || m[3] !== sign(m[1], m[2])) return null;
  try {
    return new Uint8Array(await getFile(storageKey(m[1], m[2])));
  } catch {
    return null;
  }
}

/** Картинка с сервера WhatsApp → квадрат 192 webp. Адрес берём только у WhatsApp. */
async function downloadAvatar(url: string): Promise<Uint8Array> {
  const u = new URL(url);
  if (u.protocol !== "https:" || !(u.hostname === "whatsapp.net" || u.hostname.endsWith(".whatsapp.net"))) throw new Error(`avatar host ${u.hostname}`);
  const res = await fetch(u, { signal: AbortSignal.timeout(20_000), redirect: "error" });
  if (!res.ok) throw new Error(`avatar HTTP ${res.status}`);
  const data = Buffer.from(await res.arrayBuffer());
  if (data.length > MAX_BYTES) throw new Error("avatar too large");
  return new Uint8Array(await sharp(data, { failOn: "error", limitInputPixels: 25_000_000 }).rotate().resize(SIZE, SIZE, { fit: "cover" }).webp({ quality: 80 }).toBuffer());
}

/** Зависимости прохода на настоящей базе, хранилище и шлюзе. */
export function chatAvatarDeps(gowa: GowaClient): AvatarDeps {
  return {
    async due(limit, checkedBefore) {
      return executor()
        .select({ id: crmConversations.id, chatId: crmConversations.chatId, avatarUrl: crmConversations.avatarUrl })
        .from(crmConversations)
        .where(and(eq(crmConversations.channel, "whatsapp"), eq(crmConversations.channelId, GOWA_CHANNEL), or(isNull(crmConversations.avatarCheckedAt), lt(crmConversations.avatarCheckedAt, checkedBefore))))
        // Сначала ни разу не проверенные, среди них — где писали последними.
        .orderBy(sql`${crmConversations.avatarCheckedAt} is null desc`, sql`${crmConversations.lastMessageAt} desc nulls last`)
        .limit(limit);
    },
    avatar: (chatId) => gowa.avatar(chatId),
    async store(conversationId, avatarId, url) {
      if (!AVATAR_ID.test(avatarId) || !UUID.test(conversationId)) throw new Error("bad avatar id");
      await putFile(storageKey(conversationId, avatarId), await downloadAvatar(url));
      return chatAvatarUrl(conversationId, avatarId);
    },
    async save(conversationId, avatarUrl, at) {
      await executor()
        .update(crmConversations)
        .set(avatarUrl === undefined ? { avatarCheckedAt: at } : { avatarUrl, avatarCheckedAt: at })
        .where(eq(crmConversations.id, conversationId));
    },
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    now: () => new Date(),
    logger: { error: (msg, err) => console.error(`[chat-avatars] ${msg}`, err instanceof Error ? err.message : err) },
  };
}

