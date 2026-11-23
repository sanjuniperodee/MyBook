import "server-only";
import { asc, eq, max, notInArray } from "drizzle-orm";
import { crmMessages, waCatalogProducts } from "@/shared/infrastructure/db/schema";
import { executor } from "@/shared/infrastructure/database";
import { deleteFile, getFile, putFile } from "@/shared/infrastructure/storage";
import type { CardMessages, CatalogImages, CatalogStore, StoredProduct } from "../application/catalog";
import type { CatalogProduct, MessageCard } from "../domain/catalog";

type Row = typeof waCatalogProducts.$inferSelect;

const toProduct = (r: Row): StoredProduct => ({
  id: r.id,
  name: r.name,
  description: r.description,
  price: r.price,
  currency: r.currency,
  retailerId: r.retailerId,
  url: r.url,
  hidden: r.hidden,
  imageUrls: Array.isArray(r.imageUrls) ? r.imageUrls : [],
  videoUrls: Array.isArray(r.videoUrls) ? r.videoUrls : [],
  review: r.review,
  imageKey: r.imageKey,
  imageSource: r.imageSource,
  position: r.position,
  syncedAt: r.syncedAt,
});

/** Копия каталога WhatsApp в БД (wa_catalog_products). */
export const drizzleCatalogStore: CatalogStore = {
  async list() {
    const rows = await executor().select().from(waCatalogProducts).orderBy(asc(waCatalogProducts.position), asc(waCatalogProducts.name));
    return rows.map(toProduct);
  },
  async get(id) {
    if (!/^\d{1,40}$/.test(id)) return null;
    const [r] = await executor().select().from(waCatalogProducts).where(eq(waCatalogProducts.id, id)).limit(1);
    return r ? toProduct(r) : null;
  },
  async upsert(p: CatalogProduct, image, position) {
    let pos = position;
    if (pos == null) {
      const [m] = await executor().select({ v: max(waCatalogProducts.position) }).from(waCatalogProducts);
      pos = m?.v == null ? 0 : m.v + 1;
    }
    const values = {
      name: p.name,
      description: p.description,
      price: p.price == null ? null : Math.round(p.price),
      currency: p.currency,
      retailerId: p.retailerId,
      url: p.url,
      hidden: p.hidden,
      review: p.review,
      imageUrls: p.imageUrls,
      videoUrls: p.videoUrls,
      imageKey: image.key,
      imageSource: image.source,
      position: pos,
      syncedAt: new Date(),
    };
    await executor()
      .insert(waCatalogProducts)
      .values({ id: p.id, ...values })
      .onConflictDoUpdate({ target: waCatalogProducts.id, set: values });
  },
  async keepOnly(ids) {
    const rows = await executor()
      .delete(waCatalogProducts)
      .where(ids.length ? notInArray(waCatalogProducts.id, ids) : undefined)
      .returning({ key: waCatalogProducts.imageKey });
    for (const r of rows) if (r.key) await catalogImages.remove(r.key).catch(() => undefined);
    return rows.length;
  },
  async remove(id) {
    await executor().delete(waCatalogProducts).where(eq(waCatalogProducts.id, id));
  },
  async lastSyncedAt() {
    const [m] = await executor().select({ v: max(waCatalogProducts.syncedAt) }).from(waCatalogProducts);
    return m?.v ?? null;
  },
};

const PREFIX = "store:";
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** Копии обложек товаров: wa-catalog/<id товара>-<время>.<ext>; в сообщениях и списке — ссылка store:… */
export const catalogImages: CatalogImages = {
  async save(productId, image) {
    if (!/^\d{1,40}$/.test(productId)) throw new Error("bad product id");
    const ext = EXT[image.mime.split(";")[0].trim().toLowerCase()] ?? "jpg";
    const key = `wa-catalog/${productId}-${Date.now()}.${ext}`;
    await putFile(key, image.data);
    return `${PREFIX}${key}`;
  },
  async read(ref) {
    const key = ref.startsWith(PREFIX) ? ref.slice(PREFIX.length) : "";
    if (!/^wa-catalog\/\d{1,40}-\d{1,15}\.(jpg|png|webp)$/.test(key)) return null;
    try {
      const data = await getFile(key);
      const ext = key.split(".").pop() ?? "jpg";
      return { data: new Uint8Array(data), mime: Object.entries(EXT).find(([, e]) => e === ext)?.[0] ?? "image/jpeg" };
    } catch {
      return null;
    }
  },
  async remove(ref) {
    // Фото могло уйти карточкой в чат — сообщение ссылается на тот же файл; такие не удаляем.
    const [used] = await executor().select({ id: crmMessages.id }).from(crmMessages).where(eq(crmMessages.mediaUrl, ref)).limit(1);
    if (used || !ref.startsWith(PREFIX)) return;
    await deleteFile(ref.slice(PREFIX.length));
  },
};

/** Карточки сообщений: корзина клиента дополняется составом. */
export const cardMessages: CardMessages = {
  async card(messageId) {
    if (!/^[0-9a-f-]{36}$/i.test(messageId)) return null;
    const [m] = await executor().select({ conversationId: crmMessages.conversationId, card: crmMessages.card }).from(crmMessages).where(eq(crmMessages.id, messageId)).limit(1);
    return m ?? null;
  },
  async setCard(messageId, card: MessageCard) {
    await executor().update(crmMessages).set({ card }).where(eq(crmMessages.id, messageId));
  },
};
