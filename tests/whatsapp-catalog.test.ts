import { describe, expect, it, vi } from "vitest";
import {
  cardFromGowaPayload,
  cardLine,
  formatPrice,
  graphError,
  orderItemsFromGateway,
  parseCard,
  parseCatalogSettings,
  parseGraphProduct,
  productCaption,
  productInfo,
  reviewLabel,
  validateDraft,
  type CatalogProduct,
  type ProductDraft,
} from "@/modules/messaging/domain/catalog";
import { parseGowaWebhook } from "@/modules/messaging/domain/gowa";
import { CatalogService, type CatalogGateway, type CatalogStore, type StoredProduct } from "@/modules/messaging/application/catalog";

/** Каталог WhatsApp Business из CRM (docs/whatsapp-catalog.md). */

/** Товар, как его отдаёт GraphQL каталога WhatsApp (сокращено из ответа нашего номера 23.11.2026). */
const graphProduct = {
  id: "29539303028997366",
  retailer_id: "book-1",
  is_hidden: "FALSE",
  name: "Книга изнутри",
  description: "Примеры книги",
  url: null,
  currency: "KZT",
  price: "25000000",
  status_info: { can_appeal: "true", status: "APPROVED" },
  media: {
    images: [
      { id: "1", original_image_url: "https://mmg.whatsapp.net/a.jpg", request_image_url: "https://mmg.whatsapp.net/a-400.jpg" },
      { id: "2", original_image_url: "https://mmg.whatsapp.net/b.jpg", request_image_url: "https://mmg.whatsapp.net/b-400.jpg" },
    ],
    videos: [{ id: "3", original_video_url: "https://video.xx.fbcdn.net/v.mp4" }],
  },
};

const draft = (over: Partial<ProductDraft> = {}): ProductDraft => ({ name: "Книга о маме", description: "", price: 25000, currency: "KZT", retailerId: "", url: "", hidden: false, ...over });

describe("товар из GraphQL каталога", () => {
  it("цена — в тысячных долях, скрытость — флагом «TRUE/FALSE», фото и видео — по порядку", () => {
    const p = parseGraphProduct(graphProduct)!;
    expect(p).toMatchObject({ id: "29539303028997366", name: "Книга изнутри", price: 25000, currency: "KZT", retailerId: "book-1", hidden: false, review: "APPROVED" });
    expect(p.imageUrls).toEqual(["https://mmg.whatsapp.net/a.jpg", "https://mmg.whatsapp.net/b.jpg"]);
    expect(p.videoUrls).toEqual(["https://video.xx.fbcdn.net/v.mp4"]);
    expect(parseGraphProduct({ ...graphProduct, is_hidden: "TRUE", price: null, currency: null })).toMatchObject({ hidden: true, price: null, currency: "KZT" });
  });

  it("без числового id — не товар", () => {
    expect(parseGraphProduct({ ...graphProduct, id: "x/../1" })).toBeNull();
    expect(parseGraphProduct(null)).toBeNull();
  });

  it("product_info для правки: цена ×1000 строкой, пустые поля не уходят, видео сохраняются", () => {
    expect(productInfo(draft(), ["https://mmg.whatsapp.net/p.jpg"])).toEqual({ name: "Книга о маме", media: { image: [{ url: "https://mmg.whatsapp.net/p.jpg" }] }, is_hidden: false, currency: "KZT", price: "25000000" });
    const info = productInfo(draft({ price: null, description: " Текст ", url: "https://mybooks.kz", retailerId: "A1", hidden: true }), ["u"], ["v"]);
    expect(info).toEqual({ name: "Книга о маме", media: { image: [{ url: "u" }], video: [{ url: "v" }] }, is_hidden: true, description: "Текст", url: "https://mybooks.kz", retailer_id: "A1" });
  });

  it("ошибка GraphQL — текстом из description, а не «A server error field_exception»", () => {
    expect(graphError({ data: { x: null }, errors: [{ message: "A server error field_exception occured.", description: "Bad Request Error while getting catalog", code: 2498049 }] })).toBe("Bad Request Error while getting catalog");
    expect(graphError({ error: { message: "Invalid OAuth access token", code: 190 } })).toBe("Invalid OAuth access token");
    expect(graphError({ data: {} })).toBeNull();
  });

  it("проверка ввода и подписи статусов", () => {
    expect(validateDraft(draft())).toBeNull();
    expect(validateDraft(draft({ name: " " }))).toMatch(/название/i);
    expect(validateDraft(draft({ url: "mybooks.kz" }))).toMatch(/http/);
    expect(validateDraft(draft({ currency: "тенге" }))).toMatch(/валют/i);
    expect(reviewLabel("OUTDATED").tone).toBe("wait");
    expect(reviewLabel("REJECTED").tone).toBe("bad");
    expect(formatPrice(25000)).toBe("25 000 ₸");
    expect(formatPrice(null)).toBe("");
  });
});

describe("карточки в переписке", () => {
  it("товар от клиента в вебхуке GOWA — карточка «product», текст — строка карточки, без служебного «Product…»", () => {
    const { messages } = parseGowaWebhook({
      event: "message",
      device_id: "77775932124@s.whatsapp.net",
      payload: {
        id: "3EB0AAA",
        chat_id: "77011234567@s.whatsapp.net",
        from_name: "Айгерим",
        timestamp: "2026-11-23T10:00:00Z",
        body: "Product\nКнига изнутри",
        product: { product_id: "29539303028997366", title: "Книга изнутри", currency_code: "KZT", price_amount_1000: 25000000, business_owner_jid: "77775932124@s.whatsapp.net" },
      },
    });
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ type: "product", text: "🛍️ Книга изнутри — 25 000 ₸", card: { kind: "product", productId: "29539303028997366", price: 25000 } });
  });

  it("корзина клиента — карточка «order» с суммой и сообщением клиента", () => {
    const card = cardFromGowaPayload({ order: { orderID: "1234567890", token: "tok==", itemCount: 2, orderTitle: "MyBooks", totalAmount1000: 50000000, totalCurrencyCode: "KZT", message: "Хочу две" } });
    expect(card).toEqual({ kind: "order", orderId: "1234567890", token: "tok==", title: "MyBooks", itemCount: 2, total: 50000, currency: "KZT", note: "Хочу две" });
    expect(cardLine(card!)).toBe("🛒 Заказ из каталога: 2 товара, 50 000 ₸");
    expect(orderItemsFromGateway({ products: [{ name: "Книга", quantity: 2, price: 25000000 }], price: { total: 50000000, currency: "KZT" } })).toEqual({ items: [{ name: "Книга", quantity: 2, price: 25000 }], total: 50000, currency: "KZT" });
  });

  it("из базы — только знакомые карточки; ссылка на каталог — только wa.me/c/<номер>", () => {
    expect(parseCard({ kind: "catalog", url: "https://wa.me/c/77775932124" })).toEqual({ kind: "catalog", url: "https://wa.me/c/77775932124" });
    expect(parseCard({ kind: "catalog", url: "https://evil.example/c/1" })).toBeNull();
    expect(parseCard({ kind: "poll" })).toBeNull();
  });

  it("настройки: по умолчанию включено, тенге; подпись подставляет {name} и {price}", () => {
    const s = parseCatalogSettings(null);
    expect(s).toMatchObject({ enabled: true, currency: "KZT", sendHidden: false });
    expect(parseCatalogSettings('{"enabled":false,"currency":"usd"}')).toMatchObject({ enabled: false, currency: "KZT" });
    expect(productCaption("{name} — {price}", { name: "Книга", price: 25000, currency: "KZT" })).toBe("Книга — 25 000 ₸");
  });
});

/** Копия каталога в памяти — для сервиса. */
function memoryStore(initial: StoredProduct[] = []): CatalogStore & { rows: Map<string, StoredProduct> } {
  const rows = new Map(initial.map((p) => [p.id, p]));
  return {
    rows,
    list: async () => [...rows.values()].sort((a, b) => a.position - b.position),
    get: async (id) => rows.get(id) ?? null,
    upsert: async (p, image, position) => void rows.set(p.id, { ...p, imageKey: image.key, imageSource: image.source, position: position ?? rows.size, syncedAt: new Date() }),
    keepOnly: async (ids) => {
      let n = 0;
      for (const id of [...rows.keys()])
        if (!ids.includes(id)) {
          rows.delete(id);
          n++;
        }
      return n;
    },
    remove: async (id) => void rows.delete(id),
    lastSyncedAt: async () => null,
  };
}

const product = (over: Partial<CatalogProduct> = {}): CatalogProduct => ({ id: "111", name: "Книга", description: "", price: 25000, currency: "KZT", retailerId: "", url: "", hidden: false, imageUrls: ["https://mmg.whatsapp.net/1.jpg"], videoUrls: [], review: "APPROVED", ...over });
const stored = (over: Partial<StoredProduct> = {}): StoredProduct => ({ ...product(), imageKey: "store:wa-catalog/111-1.jpg", imageSource: "https://mmg.whatsapp.net/1.jpg", position: 0, syncedAt: new Date(), ...over });

function service(store: CatalogStore, gateway: Partial<CatalogGateway>, sendCard = vi.fn(async () => ({ status: "sent" as const }))) {
  const full: CatalogGateway = {
    catalog: async () => [],
    createProduct: async () => product(),
    editProduct: async (id) => product({ id }),
    deleteProduct: async () => undefined,
    collections: async () => [],
    createCollection: async () => "1",
    updateCollection: async (id) => id,
    deleteCollection: async () => undefined,
    catalogImage: async () => ({ data: new Uint8Array([1]), mime: "image/jpeg" }),
    orderDetails: async () => null,
    ...gateway,
  };
  return new CatalogService({
    store,
    gateway: full,
    images: { save: async (id) => `store:wa-catalog/${id}-2.jpg`, read: async () => null, remove: async () => undefined },
    messages: { card: async () => null, setCard: async () => undefined },
    chats: () => ({ sendCard }) as never,
    settings: { get: async () => null, save: async () => undefined },
    shopPhone: async () => "77775932124",
    logger: { info: () => undefined, warn: () => undefined, error: () => undefined } as never,
  });
}

describe("сервис каталога", () => {
  it("синхронизация: новые товары — в копию, удалённые в WhatsApp — из копии; та же обложка не качается заново", async () => {
    const store = memoryStore([stored(), stored({ id: "222", name: "Старый" })]);
    const catalogImage = vi.fn(async () => ({ data: new Uint8Array([1]), mime: "image/jpeg" }));
    const r = await service(store, { catalog: async () => [product(), product({ id: "333", imageUrls: ["https://mmg.whatsapp.net/3.jpg"] })], catalogImage }).sync();
    expect(r).toEqual({ total: 2, removed: 1 });
    expect([...store.rows.keys()].sort()).toEqual(["111", "333"]);
    expect(catalogImage).toHaveBeenCalledTimes(1);
    expect(store.rows.get("111")!.imageKey).toBe("store:wa-catalog/111-1.jpg");
  });

  it("правка: видео товара уходят обратно в WhatsApp, фото — какие оставили", async () => {
    const store = memoryStore([stored({ imageUrls: ["u1", "u2"], videoUrls: ["v1"] })]);
    const editProduct = vi.fn(async (id: string) => product({ id }));
    await service(store, { editProduct }).update("111", draft({ name: "Новое" }), [], ["u2"]);
    expect(editProduct).toHaveBeenCalledWith("111", expect.objectContaining({ name: "Новое" }), [], ["u2"], ["v1"]);
  });

  it("без фото товар не создаётся и не остаётся", async () => {
    const store = memoryStore([stored()]);
    const s = service(store, {});
    await expect(s.create(draft(), [])).rejects.toThrow(/фото/);
    await expect(s.update("111", draft(), [], [])).rejects.toThrow(/фото/);
  });

  it("товар в чат: карточка с ценой и фото копии, скрытый — нельзя", async () => {
    const sendCard = vi.fn(async () => ({ status: "sent" as const }));
    const store = memoryStore([stored(), stored({ id: "222", hidden: true })]);
    const s = service(store, {}, sendCard);
    await s.sendProduct("conv", "111", "staff");
    expect(sendCard).toHaveBeenCalledWith(
      "conv",
      expect.objectContaining({ kind: "product", productId: "111", price: 25000, imageUrl: "https://mmg.whatsapp.net/1.jpg" }),
      expect.objectContaining({ text: "🛍️ Книга — 25 000 ₸", mediaUrl: "store:wa-catalog/111-1.jpg", card: expect.objectContaining({ kind: "product", productId: "111" }) }),
      "staff",
    );
    await expect(s.sendProduct("conv", "222", "staff")).rejects.toThrow(/скрыт/);
  });

  it("весь каталог — ссылка wa.me/c/<номер магазина> с текстом из настроек", async () => {
    const sendCard = vi.fn(async () => ({ status: "sent" as const }));
    await service(memoryStore([stored()]), {}, sendCard).sendCatalog("conv", "staff");
    expect(sendCard).toHaveBeenCalledWith("conv", expect.objectContaining({ kind: "catalog", imageUrl: "https://mmg.whatsapp.net/1.jpg" }), { text: "Посмотрите наш каталог в WhatsApp:\nhttps://wa.me/c/77775932124", card: { kind: "catalog", url: "https://wa.me/c/77775932124" }, mediaUrl: null }, "staff");
  });
});

describe("мутации каталога через шлюз", () => {
  it("бизнес — по LID номера, actor_id — бизнес-персона из токена, размер фото числом; ответ — товар", async () => {
    vi.doMock("server-only", () => ({}));
    const { waCatalogGateway, WA_CATALOG } = await import("@/modules/messaging/infrastructure/waCatalog");
    const calls: { doc: string; variables: unknown }[] = [];
    const gowa = {
      catalogToken: async () => ({ businessPersonId: "61578507209024", jid: "77775932124@s.whatsapp.net", lid: "94687587229775@lid" }),
      uploadProductImages: async () => ["https://mmg.whatsapp.net/v/t72/new"],
      catalogGraphql: async (doc: string, variables: unknown) => {
        calls.push({ doc, variables });
        return { data: { xfb_whatsapp_catalog_add_product: { product: graphProduct } } };
      },
    };
    const gw = waCatalogGateway(gowa as never, async () => "77775932124");
    const p = await gw.createProduct(draft(), [{ data: new Uint8Array([1]), name: "a.jpg", mime: "image/jpeg" }]);
    expect(p.id).toBe("29539303028997366");
    expect(calls[0].doc).toBe(WA_CATALOG.docs.add);
    expect(calls[0].variables).toEqual({
      input: {
        product: { biz_jid: "94687587229775@lid", width: 400, height: 400, product_info: { name: "Книга о маме", media: { image: [{ url: "https://mmg.whatsapp.net/v/t72/new" }] }, is_hidden: false, currency: "KZT", price: "25000000" } },
        actor_id: "61578507209024",
      },
    });
  });
});

describe("коллекции и смена doc_id", () => {
  it("коллекция из GraphQL: статус без приставки STATUS_, товары по id", async () => {
    const { parseGraphCollection, collectionDiff, parseCatalogDocs, looksLikeStaleDoc } = await import("@/modules/messaging/domain/catalog");
    expect(parseGraphCollection({ id: "1498546245461147", name: "Книги маме", status_info: { status: "STATUS_APPROVED" }, products: [{ id: "29070847985913378" }, { id: "bad" }] })).toEqual({ id: "1498546245461147", name: "Книги маме", review: "APPROVED", productIds: ["29070847985913378"] });
    expect(collectionDiff(["1", "2"], ["2", "3"])).toEqual({ add: ["3"], remove: ["1"] });
    expect(parseCatalogDocs('{"add":"123456789","edit":"x","hack":"999999999"}')).toEqual({ add: "123456789" });
    expect(parseCatalogDocs("not json")).toEqual({});
    expect(looksLikeStaleDoc("PersistedQueryNotFound")).toBe(true);
    expect(looksLikeStaleDoc("Bad Request Error while getting catalog")).toBe(false);
  });

  it("правка коллекции считает, что добавить и убрать; удаление проверяется перечитыванием", async () => {
    const updateCollection = vi.fn(async () => "NEW1");
    let list = [{ id: "C1", name: "Маме", review: "APPROVED", productIds: ["111", "222"] }];
    const s = service(memoryStore(), { collections: async () => list, updateCollection, deleteCollection: async () => undefined });
    await expect(s.updateCollection("C1", "Маме и бабушке", ["222", "333"])).resolves.toBe("NEW1");
    expect(updateCollection).toHaveBeenCalledWith("C1", { name: "Маме и бабушке", add: ["333"], remove: ["111"] });
    await expect(s.deleteCollection("C1")).rejects.toThrow(/не удалил/);
    list = [];
    await expect(s.deleteCollection("C1")).resolves.toBeUndefined();
    await expect(s.createCollection("", ["1"])).rejects.toThrow(/название/i);
  });

  it("замена doc_id из настроек уходит в запрос шлюза", async () => {
    vi.doMock("server-only", () => ({}));
    const { waCatalogGateway } = await import("@/modules/messaging/infrastructure/waCatalog");
    const docs: string[] = [];
    const gowa = {
      catalogToken: async () => ({ businessPersonId: "1", jid: "", lid: "9@lid" }),
      catalogGraphql: async (doc: string) => (docs.push(doc), { data: { xfb_whatsapp_catalog_delete_product: { deleted_count: 1 } } }),
    };
    await waCatalogGateway(gowa as never, async () => "77775932124", async () => ({ remove: "1234567" })).deleteProduct("111");
    expect(docs).toEqual(["1234567"]);
  });
});
