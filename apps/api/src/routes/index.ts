import type { Handlers } from "../app";
import { authHandlers } from "./auth";
import { bookHandlers } from "./books";
import { cabinetHandlers } from "./cabinet";

/** Все обработчики v1: тип Handlers требует обработчик на каждый маршрут контракта — забытый маршрут не соберётся. */
export const handlers: Handlers = { ...authHandlers, ...bookHandlers, ...cabinetHandlers };
