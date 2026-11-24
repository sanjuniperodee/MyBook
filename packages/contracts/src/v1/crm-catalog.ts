/**
 * API v1 — каталог WhatsApp в приложении CRM: товары (фото, цена, проверка WhatsApp, скрыть, удалить), обновить из WhatsApp,
 * коллекции. Новые фото сначала загружаются (crmCatalogUpload → токены на 30 минут), затем товар сохраняется JSON с этими
 * токенами — так длинное описание и фото идут вместе в то же действие сайта (createProduct/updateProduct). Фото товаров —
 * маршруты сайта (Bearer): обложка /api/admin/catalog/{id}/image, любое фото — /api/admin/catalog/photo?u=.
 */
import { z } from "zod";
import { route, schemas, type RouteDef } from "./core";
import { Done } from "./crm";

const ProductId = z.object({ id: z.string().regex(/^\d{1,40}$/) });

export const CatalogPhoto = z.object({ url: z.string(), src: z.string() }).register(schemas, { id: "CatalogPhoto" });

export const CatalogItem = z
  .object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    price: z.number().nullable(),
    currency: z.string(),
    retailerId: z.string(),
    url: z.string(),
    hidden: z.boolean(),
    /** Проверка WhatsApp: APPROVED, PENDING, REJECTED…; пусто — неизвестно. */
    review: z.string(),
    /** Фото: адрес в WhatsApp (для «оставить») и адрес картинки через сайт. */
    photos: z.array(CatalogPhoto),
    coverSrc: z.string(),
    videos: z.number().int(),
  })
  .register(schemas, { id: "CatalogItem" });

export const CatalogCollection = z.object({ id: z.string(), name: z.string(), productIds: z.array(z.string()) }).register(schemas, { id: "CatalogCollection" });

export const Catalog = z
  .object({
    products: z.array(CatalogItem),
    collections: z.array(CatalogCollection),
    collectionsError: z.string().nullable(),
    /** Ссылка на весь каталог (wa.me/c/…); нет — номер не подключён. */
    link: z.string().nullable(),
    /** Не удалось обновить из WhatsApp — показана копия. */
    problem: z.string().nullable(),
    syncedLabel: z.string().nullable(),
  })
  .register(schemas, { id: "Catalog" });

export const CatalogUploads = z.object({ tokens: z.array(z.string()) }).register(schemas, { id: "CatalogUploads" });

export const CatalogProductBody = z
  .object({
    /** Нет — новый товар. */
    id: z.string().regex(/^\d{1,40}$/).nullable().optional(),
    name: z.string().trim().min(1).max(150),
    description: z.string().max(5000).default(""),
    /** Цена числом в тенге; пусто — без цены. */
    price: z.string().max(20).default(""),
    currency: z.string().length(3).default("KZT"),
    retailerId: z.string().max(100).default(""),
    url: z.string().max(2000).default(""),
    hidden: z.boolean().default(false),
    /** Какие фото из WhatsApp оставить (по порядку); null — не менять (у нового — нет). */
    keep: z.array(z.string()).nullable().optional(),
    /** Новые фото — токены crmCatalogUpload. */
    uploads: z.array(z.string()).max(10).default([]),
  })
  .strict()
  .register(schemas, { id: "CatalogProductBody" });

export const CatalogCollectionBody = z
  .object({ id: z.string().regex(/^\d{1,40}$/).nullable().optional(), name: z.string().trim().min(1).max(60), productIds: z.array(z.string()).max(100) })
  .strict()
  .register(schemas, { id: "CatalogCollectionBody" });

export const HiddenBody = z.object({ hidden: z.boolean() }).strict().register(schemas, { id: "HiddenBody" });

export const crmCatalogRoutes = {
  crmCatalog: route({ method: "GET", path: "/api/v1/crm/catalog", auth: "staff", tag: "crm", summary: "Каталог WhatsApp: товары и коллекции (копия старше 5 минут обновляется из WhatsApp)", response: Catalog }),
  crmCatalogSync: route({ method: "POST", path: "/api/v1/crm/catalog/sync", auth: "staff", tag: "crm", summary: "Забрать каталог из WhatsApp сейчас", response: Done }),
  crmCatalogUpload: route({ method: "POST", path: "/api/v1/crm/catalog/uploads", auth: "staff", tag: "crm", summary: "Загрузить новые фото товара (JPEG, PNG, WebP до 8 МБ) — токены на 30 минут", files: { field: "image" }, response: CatalogUploads }),
  crmCatalogSave: route({ method: "POST", path: "/api/v1/crm/catalog/products", auth: "staff", tag: "crm", summary: "Новый товар или правка (WhatsApp заменяет товар целиком)", body: CatalogProductBody, response: Done }),
  crmCatalogHidden: route({ method: "POST", path: "/api/v1/crm/catalog/products/{id}/hidden", auth: "staff", tag: "crm", summary: "Скрыть товар или показать", params: ProductId, body: HiddenBody, response: Done }),
  crmCatalogDelete: route({ method: "DELETE", path: "/api/v1/crm/catalog/products/{id}", auth: "staff", tag: "crm", summary: "Удалить товар из каталога WhatsApp", params: ProductId, response: Done }),
  crmCatalogCollectionSave: route({ method: "POST", path: "/api/v1/crm/catalog/collections", auth: "staff", tag: "crm", summary: "Новая коллекция или правка: название и товары", body: CatalogCollectionBody, response: Done }),
  crmCatalogCollectionDelete: route({ method: "DELETE", path: "/api/v1/crm/catalog/collections/{id}", auth: "staff", tag: "crm", summary: "Удалить коллекцию", params: ProductId, response: Done }),
} satisfies Record<string, RouteDef>;
