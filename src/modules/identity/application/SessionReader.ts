import type { Clock } from "@/shared/application";
import type { TokenService } from "./ports";

/** Отметка активности для CRM («был в сети») — не чаще раза в 10 минут, чтобы не писать в БД на каждый запрос. */
export const ACTIVITY_TOUCH_MS = 10 * 60_000;

export interface SessionUserQueries<U> {
  userBySession(tokenHash: string, now: Date): Promise<U | null>;
  touch(userId: string, at: Date): Promise<void>;
}

/**
 * Кто вошёл по токену сессии (cookie mb_session или Bearer приложения): в БД хранится только хэш токена. Один сценарий
 * для обоих HTTP-процессов — mybook-api и бэкенда на Nest (ADR 0014).
 */
export class SessionReader<U extends { id: string; lastSeenAt: Date | null }> {
  constructor(
    private readonly queries: SessionUserQueries<U>,
    private readonly tokens: Pick<TokenService, "hash">,
    private readonly clock: Clock,
  ) {}

  async user(token: string): Promise<U | null> {
    const now = this.clock.now();
    const user = await this.queries.userBySession(this.tokens.hash(token), now);
    if (user && (!user.lastSeenAt || now.getTime() - user.lastSeenAt.getTime() > ACTIVITY_TOUCH_MS)) {
      void this.queries.touch(user.id, now).catch(() => {});
    }
    return user;
  }
}
