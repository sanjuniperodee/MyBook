import type { Handlers } from "../app";
import { authHandlers } from "./auth";
import { boardHandlers } from "./boards";
import { bookHandlers } from "./books";
import { cabinetHandlers } from "./cabinet";
import { crmHandlers } from "./crm";
import { dictationHandlers } from "./dictation";
import { letterHandlers } from "./letters";
import { photoHandlers } from "./photos";

/** Все обработчики v1: тип Handlers требует обработчик на каждый маршрут контракта — забытый маршрут не соберётся. */
export const handlers: Handlers = { ...authHandlers, ...bookHandlers, ...photoHandlers, ...dictationHandlers, ...letterHandlers, ...cabinetHandlers, ...crmHandlers, ...boardHandlers };
