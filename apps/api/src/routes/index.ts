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
import { bookModelHandlers } from "./book-model";
import { photoHandlers } from "./photos";

/** Все обработчики v1: тип Handlers требует обработчик на каждый маршрут контракта — забытый маршрут не соберётся. */
export const handlers: Handlers = { ...authHandlers, ...bookHandlers, ...photoHandlers, ...dictationHandlers, ...letterHandlers, ...previewHandlers, ...reviewHandlers, ...coverHandlers, ...bookModelHandlers, ...crmListHandlers, ...cabinetHandlers, ...cabinetOrderHandlers, ...crmHandlers, ...boardHandlers };
