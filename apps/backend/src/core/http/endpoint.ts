import { applyDecorators, Delete, Get, HttpCode, Patch, Post, Put, SetMetadata } from "@nestjs/common";
import type { Reflector } from "@nestjs/core";
import { v1, type RouteDef, type RouteName } from "@mybook/contracts";

export interface ContractRoute {
  name: RouteName;
  def: RouteDef;
}

export const CONTRACT_ROUTE = Symbol("contractRoute");
/** Маршрут вне контракта, открытый без входа (health). Остальные маршруты без контракта закрыты (SessionGuard). */
export const PUBLIC_ROUTE = Symbol("publicRoute");

const METHOD = { GET: Get, POST: Post, PUT: Put, PATCH: Patch, DELETE: Delete } as const;

/** Путь контракта → путь Nest: /api/v1/orders/{orderId}/review → /api/v1/orders/:orderId/review. */
export const nestPath = (path: string) => path.replace(/\{(\w+)\}/g, ":$1");

/**
 * Маршрут из контракта API v1 (ADR 0014, правило 2): метод, путь и вход берутся из @mybook/contracts, поэтому OpenAPI,
 * Dart-клиент и сервер не расходятся. Ответ — всегда 200, как у mybook-api (у POST в Nest по умолчанию 201).
 */
export function Endpoint(name: RouteName): MethodDecorator {
  const def: RouteDef = v1[name];
  // Вход сотрудника (роль, отключение, 2FA, список IP, права) переедет с первым контекстом CRM — до тех пор маршрут
  // сотрудника здесь не регистрируется вовсе, чтобы проверку прав нельзя было пропустить (ADR 0014, правило 8).
  if (def.auth === "staff") throw new Error(`${name}: маршруты сотрудника в бэкенде на Nest ещё не поддерживаются`);
  return applyDecorators(METHOD[def.method](nestPath(def.path)), HttpCode(200), SetMetadata(CONTRACT_ROUTE, { name, def } satisfies ContractRoute));
}

export const Public = () => SetMetadata(PUBLIC_ROUTE, true);

// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type -- обработчик маршрута Nest
export const contractRouteOf = (reflector: Reflector, handler: Function) => reflector.get<ContractRoute | undefined>(CONTRACT_ROUTE, handler);
