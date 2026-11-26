import "server-only";
import { AGGREGATE_MIN_COUNT, verifyReviewToken } from "@/modules/feedback";
import { consoleLogger } from "@/shared/application";
import { getCurrentUser } from "@/server/auth";
import { container } from "@/server/container";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const log = consoleLogger("reviews");

/**
 * Кто может оставить отзыв к заказу: по подписанной ссылке из письма — без входа (подпись сверяется
 * до любого чтения из базы), иначе — владелец заказа в своём кабинете.
 */
export async function reviewAccess(orderId: string, token: string | null | undefined) {
  if (!UUID.test(orderId)) return false;
  if (verifyReviewToken(orderId, token)) return true;
  const user = await getCurrentUser();
  if (!user) return false;
  return !!(await container().ordering.queries.ownedOrderDetails(orderId, user.id));
}

/**
 * Отзывы для витрины сайта (по теме книги — для её страницы). Сводная оценка — только когда отзывов
 * достаточно. Сбой базы не должен ронять маркетинговую страницу — тогда блок просто не показывается.
 */
export async function siteReviewsLocal(limit: number, theme?: string) {
  const queries = container().feedback.queries;
  try {
    const [reviews, summary] = await Promise.all([queries.showcase(limit, theme), queries.summary(theme)]);
    return { reviews, summary: summary.count >= AGGREGATE_MIN_COUNT ? summary : null };
  } catch (err) {
    log.error("site reviews", err);
    return { reviews: [], summary: null };
  }
}

/** Витрина отзывов для страниц сайта: на сервере с БД — напрямую, на сайте без БД — через API v1 (Раздел 4). */
export async function siteReviews(limit: number, theme?: string) {
  const { v1WebRead } = await import("./v1-web-client");
  return v1WebRead({
    name: "public.reviewsShowcase",
    section: "public",
    sessionCookie: null,
    local: () => siteReviewsLocal(limit, theme),
    viaApi: async (api) => {
      const r = await api.webReviewsShowcase({ limit, ...(theme ? { theme } : {}) });
      return { reviews: r.reviews.map((x) => ({ ...x, publishedAt: x.publishedAt ? new Date(x.publishedAt) : null })), summary: r.summary };
    },
  });
}
