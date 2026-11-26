import { Controller, Get, Header, Inject, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { ApiError } from "../errors/api-error";
import { Public } from "../http/endpoint";
import { header } from "../http/request";
import { ROUTE_REGISTRY, type RouteRegistry } from "./route-registry";

/**
 * Какие адреса уже на Nest — для теневой сверки mybook-api (снаружи сюда nginx не ведёт и проксированные
 * запросы с X-Real-IP / X-Forwarded-For получают 404).
 */
@Controller()
export class RoutesController {
  constructor(@Inject(ROUTE_REGISTRY) private readonly registry: RouteRegistry) {}

  @Public()
  @Get("/api/v1/__nest/routes")
  @Header("cache-control", "no-store")
  routes(@Req() req: FastifyRequest) {
    if (header(req, "x-real-ip") || header(req, "x-forwarded-for")) throw new ApiError(404, "notFound");
    return { routes: this.registry.list() };
  }
}
