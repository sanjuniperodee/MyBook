import { Controller, Inject, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { SiteRoute } from "../../core/http/site-route";
import { SiteOpsBridge } from "./site-ops.bridge";

/** Звонки WhatsApp, записи звонков и веб-телефон CRM (7 маршрутов). Обработчик — сайта, через мост (site-ops.bridge.ts). */
@Controller()
export class SiteCallsController {
  constructor(@Inject(SiteOpsBridge) private readonly bridge: SiteOpsBridge) {}

  /** Звонок WhatsApp: доступ к звуку. */
  @SiteRoute("GET", "/api/admin/calls/whatsapp/audio-auth", { auth: "none" })
  getAdminCallsWhatsappAudioAuth(@Req() req: FastifyRequest): Promise<Response> {
    return this.bridge.run(req, "GET /api/admin/calls/whatsapp/audio-auth");
  }

  /** Прослушка звонка: доступ. */
  @SiteRoute("GET", "/api/admin/calls/whatsapp/listen-auth", { auth: "none" })
  getAdminCallsWhatsappListenAuth(@Req() req: FastifyRequest): Promise<Response> {
    return this.bridge.run(req, "GET /api/admin/calls/whatsapp/listen-auth");
  }

  /** Идущие звонки WhatsApp. */
  @SiteRoute("GET", "/api/admin/calls/whatsapp/live", { auth: "none" })
  getAdminCallsWhatsappLive(@Req() req: FastifyRequest): Promise<Response> {
    return this.bridge.run(req, "GET /api/admin/calls/whatsapp/live");
  }

  /** Действие со звонком WhatsApp. */
  @SiteRoute("POST", "/api/admin/calls/whatsapp/{id}", { auth: "none" })
  postAdminCallsWhatsappById(@Req() req: FastifyRequest): Promise<Response> {
    return this.bridge.run(req, "POST /api/admin/calls/whatsapp/{id}");
  }

  /** Запись звонка WhatsApp — загрузить. */
  @SiteRoute("POST", "/api/admin/calls/whatsapp/{id}/recording", { auth: "none" })
  postAdminCallsWhatsappByIdRecording(@Req() req: FastifyRequest): Promise<Response> {
    return this.bridge.run(req, "POST /api/admin/calls/whatsapp/{id}/recording");
  }

  /** Запись звонка — прослушать (Range). */
  @SiteRoute("GET", "/api/admin/calls/{id}/recording", { auth: "none" })
  getAdminCallsByIdRecording(@Req() req: FastifyRequest): Promise<Response> {
    return this.bridge.run(req, "GET /api/admin/calls/{id}/recording");
  }

  /** Веб-телефон: настройки. */
  @SiteRoute("GET", "/api/admin/webphone", { auth: "none" })
  getAdminWebphone(@Req() req: FastifyRequest): Promise<Response> {
    return this.bridge.run(req, "GET /api/admin/webphone");
  }
}
