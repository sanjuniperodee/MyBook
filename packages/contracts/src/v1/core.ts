/**
 * Общее для контракта API v1 (ADR 0012): описание маршрута, реестр схем, общие типы. Домены — в своих файлах
 * (auth.ts, books.ts, …): каждый экспортирует схемы и объект маршрутов <домен>Routes; routes.ts их собирает.
 *
 * Правила: имя маршрута — имя метода клиентов (camelCase, уникально на весь v1); даты — строки ISO 8601; тело запроса и
 * ответа — схема с именем (.register(schemas, { id })), у Dart-клиента это класс. Поменять существующий ответ
 * несовместимо нельзя — только новый маршрут или необязательное поле.
 */
import { z } from "zod";

export type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
/** Кто может звать: none — без входа (вход, вебхуки), user — любой вошедший (права на ресурс проверяет сервер), staff — сотрудник CRM. */
export type Auth = "none" | "user" | "staff";

export interface RouteDef {
  method: Method;
  /** Путь с параметрами в фигурных скобках: /api/v1/books/{bookId}. */
  path: string;
  auth: Auth;
  tag: string;
  summary: string;
  params?: z.ZodObject;
  query?: z.ZodObject;
  body?: z.ZodType;
  response: z.ZodType;
}

/** Описание маршрута с сохранением точного типа (для Input/Output). */
export const route = <R extends RouteDef>(r: R) => r;
/** Схемы с именем — компоненты OpenAPI и классы Dart-клиента. Свой реестр: чужие схемы zod в него не попадут. */
export const schemas = z.registry<{ id: string }>();
export const iso = z.iso.datetime({ offset: true });
export const uuid = z.uuid();

/** Ошибка: текст для экрана на языке пользователя и код (стабильный, по нему ветвится клиент). */
export const ApiError = z.object({ error: z.string(), code: z.string().optional() }).register(schemas, { id: "ApiError" });
export const Ok = z.object({ ok: z.literal(true) }).register(schemas, { id: "Ok" });
