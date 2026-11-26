import { Controller, Get } from "@nestjs/common";
import { Public } from "../http/endpoint";

@Controller()
export class HealthController {
  @Public()
  @Get("/api/v1/health")
  health() {
    return { ok: true };
  }
}
