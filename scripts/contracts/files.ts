import { openapi } from "../../packages/contracts/src/v1/openapi";
import { renderDart } from "../../packages/contracts/src/gen/dart";

/** Путь Dart-клиента внутри репозитория приложения mybook-mobile (ADR 0013). */
export const DART_CLIENT_IN_APP = "lib/api/mybook_api.g.dart";

/** Сгенерированный Dart-клиент API v1. */
export function dartClient(): string {
  return renderDart(openapi() as Parameters<typeof renderDart>[0]);
}

/**
 * Сгенерированные файлы контракта: путь → содержимое. OpenAPI лежит в этом репозитории; Dart-клиент — в checkout
 * приложения (mybook-mobile), его путь передают явно.
 */
export function generated(dartPath?: string): Record<string, string> {
  const spec = openapi() as Parameters<typeof renderDart>[0];
  return {
    "packages/contracts/openapi.json": `${JSON.stringify(spec, null, 2)}\n`,
    ...(dartPath ? { [dartPath]: renderDart(spec) } : {}),
  };
}
