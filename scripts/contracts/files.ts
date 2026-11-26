import { openapi } from "../../packages/contracts/src/v1/openapi";
import { renderDart } from "../../packages/contracts/src/gen/dart";

/**
 * Куда писать Dart-клиент по умолчанию. Приложение переехало в репозиторий mybook-mobile (ADR 0013); пока папка mobile/
 * в бэкенде не удалена, клиент пишется и туда. Путь в checkout приложения — `--dart <путь>` у generate.ts.
 */
export const DART_CLIENT_DEFAULT = "mobile/lib/api/mybook_api.g.dart";

/** Путь Dart-клиента внутри репозитория приложения (mybook-mobile). */
export const DART_CLIENT_IN_APP = "lib/api/mybook_api.g.dart";

/** Сгенерированный Dart-клиент API v1. */
export function dartClient(): string {
  return renderDart(openapi() as Parameters<typeof renderDart>[0]);
}

/** Сгенерированные файлы контракта: путь (от корня репозитория или указанный) → содержимое. */
export function generated(dartPath: string = DART_CLIENT_DEFAULT): Record<string, string> {
  const spec = openapi() as Parameters<typeof renderDart>[0];
  return {
    "packages/contracts/openapi.json": `${JSON.stringify(spec, null, 2)}\n`,
    [dartPath]: renderDart(spec),
  };
}
