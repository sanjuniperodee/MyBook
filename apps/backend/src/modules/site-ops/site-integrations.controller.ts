import { Controller, Inject, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { SiteRoute } from "../../core/http/site-route";
import { SiteOpsBridge } from "./site-ops.bridge";

/** Вебхуки интеграций: почта, Google Календарь, WhatsApp (GOWA), АТС, Wazzup, Zadarma (9 маршрутов). Обработчик — сайта, через мост (site-ops.bridge.ts). */
@Controller()
export class SiteIntegrationsController {
  constructor(@Inject(SiteOpsBridge) private readonly bridge: SiteOpsBridge) {}

  /** Входящая почта. */
  @SiteRoute("POST", "/api/integrations/email", { auth: "none" })
  postIntegrationsEmail(@Req() req: FastifyRequest): Promise<Response> {
    return this.bridge.run(req, "POST /api/integrations/email");
  }

  /** Google Календарь: возврат после входа. */
  @SiteRoute("GET", "/api/integrations/google/callback", { auth: "none" })
  getIntegrationsGoogleCallback(@Req() req: FastifyRequest): Promise<Response> {
    return this.bridge.run(req, "GET /api/integrations/google/callback");
  }

  /** Google Календарь: подключить. */
  @SiteRoute("GET", "/api/integrations/google/connect", { auth: "none" })
  getIntegrationsGoogleConnect(@Req() req: FastifyRequest): Promise<Response> {
    return this.bridge.run(req, "GET /api/integrations/google/connect");
  }

  /** Google Календарь: изменения. */
  @SiteRoute("POST", "/api/integrations/google/webhook", { auth: "none" })
  postIntegrationsGoogleWebhook(@Req() req: FastifyRequest): Promise<Response> {
    return this.bridge.run(req, "POST /api/integrations/google/webhook");
  }

  /** WhatsApp (GOWA): входящие и статусы (подпись HMAC). */
  @SiteRoute("POST", "/api/integrations/gowa", { auth: "none" })
  postIntegrationsGowa(@Req() req: FastifyRequest): Promise<Response> {
    return this.bridge.run(req, "POST /api/integrations/gowa");
  }

  /** АТС: события звонков. */
  @SiteRoute("POST", "/api/integrations/pbx", { auth: "none" })
  postIntegrationsPbx(@Req() req: FastifyRequest): Promise<Response> {
    return this.bridge.run(req, "POST /api/integrations/pbx");
  }

  /** Wazzup: входящие. */
  @SiteRoute("POST", "/api/integrations/wazzup", { auth: "none" })
  postIntegrationsWazzup(@Req() req: FastifyRequest): Promise<Response> {
    return this.bridge.run(req, "POST /api/integrations/wazzup");
  }

  /** Zadarma: проверка адреса. */
  @SiteRoute("GET", "/api/integrations/zadarma", { auth: "none" })
  getIntegrationsZadarma(@Req() req: FastifyRequest): Promise<Response> {
    return this.bridge.run(req, "GET /api/integrations/zadarma");
  }

  /** Zadarma: события звонков (подпись). */
  @SiteRoute("POST", "/api/integrations/zadarma", { auth: "none" })
  postIntegrationsZadarma(@Req() req: FastifyRequest): Promise<Response> {
    return this.bridge.run(req, "POST /api/integrations/zadarma");
  }
}
