"use server";

/**
 * Server actions: код — в src/server/crm-actions/catalog.ts; на сайте с БД выполняется здесь же, на сайте без БД —
 * в mybook-api через API v1 (ADR 0012, A5 — Раздел 5, crmAction). Права, zod и лимиты проверяет само действие.
 */
import { crmAction } from "@/server/v1-local-bridge-crm";
import type * as impl from "@/server/crm-actions/catalog";

export const createProductAction = crmAction<typeof impl.createProductAction>("catalog", "createProductAction");
export const updateProductAction = crmAction<typeof impl.updateProductAction>("catalog", "updateProductAction");
export const setProductHiddenAction = crmAction<typeof impl.setProductHiddenAction>("catalog", "setProductHiddenAction");
export const deleteProductAction = crmAction<typeof impl.deleteProductAction>("catalog", "deleteProductAction");
export const syncCatalogAction = crmAction<typeof impl.syncCatalogAction>("catalog", "syncCatalogAction");
export const saveCollectionAction = crmAction<typeof impl.saveCollectionAction>("catalog", "saveCollectionAction");
export const deleteCollectionAction = crmAction<typeof impl.deleteCollectionAction>("catalog", "deleteCollectionAction");
export const chatProductsAction = crmAction<typeof impl.chatProductsAction>("catalog", "chatProductsAction");
export const sendProductAction = crmAction<typeof impl.sendProductAction>("catalog", "sendProductAction");
export const sendCatalogLinkAction = crmAction<typeof impl.sendCatalogLinkAction>("catalog", "sendCatalogLinkAction");
export const orderItemsAction = crmAction<typeof impl.orderItemsAction>("catalog", "orderItemsAction");
export const saveCatalogSettingsAction = crmAction<typeof impl.saveCatalogSettingsAction>("catalog", "saveCatalogSettingsAction");
export const saveCatalogDocsAction = crmAction<typeof impl.saveCatalogDocsAction>("catalog", "saveCatalogDocsAction");
export const checkCatalogAccessAction = crmAction<typeof impl.checkCatalogAccessAction>("catalog", "checkCatalogAccessAction");
