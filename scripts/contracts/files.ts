import { openapi } from "../../packages/contracts/src/v1/openapi";
import { renderDart } from "../../packages/contracts/src/gen/dart";

/** Сгенерированные файлы контракта: путь от корня репозитория → содержимое. */
export function generated(): Record<string, string> {
  const spec = openapi() as Parameters<typeof renderDart>[0];
  return {
    "packages/contracts/openapi.json": `${JSON.stringify(spec, null, 2)}\n`,
    "mobile/lib/api/mybook_api.g.dart": renderDart(spec),
  };
}
