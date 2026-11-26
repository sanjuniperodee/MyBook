import { Controller, Get, Header } from "@nestjs/common";
import { Public } from "../http/endpoint";

@Controller()
export class HealthController {
  @Public()
  @Get("/api/v1/health")
  @Header("cache-control", "no-store")
  health() {
    return { ok: true };
  }
}
