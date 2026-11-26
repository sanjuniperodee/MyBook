import { applyDecorators, Inject, Injectable, SetMetadata, UseGuards, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { FastifyRequest } from "fastify";
import type { ErrorKey } from "@/i18n/api-errors";
import type { RateLimiter } from "@/shared/application/RateLimiter";
import { APP_CONFIG, type AppConfig } from "../config/app-config";
import { ApiError } from "../errors/api-error";
import { clientIp } from "../http/client-ip";
import { RATE_LIMITER } from "../kernel/tokens";

export interface RateLimitPolicy {
  /** Ключ счётчика (к нему добавляется адрес клиента); общий с mybook-api — лимит один на оба процесса. */
  key: string;
  limit: number;
  windowMs: number;
  /** Текст ответа 429. */
  error: ErrorKey;
}

const RATE_LIMIT = Symbol("rateLimit");

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(RATE_LIMITER) private readonly limiter: RateLimiter,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const policy = this.reflector.get<RateLimitPolicy>(RATE_LIMIT, ctx.getHandler());
    const ip = clientIp(ctx.switchToHttp().getRequest<FastifyRequest>(), this.config.edgeIpSecret);
    if (!(await this.limiter.hit(`${policy.key}:${ip}`, policy.limit, policy.windowMs))) throw new ApiError(429, policy.error);
    return true;
  }
}

/** Лимит частоты по адресу клиента; проверяется после входа и guard-ов доступа контроллера. */
export const RateLimit = (policy: RateLimitPolicy) => applyDecorators(SetMetadata(RATE_LIMIT, policy), UseGuards(RateLimitGuard));
