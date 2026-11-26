import "server-only";
import { v1WebRead } from "./api";

/** Витрина отзывов для страниц сайта — из API v1 (`webReviewsShowcase`). */
export async function siteReviews(limit: number, theme?: string) {
  return v1WebRead({
    name: "public.reviewsShowcase",
    section: "public",
    sessionCookie: null,
    viaApi: async (api) => {
      const r = await api.webReviewsShowcase({ limit, ...(theme ? { theme } : {}) });
      return { reviews: r.reviews.map((x) => ({ ...x, publishedAt: x.publishedAt ? new Date(x.publishedAt) : null })), summary: r.summary };
    },
  });
}
