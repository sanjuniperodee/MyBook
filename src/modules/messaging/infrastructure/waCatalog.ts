import "server-only";
import { graphData, graphError, parseGraphProduct, productInfo, type CatalogProduct, type ProductDraft } from "../domain/catalog";
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
  },
  imageSize: 400,
} as const;

type Fetch = typeof fetch;

/** Каталог номера магазина: чтение без сессии, правки — через шлюз. */
export function waCatalogGateway(gowa: GowaClient, shopPhone: () => Promise<string>, fetchImpl: Fetch = (...a) => fetch(...a)): CatalogGateway {
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

  async function mutate(doc: string, field: string, input: Record<string, unknown>) {
    const body = await gowa.catalogGraphql(doc, { input: { ...input, actor_id: (await who()).personId } });
    const problem = graphError(body);
    if (problem) throw new GowaError(`WhatsApp: ${problem}`);
    return graphData(body, field);
  }

  async function ownerCatalog(): Promise<CatalogProduct[]> {
    const { lid } = await who();
    const out: CatalogProduct[] = [];
    let after: string | null = null;
    for (let page = 0; page < 40; page++) {
      const body = await gowa.catalogGraphql(WA_CATALOG.docs.owner, { request: { product_catalog: { jid: lid, width: size, height: size, limit: "50", ...(after ? { after } : {}) } } });
      const problem = graphError(body);
      if (problem) throw new GowaError(`WhatsApp: ${problem}`);
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
          doc_id: WA_CATALOG.docs.read,
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
      const data = await mutate(WA_CATALOG.docs.add, "xfb_whatsapp_catalog_add_product", { product: { biz_jid: (await who()).lid, width: WA_CATALOG.imageSize, height: WA_CATALOG.imageSize, product_info: productInfo(draft, urls) } });
      return product(data, "созданный");
    },

    async editProduct(id, draft, images, keep, videos) {
      if (!/^\d{1,40}$/.test(id)) throw new GowaError("Неверный id товара");
      const uploaded = await gowa.uploadProductImages(images);
      const urls = [...keep, ...uploaded];
      const data = await mutate(WA_CATALOG.docs.edit, "xfb_whatsapp_catalog_edit_product", { product: { biz_jid: (await who()).lid, product_id: id, width: WA_CATALOG.imageSize, height: WA_CATALOG.imageSize, product_info: productInfo(draft, urls, videos) } });
      return product(data, "изменённый");
    },

    async deleteProduct(id) {
      if (!/^\d{1,40}$/.test(id)) throw new GowaError("Неверный id товара");
      await mutate(WA_CATALOG.docs.remove, "xfb_whatsapp_catalog_delete_product", { biz_jid: (await who()).lid, product_ids: [id] });
    },

    catalogImage: (url) => gowa.catalogImage(url),
    orderDetails: (orderId, token) => gowa.orderDetails(orderId, token),
  };
}
