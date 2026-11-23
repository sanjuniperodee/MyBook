import "server-only";
import { randomUUID } from "node:crypto";
import { graphData, graphError, looksLikeStaleDoc, parseGraphCollection, parseGraphProduct, productInfo, type CatalogCollection, type CatalogDocKey, type CatalogProduct, type ProductDraft } from "../domain/catalog";
import type { CatalogGateway, UploadImage } from "../application/catalog";
import { GowaError, type GowaClient } from "./gowa";

/**
 * Протокол каталога WhatsApp Web (docs/whatsapp-catalog.md, с осени 2026 вместо IQ w:biz:catalog): чтение — публичный
 * GraphQL graph.whatsapp.com с токеном приложения из WhatsApp Web, правки — сохранённые GraphQL-мутации на
 * graph.facebook.com с токеном рекламного аккаунта номера (его шлюз получает по сокету). id документов — из сборки
 * WhatsApp Web (WAWebBizCatalogManagement*_facebookRelayOperation); WhatsApp их меняет редко, но меняет — тогда правим здесь.
 */
export const WA_CATALOG = {
  readUrl: "https://graph.whatsapp.com/graphql/catalog",
  /** Публичный токен каталога WhatsApp Web (WAWebGraphQLConstants.WHATSAPP_GRAPHQL_CATALOG_ACCESS_TOKEN). */
  readToken: "WA|787118555984857|7bb1544a3599aa180ac9a3f7688ba243",
  docs: {
    /** WAWebQueryCatalog — каталог номера, как его видит клиент (без скрытых и непроверенных). */
    read: "30445081048424116",
    /** WAWebBizCatalogManagementFetchCatalogQuery → xfb_whatsapp_catalog: каталог глазами владельца (со скрытыми). */
    owner: "9957894520961099",
    /** WAWebBizCatalogManagementAddProductMutation → xfb_whatsapp_catalog_add_product. */
    add: "24249359867999500",
    /** WAWebBizCatalogManagementEditProductMutation → xfb_whatsapp_catalog_edit_product. */
    edit: "9889773371084956",
    /** WAWebBizCatalogManagementDeleteProductMutation → xfb_whatsapp_catalog_delete_product. */
    remove: "9376108569185474",
    /** WAWebBizCatalogManagementFetchCollectionsQuery → xfb_whatsapp_catalog_collections (со всеми статусами). */
    collections: "9687699931342731",
    /** WAWebQueryProductCollections → xwa_product_catalog_get_collections (как видит клиент, публично). */
    collectionsPublic: "9430970660362540",
    /** WAWebBizCatalogManagementCreateCollectionMutation → xfb_whatsapp_catalog_create_collection. */
    createCollection: "29361942130088470",
    /** WAWebBizCatalogManagementUpdateCollectionMutation → xfb_whatsapp_catalog_update_collection (возвращает НОВЫЙ id). */
    updateCollection: "24486970300891371",
    /** WAWebBizCatalogManagementDeleteCollectionsMutation → xfb_whatsapp_catalog_delete_collections. */
    deleteCollections: "29970196299234260",
  } satisfies Record<CatalogDocKey, string>,
  imageSize: 400,
} as const;

type Fetch = typeof fetch;

/**
 * Каталог номера магазина: чтение без сессии, правки — через шлюз. overrides — замены doc_id из настроек («Каталог
 * WhatsApp» → «Документы WhatsApp»): WhatsApp сменил запрос — меняем номер без выкатки.
 */
export function waCatalogGateway(gowa: GowaClient, shopPhone: () => Promise<string>, overrides: () => Promise<Partial<Record<CatalogDocKey, string>>> = async () => ({}), fetchImpl: Fetch = (...a) => fetch(...a)): CatalogGateway {
  const doc = async (k: CatalogDocKey) => (await overrides().catch(() => ({}) as Partial<Record<CatalogDocKey, string>>))[k] ?? WA_CATALOG.docs[k];
  /** Ошибка WhatsApp текстом; похожая на сменённый doc_id — с подсказкой, где его поменять. */
  const fail = (problem: string, k: CatalogDocKey) =>
    new GowaError(looksLikeStaleDoc(problem) ? `WhatsApp: ${problem}. Возможно, WhatsApp сменил запрос «${k}» — обновите doc_id: «Интеграции» → «Мессенджеры» → «Каталог WhatsApp» → «Документы WhatsApp»` : `WhatsApp: ${problem}`);
  const bizJid = async () => {
    const phone = (await shopPhone()).replace(/\D/g, "");
    if (!phone) throw new GowaError("Номер магазина неизвестен — привяжите WhatsApp в «Интеграциях»");
    return `${phone}@s.whatsapp.net`;
  };
  const size = String(WA_CATALOG.imageSize);

  /**
   * Кто правит: мутации адресуют бизнес по LID номера (WAWebGetFormattedCatalogJid) и несут actor_id — id бизнес-персоны
   * из токена (с номером вида …@s.whatsapp.net WhatsApp отвечает «Bad Request Error while getting catalog»).
   */
  let actor: { lid: string; personId: string } | null = null;
  async function who() {
    if (actor) return actor;
    const t = await gowa.catalogToken();
    if (!/@lid$/.test(t.lid) || !t.businessPersonId) throw new GowaError("WhatsApp не выдал доступ к правке каталога — обновите шлюз");
    actor = { lid: t.lid, personId: t.businessPersonId };
    return actor;
  }

  async function mutate(key: CatalogDocKey, field: string, input: Record<string, unknown>) {
    const body = await gowa.catalogGraphql(await doc(key), { input: { ...input, actor_id: (await who()).personId } });
    const problem = graphError(body);
    if (problem) throw fail(problem, key);
    return graphData(body, field);
  }

  async function ownerCatalog(): Promise<CatalogProduct[]> {
    const { lid } = await who();
    const out: CatalogProduct[] = [];
    let after: string | null = null;
    for (let page = 0; page < 40; page++) {
      const body = await gowa.catalogGraphql(await doc("owner"), { request: { product_catalog: { jid: lid, width: size, height: size, limit: "50", ...(after ? { after } : {}) } } });
      const problem = graphError(body);
      if (problem) throw fail(problem, "owner");
      const catalog = (graphData(body, "xfb_whatsapp_catalog").product_catalog ?? {}) as { products?: unknown[]; paging?: { after?: string | null } };
      const products = catalog.products ?? [];
      for (const raw of products) {
        const p = parseGraphProduct(raw);
        if (p) out.push(p);
      }
      const next = catalog.paging?.after || null;
      if (!next || next === after || !products.length) break;
      after = next;
    }
    return out;
  }

  async function publicCatalog(): Promise<CatalogProduct[]> {
    const jid = await bizJid();
    const out: CatalogProduct[] = [];
    let after: string | null = null;
    for (let page = 0; page < 40; page++) {
      const res = await fetchImpl(WA_CATALOG.readUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          access_token: WA_CATALOG.readToken,
          doc_id: await doc("read"),
          lang: "ru_RU",
          variables: {
            request: {
              product_catalog: {
                jid,
                allow_shop_source: "ALLOWSHOPSOURCE_TRUE",
                width: size,
                height: size,
                limit: "50",
                after,
                catalog_session_id: null,
                direct_connection_encrypted_info: null,
                variant_info_fields: null,
                variant_thumbnail_height: null,
                variant_thumbnail_width: null,
              },
            },
          },
        }),
        signal: AbortSignal.timeout(30_000),
      }).catch(() => null);
      if (!res) throw new GowaError("Каталог WhatsApp недоступен — попробуйте позже", "UNREACHABLE");
      const body = (await res.json().catch(() => null)) as unknown;
      const problem = graphError(body);
      if (problem || !res.ok) throw new GowaError(`Каталог WhatsApp: ${problem ?? `HTTP ${res.status}`}`);
      const catalog = (graphData(body, "xwa_product_catalog_get_product_catalog").product_catalog ?? {}) as { products?: unknown[]; paging?: { after?: string | null } };
      const products = catalog.products ?? [];
      for (const raw of products) {
        const p = parseGraphProduct(raw);
        if (p) out.push(p);
      }
      const next = catalog.paging?.after || null;
      if (!next || next === after || !products.length) break;
      after = next;
    }
    return out;
  }

  function product(data: Record<string, unknown>, what: string): CatalogProduct {
    const p = parseGraphProduct(data.product);
    if (!p) throw new GowaError(`WhatsApp не вернул ${what} товар`);
    return p;
  }

  return {
    /**
     * Весь каталог глазами владельца (WAWebBizCatalogManagementFetchCatalogQuery через шлюз): со скрытыми и
     * непроверенными товарами. Публичное чтение (как видит клиент) — только если служебное недоступно.
     */
    async catalog() {
      try {
        return await ownerCatalog();
      } catch (err) {
        if (!GowaError.is(err) || err.status === 401) throw err;
        return publicCatalog();
      }
    },

    async createProduct(draft: ProductDraft, images: UploadImage[]) {
      const urls = await gowa.uploadProductImages(images);
      const data = await mutate("add", "xfb_whatsapp_catalog_add_product", { product: { biz_jid: (await who()).lid, width: WA_CATALOG.imageSize, height: WA_CATALOG.imageSize, product_info: productInfo(draft, urls) } });
      return product(data, "созданный");
    },

    async editProduct(id, draft, images, keep, videos) {
      if (!/^\d{1,40}$/.test(id)) throw new GowaError("Неверный id товара");
      const uploaded = await gowa.uploadProductImages(images);
      const urls = [...keep, ...uploaded];
      const data = await mutate("edit", "xfb_whatsapp_catalog_edit_product", { product: { biz_jid: (await who()).lid, product_id: id, width: WA_CATALOG.imageSize, height: WA_CATALOG.imageSize, product_info: productInfo(draft, urls, videos) } });
      return product(data, "изменённый");
    },

    async deleteProduct(id) {
      if (!/^\d{1,40}$/.test(id)) throw new GowaError("Неверный id товара");
      await mutate("remove", "xfb_whatsapp_catalog_delete_product", { biz_jid: (await who()).lid, product_ids: [id] });
    },

    async collections(): Promise<CatalogCollection[]> {
      try {
        const body = await gowa.catalogGraphql(await doc("collections"), { request: { collections: { biz_jid: (await who()).lid, collection_limit: "20", item_limit: "100", width: "100", height: "100" } } });
        const problem = graphError(body);
        if (problem) throw fail(problem, "collections");
        const list = (graphData(body, "xfb_whatsapp_catalog_collections").collections ?? []) as unknown[];
        return list.map(parseGraphCollection).filter((c): c is CatalogCollection => !!c);
      } catch (err) {
        if (!GowaError.is(err) || err.status === 401) throw err;
        // Служебное чтение недоступно — как видит клиент (без коллекций на проверке).
        const res = await fetchImpl(WA_CATALOG.readUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ access_token: WA_CATALOG.readToken, doc_id: await doc("collectionsPublic"), lang: "ru_RU", variables: { request: { collections: { biz_jid: await bizJid(), collection_limit: "20", item_limit: "100", width: "100", height: "100", after: null } } } }),
          signal: AbortSignal.timeout(30_000),
        }).catch(() => null);
        const body = res ? ((await res.json().catch(() => null)) as unknown) : null;
        if (!body || graphError(body)) throw err;
        const list = (graphData(body, "xwa_product_catalog_get_collections").collections ?? []) as unknown[];
        return list.map(parseGraphCollection).filter((c): c is CatalogCollection => !!c);
      }
    },

    async createCollection(name, productIds) {
      const data = await mutate("createCollection", "xfb_whatsapp_catalog_create_collection", { collection: { name: name.trim(), product_ids: productIds, biz_jid: (await who()).lid, catalog_session_id: randomUUID() } });
      const id = String((data.collection as { id?: unknown } | undefined)?.id ?? "");
      if (!/^\d{1,40}$/.test(id)) throw new GowaError("WhatsApp не вернул созданную коллекцию");
      return id;
    },

    /** Правка коллекции; WhatsApp выдаёт ей НОВЫЙ id — он и возвращается. */
    async updateCollection(id, change) {
      if (!/^\d{1,40}$/.test(id)) throw new GowaError("Неверный id коллекции");
      const collection: Record<string, unknown> = { id, biz_jid: (await who()).lid, catalog_session_id: randomUUID() };
      if (change.name !== undefined) collection.name = change.name.trim();
      if (change.add.length) collection.add = { ids: change.add };
      if (change.remove.length) collection.remove = { ids: change.remove };
      const data = await mutate("updateCollection", "xfb_whatsapp_catalog_update_collection", { collection });
      const next = String((data.collection as { id?: unknown } | undefined)?.id ?? "");
      return /^\d{1,40}$/.test(next) ? next : id;
    },

    async deleteCollection(id) {
      if (!/^\d{1,40}$/.test(id)) throw new GowaError("Неверный id коллекции");
      await mutate("deleteCollections", "xfb_whatsapp_catalog_delete_collections", { collections: { collection_ids: [id], biz_jid: (await who()).lid, catalog_session_id: randomUUID() } });
    },

    catalogImage: (url) => gowa.catalogImage(url),
    orderDetails: (orderId, token) => gowa.orderDetails(orderId, token),
  };
}
