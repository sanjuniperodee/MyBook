import { Module } from "@nestjs/common";
import { OpsController } from "./ops.controller";

/** Наблюдаемость фона: сводка «Фон и очереди» (1 маршрут API v1). Оповещение о сбое — main.ts → legacy/ops-alerts.ts. */
@Module({ controllers: [OpsController] })
export class OpsApiModule {}
