import type { Handlers } from "../app";
import { authHandlers } from "./auth";
import { boardHandlers } from "./boards";
import { bookHandlers } from "./books";
import { cabinetHandlers } from "./cabinet";
import { cabinetOrderHandlers } from "./cabinet-orders";
import { crmHandlers } from "./crm";
import { dictationHandlers } from "./dictation";
import { letterHandlers } from "./letters";
import { previewHandlers } from "./preview";
import { reviewHandlers } from "./reviews";
import { coverHandlers } from "./cover";
import { crmListHandlers } from "./crm-lists";
import { meHandlers } from "./me";
import { crmInvoiceHandlers } from "./crm-invoices";
import { bookModelHandlers } from "./book-model";
import { wizardHandlers } from "./wizard";
import { photoHandlers } from "./photos";
import { photoEditorHandlers } from "./photo-editor";

/** Все обработчики v1: тип Handlers требует обработчик на каждый маршрут контракта — забытый маршрут не соберётся. */
export const handlers: Handlers = { ...authHandlers, ...bookHandlers, ...photoHandlers, ...photoEditorHandlers, ...dictationHandlers, ...letterHandlers, ...previewHandlers, ...reviewHandlers, ...coverHandlers, ...bookModelHandlers, ...wizardHandlers, ...crmListHandlers, ...crmInvoiceHandlers, ...meHandlers, ...cabinetHandlers, ...cabinetOrderHandlers, ...crmHandlers, ...boardHandlers };
