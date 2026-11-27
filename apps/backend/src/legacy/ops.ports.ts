import type { Provider } from "@nestjs/common";
import type { Container } from "@/server/container";
import { OPS_PORTS, type OpsPorts } from "../modules/ops/ops.tokens";
import { LEGACY_CONTAINER } from "./legacy.tokens";

/** Сводка «Фон и очереди» — модуль monitoring старого корня композиции. */
export const legacyOpsPorts: Provider<OpsPorts> = {
  provide: OPS_PORTS,
  useFactory: (c: Container): OpsPorts => ({ health: () => c.monitoring.health.snapshot() }),
  inject: [LEGACY_CONTAINER],
};
