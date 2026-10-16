import { afterEach, beforeEach, vi } from "vitest";

/**
 * Часовой пояс магазина на время тестов блока. Пояс магазина — TZ процесса (storeTimeZone), поэтому тесты,
 * которые проверяют время «по Алматы», задают его сами и не зависят от TZ машины. undefined — TZ не задан.
 */
export function storeTimeZoneIs(tz: string | undefined) {
  beforeEach(() => {
    vi.stubEnv("TZ", tz);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });
}
