import type { Logger } from "@/shared/application";
import { CATALOG_LIMITS, cardLine, catalogLink, orderItemsFromGateway, parseCard, parseCatalogSettings, productCaption, validateDraft, type CatalogProduct, type CatalogSettings, type MessageCard, type ProductDraft } from "../domain/catalog";
import type { OutgoingCard } from "./ports";
import { MessageActionError, type MessagingService } from "./services";

/** Товар в копии каталога у нас: товар WhatsApp и копия обложки (store:wa-catalog/…). */
export interface StoredProduct extends CatalogProduct {
  imageKey: string | null;
  imageSource: string | null;
  position: number;
  syncedAt: Date;
}

/** Копия каталога в БД. */
export interface CatalogStore {
  list(): Promise<StoredProduct[]>;
  get(id: string): Promise<StoredProduct | null>;
  upsert(p: CatalogProduct, image: { key: string | null; source: string | null }, position: number | null): Promise<void>;
  /** Оставить только эти товары (остальных в WhatsApp больше нет). */
  keepOnly(ids: string[]): Promise<number>;
  remove(id: string): Promise<void>;
  lastSyncedAt(): Promise<Date | null>;
}

/** Шлюз WhatsApp — каталог номера магазина (GowaClient). */
export interface CatalogGateway {
  catalog(): Promise<CatalogProduct[]>;
  createProduct(draft: ProductDraft, images: UploadImage[]): Promise<CatalogProduct>;
  /** Товар целиком: WhatsApp заменяет все поля. Фото — keep (уже в WhatsApp, по порядку) и новые images. */
  editProduct(id: string, draft: ProductDraft, images: UploadImage[], keep: string[], videos: string[]): Promise<CatalogProduct>;
  deleteProduct(id: string): Promise<void>;
  catalogImage(url: string): Promise<{ data: Uint8Array; mime: string }>;
  orderDetails(orderId: string, token: string): Promise<unknown>;
}

/** Файлы копий обложек: ключ хранилища → ссылка store:… для сообщений. */
export interface CatalogImages {
  save(productId: string, image: { data: Uint8Array; mime: string }): Promise<string>;
  read(ref: string): Promise<{ data: Uint8Array; mime: string } | null>;
  remove(key: string): Promise<void>;
}

/** Сообщение с карточкой корзины (для «Показать состав»). */
export interface CardMessages {
  card(messageId: string): Promise<{ conversationId: string; card: unknown } | null>;
  setCard(messageId: string, card: MessageCard): Promise<void>;
}

export type UploadImage = { data: Uint8Array; name: string; mime: string };

const IMAGE_MIME = /^image\/(jpeg|png|webp)$/;

/**
 * Каталог товаров WhatsApp Business из CRM (docs/whatsapp-catalog.md): источник правды — каталог в WhatsApp, все правки
 * идут через шлюз, а копия у нас обновляется ответом WhatsApp и синхронизацией. Отсюда же товары и ссылка на каталог
 * уходят клиентам в чат.
 */
export class CatalogService {
  constructor(
    private readonly deps: {
      store: CatalogStore;
      gateway: CatalogGateway;
      images: CatalogImages;
      messages: CardMessages;
      chats: () => MessagingService;
      settings: { get(): Promise<string | null>; save(raw: string, actorId: string): Promise<void> };
      shopPhone: () => Promise<string>;
      logger: Logger;
    },
  ) {}

  async settings(): Promise<CatalogSettings> {
    return parseCatalogSettings(await this.deps.settings.get());
  }

  async saveSettings(s: CatalogSettings, actorId: string) {
    await this.deps.settings.save(JSON.stringify(s), actorId);
  }

  list() {
    return this.deps.store.list();
  }

  lastSyncedAt() {
    return this.deps.store.lastSyncedAt();
  }

  /** Обложка товара для CRM: копия у нас, нет копии — из WhatsApp (и копия на будущее). */
  async image(id: string): Promise<{ data: Uint8Array; mime: string } | null> {
    const p = await this.deps.store.get(id);
    if (!p) return null;
    if (p.imageKey) {
      const own = await this.deps.images.read(p.imageKey);
      if (own) return own;
    }
    const source = p.imageUrls[0];
    if (!source) return null;
    const fresh = await this.deps.gateway.catalogImage(source).catch(() => null);
    if (!fresh) return null;
    const key = await this.deps.images.save(p.id, fresh).catch(() => null);
    if (key) await this.deps.store.upsert(p, { key, source }, p.position);
    return fresh;
  }

  /** Копия старше maxAgeMs (или её нет) — забрать каталог из WhatsApp; ошибка WhatsApp не мешает показать копию. */
  async syncIfStale(maxAgeMs: number, now = Date.now()): Promise<string | null> {
    const last = await this.deps.store.lastSyncedAt();
    if (last && now - last.getTime() < maxAgeMs) return null;
    try {
      await this.sync();
      return null;
    } catch (err) {
      this.deps.logger.error("catalog sync", err);
      return err instanceof Error ? err.message : String(err);
    }
  }

  /**
   * Забрать каталог из WhatsApp: новые и изменённые товары — в копию (с копией обложки), удалённые в WhatsApp —
   * из копии. Товары, созданные или изменённые в приложении WhatsApp Business, тоже приходят сюда.
   */
  async sync(): Promise<{ total: number; removed: number }> {
    const products = await this.deps.gateway.catalog();
    const known = new Map((await this.deps.store.list()).map((p) => [p.id, p]));
    for (const [position, p] of products.entries()) await this.deps.store.upsert(p, await this.cover(p, known.get(p.id) ?? null), position);
    const removed = await this.deps.store.keepOnly(products.map((p) => p.id));
    return { total: products.length, removed };
  }

  /** Копия обложки: та же фотография — прежняя копия, новая — скачать через шлюз. Не вышло — без копии (покажем из WhatsApp позже). */
  private async cover(p: CatalogProduct, prev: StoredProduct | null, fresh?: UploadImage | null): Promise<{ key: string | null; source: string | null }> {
    const source = p.imageUrls[0] ?? null;
    if (!source) return { key: null, source: null };
    if (prev?.imageKey && prev.imageSource === source && !fresh) return { key: prev.imageKey, source };
    try {
      const image = fresh && IMAGE_MIME.test(fresh.mime) ? { data: fresh.data, mime: fresh.mime } : await this.deps.gateway.catalogImage(source);
      const key = await this.deps.images.save(p.id, image);
      return { key, source };
    } catch (err) {
      this.deps.logger.error("catalog cover", err);
      return { key: prev?.imageKey ?? null, source: prev?.imageKey ? (prev.imageSource ?? null) : null };
    }
  }

  private checkImages(images: UploadImage[]) {
    if (images.length > CATALOG_LIMITS.images) throw new MessageActionError(`Не больше ${CATALOG_LIMITS.images} фото у товара`);
    for (const img of images) {
      if (!IMAGE_MIME.test(img.mime)) throw new MessageActionError("Фото товара — JPEG, PNG или WebP");
      if (img.data.length > CATALOG_LIMITS.imageBytes) throw new MessageActionError("Фото больше 8 МБ — уменьшите его");
      if (!img.data.length) throw new MessageActionError("Пустой файл фото");
    }
  }

  async create(draft: ProductDraft, images: UploadImage[]): Promise<StoredProduct> {
    const problem = validateDraft(draft);
    if (problem) throw new MessageActionError(problem);
    if (!images.length) throw new MessageActionError("Добавьте хотя бы одно фото — без фото WhatsApp товар не примет");
    this.checkImages(images);
    const p = await this.deps.gateway.createProduct(draft, images);
    await this.deps.store.upsert(p, await this.cover(p, null, images[0]), null);
    return (await this.deps.store.get(p.id))!;
  }

  /** Изменить товар. keep — какие фото из WhatsApp оставить (по порядку), images — новые; фото не трогали — keep = null. */
  async update(id: string, draft: ProductDraft, images: UploadImage[], keep: string[] | null): Promise<StoredProduct> {
    const prev = await this.deps.store.get(id);
    if (!prev) throw new MessageActionError("Товар не найден — обновите каталог");
    const problem = validateDraft(draft);
    if (problem) throw new MessageActionError(problem);
    this.checkImages(images);
    const kept = keep?.filter((u) => prev.imageUrls.includes(u)) ?? null;
    if (kept && !kept.length && !images.length) throw new MessageActionError("У товара должно остаться хотя бы одно фото");
    const keepUrls = kept ?? prev.imageUrls;
    const p = await this.deps.gateway.editProduct(id, draft, images, keepUrls, prev.videoUrls);
    const firstNew = !keepUrls.length ? images[0] : null;
    await this.deps.store.upsert(p, await this.cover(p, prev, firstNew), prev.position);
    return (await this.deps.store.get(p.id))!;
  }

  /** Скрыть или показать товар в каталоге клиента (без удаления). */
  async setHidden(id: string, hidden: boolean): Promise<void> {
    const prev = await this.deps.store.get(id);
    if (!prev) throw new MessageActionError("Товар не найден — обновите каталог");
    const p = await this.deps.gateway.editProduct(id, { name: prev.name, description: prev.description, price: prev.price, currency: prev.currency, retailerId: prev.retailerId, url: prev.url, hidden }, [], prev.imageUrls, prev.videoUrls);
    await this.deps.store.upsert(p, { key: prev.imageKey, source: prev.imageSource }, prev.position);
  }

  async remove(id: string): Promise<void> {
    const prev = await this.deps.store.get(id);
    await this.deps.gateway.deleteProduct(id);
    await this.deps.store.remove(id);
    if (prev?.imageKey) await this.deps.images.remove(prev.imageKey).catch(() => undefined);
  }

  /** Товары для выбора в чате: видимые (скрытые — если так в настройках). */
  async forChat(): Promise<StoredProduct[]> {
    const settings = await this.settings();
    return (await this.deps.store.list()).filter((p) => settings.sendHidden || !p.hidden);
  }

  /** Карточка товара клиенту в чат: в WhatsApp — товар каталога, в CRM — карточка с фото и ценой. */
  async sendProduct(conversationId: string, productId: string, authorId: string) {
    const settings = await this.settings();
    if (!settings.enabled) throw new MessageActionError("Каталог в чатах выключен («Интеграции» → «Мессенджеры» → «Каталог WhatsApp»)");
    const p = await this.deps.store.get(productId);
    if (!p) throw new MessageActionError("Товар не найден — обновите каталог");
    if (p.hidden && !settings.sendHidden) throw new MessageActionError("Товар скрыт в каталоге — клиент его не откроет");
    const caption = productCaption(settings.productText, p);
    const card: MessageCard = { kind: "product", productId: p.id, name: p.name, description: p.description || undefined, price: p.price, currency: p.currency, retailerId: p.retailerId || undefined, url: p.url || undefined, body: caption || undefined };
    const text = [cardLine(card), caption].filter(Boolean).join("\n");
    const out: OutgoingCard = { kind: "product", productId: p.id, title: p.name, description: p.description, currency: p.currency, price: p.price, retailerId: p.retailerId, url: p.url, imageUrl: p.imageUrls[0] ?? null, imageCount: p.imageUrls.length, body: caption };
    return this.deps.chats().sendCard(conversationId, out, { text, card, mediaUrl: p.imageKey }, authorId);
  }

  /** Ссылка на весь каталог (wa.me/c/<номер магазина>) с текстом из настроек. */
  async sendCatalog(conversationId: string, authorId: string) {
    const settings = await this.settings();
    if (!settings.enabled) throw new MessageActionError("Каталог в чатах выключен («Интеграции» → «Мессенджеры» → «Каталог WhatsApp»)");
    const phone = (await this.deps.shopPhone()).replace(/\D/g, "");
    if (!phone) throw new MessageActionError("Номер магазина неизвестен — привяжите WhatsApp в «Интеграциях»");
    const url = catalogLink(phone);
    const text = [settings.linkText.trim(), url].filter(Boolean).join("\n");
    const first = (await this.deps.store.list()).find((p) => !p.hidden && p.imageUrls.length);
    const out: OutgoingCard = { kind: "catalog", text: settings.linkText.trim(), title: settings.linkTitle.trim(), description: settings.linkDescription.trim(), imageUrl: first?.imageUrls[0] ?? null };
    return this.deps.chats().sendCard(conversationId, out, { text, card: { kind: "catalog", url }, mediaUrl: null }, authorId);
  }

  /** Состав корзины, которую прислал клиент: спросить у WhatsApp и запомнить в карточке сообщения. */
  async orderItems(messageId: string): Promise<{ conversationId: string; card: MessageCard }> {
    const m = await this.deps.messages.card(messageId);
    const card = parseCard(m?.card);
    if (!m || !card || card.kind !== "order") throw new MessageActionError("Это не корзина из каталога");
    if (card.items?.length) return { conversationId: m.conversationId, card };
    if (!card.token) throw new MessageActionError("WhatsApp не передал ключ корзины — состав смотрите на телефоне магазина");
    const details = orderItemsFromGateway(await this.deps.gateway.orderDetails(card.orderId, card.token));
    const next: MessageCard = { ...card, items: details.items, total: card.total ?? details.total, currency: card.currency || details.currency };
    await this.deps.messages.setCard(messageId, next);
    return { conversationId: m.conversationId, card: next };
  }
}
