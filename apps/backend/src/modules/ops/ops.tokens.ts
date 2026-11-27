import type { Output } from "@mybook/contracts";

/** Порт сводки «Фон и очереди» (модуль monitoring через переходный слой). */
export interface OpsPorts {
  health(): Promise<Output<"crmOpsHealth">>;
}

export const OPS_PORTS = Symbol("OpsPorts");
