/**
 * Каталог WhatsApp в приложении CRM — те же действия, что у страницы CRM (admin/catalog). Новые фото товара сначала
 * загружаются (токены в памяти процесса на 30 минут, только тому сотруднику, кто загрузил), потом товар сохраняется с ними
 * одной формой — как у сайта.
 */
import { randomUUID } from "node:crypto";
import { apiStaff } from "@/server/api";
import { container } from "@/server/container";
import { catalogLink } from "@/modules/messaging";
import { createProductAction, deleteCollectionAction, deleteProductAction, saveCollectionAction, setProductHiddenAction, syncCatalogAction, updateProductAction } from "@/server/crm-actions/catalog";
import type { Handlers } from "../../app";
import { refused } from "./common";

const TTL = 30 * 60_000;
const MAX_BYTES = 8 * 1024 * 1024;
const uploads = new Map<string, { staffId: string; file: File; at: number }>();

function sweep(now = Date.now()) {
  for (const [k, v] of uploads) if (now - v.at > TTL) uploads.delete(k);
}

const photoSrc = (u: string) => `/api/admin/catalog/photo?u=${encodeURIComponent(u)}`;
const done = (message: string | null) => ({ ok: true as const, message });

type CatalogHandlers = "crmCatalog" | "crmCatalogSync" | "crmCatalogUpload" | "crmCatalogSave" | "crmCatalogHidden" | "crmCatalogDelete" | "crmCatalogCollectionSave" | "crmCatalogCollectionDelete";

export const crmCatalogHandlers: Pick<Handlers, CatalogHandlers> = {
  async crmCatalog({ req }) {
    await apiStaff(req, "catalog.manage");
    const catalog = container().messaging.catalog;
    const problem = await catalog.syncIfStale(5 * 60_000);
    const [products, synced, status] = await Promise.all([catalog.list(), catalog.lastSyncedAt(), container().messaging.gowa.cachedStatus()]);
    const collections = await catalog.collections().then(
      (list) => ({ list, error: null as string | null }),
      (err: unknown) => ({ list: [], error: err instanceof Error ? err.message : String(err) }),
    );
    return {
      products: products.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        price: p.price,
        currency: p.currency,
        retailerId: p.retailerId,
        url: p.url,
        hidden: p.hidden,
        review: p.review,
        photos: p.imageUrls.map((u) => ({ url: u, src: photoSrc(u) })),
        coverSrc: `/api/admin/catalog/${p.id}/image`,
        videos: p.videoUrls.length,
      })),
      collections: collections.list.map((c) => ({ id: c.id, name: c.name, productIds: c.productIds })),
      collectionsError: collections.error,
      link: status.phone ? catalogLink(status.phone) : null,
      problem: problem ?? null,
      syncedLabel: synced ? synced.toLocaleString("ru-RU", { timeZone: "Asia/Almaty" }) : null,
    };
  },

  async crmCatalogSync({ req }) {
    await apiStaff(req, "catalog.manage");
    const r = await syncCatalogAction();
    if (!r.ok) return refused(r.error);
    return done(`Обновлено из WhatsApp: ${r.total} товаров${r.removed ? `, убрано ${r.removed}` : ""}`);
  },

  async crmCatalogUpload({ req, input }) {
    const staff = await apiStaff(req, "catalog.manage");
    sweep();
    const tokens: string[] = [];
    for (const file of input.files) {
      const f = file as File;
      if (!/^image\/(jpeg|png|webp)$/.test(f.type)) return refused("Фото товара — JPEG, PNG или WebP");
      if (f.size > MAX_BYTES) return refused("Фото больше 8 МБ — уменьшите");
      const token = randomUUID();
      uploads.set(token, { staffId: staff.user.id, file: f, at: Date.now() });
      tokens.push(token);
    }
    return { tokens };
  },

  async crmCatalogSave({ req, input }) {
    const staff = await apiStaff(req, "catalog.manage");
    sweep();
    const b = input.body;
    const form = new FormData();
    form.set("name", b.name);
    form.set("description", b.description);
    form.set("price", b.price);
    form.set("currency", b.currency);
    form.set("retailerId", b.retailerId);
    form.set("url", b.url);
    form.set("hidden", b.hidden ? "true" : "false");
    if (b.keep) {
      form.set("keepSet", "1");
      for (const u of b.keep) form.append("keep", u);
    }
    for (const t of b.uploads) {
      const up = uploads.get(t);
      if (!up || up.staffId !== staff.user.id) return refused("Фото не дождалось сохранения — добавьте его ещё раз");
      form.append("image", up.file, up.file.name || "photo.jpg");
    }
    const r = b.id ? await updateProductAction(b.id, form) : await createProductAction(form);
    if (!r.ok) return refused(r.error);
    for (const t of b.uploads) uploads.delete(t);
    return done(b.id ? "Товар сохранён — WhatsApp проверит изменения" : "Товар добавлен — после проверки WhatsApp его увидят клиенты");
  },

  async crmCatalogHidden({ req, input }) {
    await apiStaff(req, "catalog.manage");
    const r = await setProductHiddenAction(input.id, input.body.hidden);
    if (!r.ok) return refused(r.error);
    return done(input.body.hidden ? "Товар скрыт" : "Товар снова виден");
  },

  async crmCatalogDelete({ req, input }) {
    await apiStaff(req, "catalog.manage");
    const r = await deleteProductAction(input.id);
    if (!r.ok) return refused(r.error);
    return done("Товар удалён");
  },

  async crmCatalogCollectionSave({ req, input }) {
    await apiStaff(req, "catalog.manage");
    const r = await saveCollectionAction(input.body.id ?? null, { name: input.body.name, productIds: input.body.productIds });
    if (!r.ok) return refused(r.error);
    return done("Коллекция сохранена");
  },

  async crmCatalogCollectionDelete({ req, input }) {
    await apiStaff(req, "catalog.manage");
    const r = await deleteCollectionAction(input.id);
    if (!r.ok) return refused(r.error);
    return done("Коллекция удалена");
  },
};
