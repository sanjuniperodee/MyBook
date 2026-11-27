import { Controller, Inject } from "@nestjs/common";
import type { Output } from "@mybook/contracts";
import { Permissions } from "../../core/auth/staff.decorators";
import { Endpoint } from "../../core/http/endpoint";
import { OPS_PORTS, type OpsPorts } from "./ops.tokens";

/**
 * «Фон и очереди» в API v1 CRM: жив ли планировщик и не застряли ли очереди (outbox, Kaspi, WhatsApp, ИИ, видео, письма,
 * файлы для печати). Только руководителям и тем, кто ведёт настройки (settings.manage). Запрос лёгкий: пульсы — десятки
 * строк, агрегаты — по частичным индексам; сводка кэшируется на 5 секунд (страницу держат открытой с автообновлением).
 */
@Controller()
export class OpsController {
  constructor(@Inject(OPS_PORTS) private readonly ports: OpsPorts) {}

  @Endpoint("crmOpsHealth")
  @Permissions("settings.manage")
  health(): Promise<Output<"crmOpsHealth">> {
    return this.ports.health();
  }
}
