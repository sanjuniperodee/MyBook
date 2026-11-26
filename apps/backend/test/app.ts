import "reflect-metadata";
import { Test } from "@nestjs/testing";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { StaffContext } from "@/modules/access/domain/StaffContext";
import { isPhoneEmail, type CurrentUser } from "@/modules/identity";
import type { RateLimiter } from "@/shared/application/RateLimiter";
import { allPermissions } from "@/shared/domain/permissions";
import { AppModule } from "../src/app.module";
import { configureApp, createAdapter } from "../src/bootstrap";
import { APP_CONFIG, loadConfig } from "../src/core/config/app-config";
import { SESSION_USERS, type SessionUsers } from "../src/core/auth/session";
import { STAFF_ACCESS, type StaffAccessPort } from "../src/core/auth/staff";
import { CLOCK, RATE_LIMITER, UNIT_OF_WORK } from "../src/core/kernel/tokens";
import { LEGACY_CONTAINER } from "../src/legacy/legacy.tokens";
import { FEEDBACK_PORTS } from "../src/modules/feedback/feedback.tokens";

/** Токен сессии в тестах (формат как у настоящего: base64url, 20+ символов). */
export const sessionOf = (user: Pick<CurrentUser, "id">) => `test-session-${user.id}`.padEnd(24, "x");

export const testUser = (id: string, extra: Partial<CurrentUser> = {}) => ({ id, name: "Айгерим", email: `${id}@example.kz`, role: "user", staffDisabled: false, crmRoleId: null, totpEnabledAt: null, totpSecret: null, lastSeenAt: null, ...extra }) as unknown as CurrentUser;

const defaultStaffAccess: StaffAccessPort = {
  async resolve(user) {
    if (user.role !== "admin" || user.staffDisabled) return null;
    return { context: new StaffContext(user.id, "Руководитель", "owner", "all", new Set(allPermissions), true, { isPhoneEmail }), gate: null };
  },
};

/** Лимитер в памяти: сколько раз звали с каким ключом; `deny` — следующий вызов вернёт «лимит исчерпан». */
export class FakeLimiter implements RateLimiter {
  readonly hits: string[] = [];
  deny = false;
  async hit(key: string) {
    this.hits.push(key);
    return !this.deny;
  }
  async peek() {
    return null;
  }
  async reset() {}
}

/**
 * Приложение целиком (ядро, guard-ы, фильтр, контроллеры), а инфраструктура — подменена: БД, старый контейнер, сессии и
 * лимиты. Запросы — через Fastify inject, без порта.
 */
export async function bootTestApp(opts: { users: CurrentUser[]; overrides?: [token: unknown, value: unknown][]; env?: NodeJS.ProcessEnv; extraModules?: Parameters<typeof Test.createTestingModule>[0]["imports"] }) {
  const limiter = new FakeLimiter();
  const sessions: SessionUsers = { user: async (token) => opts.users.find((u) => sessionOf(u) === token) ?? null };
  let builder = Test.createTestingModule({ imports: [AppModule, ...(opts.extraModules ?? [])] })
    .overrideProvider(LEGACY_CONTAINER).useValue({})
    .overrideProvider(UNIT_OF_WORK).useValue({ run: (fn: () => unknown) => fn() })
    .overrideProvider(CLOCK).useValue({ now: () => new Date("2026-11-26T10:00:00Z") })
    .overrideProvider(RATE_LIMITER).useValue(limiter)
    .overrideProvider(FEEDBACK_PORTS).useValue({ promos: { issue: async () => null }, alerts: { lowRating: async () => {} } })
    .overrideProvider(SESSION_USERS).useValue(sessions)
    .overrideProvider(STAFF_ACCESS).useValue(defaultStaffAccess);
  if (opts.env) builder = builder.overrideProvider(APP_CONFIG).useValue(loadConfig(opts.env));
  for (const [token, value] of opts.overrides ?? []) builder = builder.overrideProvider(token).useValue(value);
  const moduleRef = await builder.compile();
  const app = await configureApp(moduleRef.createNestApplication<NestFastifyApplication>(createAdapter(), { logger: false }));
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return { app, limiter };
}
