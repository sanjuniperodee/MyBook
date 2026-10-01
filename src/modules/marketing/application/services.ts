import type { Clock } from "@/shared/application";
import { linkCodeFromText, normalizeSlug } from "@/lib/crm/channels";
import { DISCOUNT_HOURS, buildChannelReport, discountCap, isPreviewBot, isValidSlug, linkAttribution, linkTarget, offerTexts, type ChatOffers, type OfferRequest, type TrackedLink } from "../domain";
import type { AppLinks, ClientContext, LinkRepository, MarketingSettings, PromoCodeGenerator, PromoIssuer, ReportSource } from "./ports";

/** Каналы привлечения, короткие ссылки и предложения клиенту из чата. */
export class MarketingService {
  constructor(
    private readonly source: ReportSource,
    private readonly links: LinkRepository,
    private readonly clients: ClientContext,
    private readonly promos: PromoIssuer,
    private readonly promoCode: PromoCodeGenerator,
    private readonly settings: MarketingSettings,
    private readonly app: AppLinks,
    private readonly clock: Clock,
  ) {}

  /** Отчёт по каналам за последние days дней (null — за всё время). */
  async report(days: number | null) {
    const since = days ? new Date(this.clock.now().getTime() - days * 86_400_000) : null;
    const rows = await this.source.rows(since);
    return buildChannelReport(rows.clients, rows.deals, rows.clicks);
  }

  shopWhatsapp() {
    return this.settings.whatsappNumber();
  }

  shortUrl(slug: string) {
    return `${this.app.appUrl}/go/${slug}`;
  }

  async target(link: TrackedLink) {
    return linkTarget(link, this.app.appUrl, await this.settings.whatsappNumber());
  }

  /** Переход по короткой ссылке: считаем клик (кроме роботов превью) и возвращаем адрес; null — ссылки нет. */
  async follow(slug: string, userAgent: string) {
    const link = isValidSlug(slug) ? await this.links.bySlug(slug) : null;
    if (!link || link.archived) return null;
    if (!isPreviewBot(userAgent)) await this.links.recordClick(link.id, this.clock.now()).catch((err) => console.error("[go] click", err));
    return this.target(link);
  }

  /** Новая короткая ссылка: код из названия/UTM, если не задан; код уникален. */
  async createLink(input: Omit<TrackedLink, "id" | "archived" | "slug"> & { slug: string; name: string; createdById: string }) {
    const slug = normalizeSlug(input.slug || `${input.utmSource}-${input.utmCampaign || input.name}`);
    if (slug.length < 2) return { error: "Короткий код — латиница и цифры, минимум 2 символа" } as const;
    if (await this.links.bySlug(slug)) return { error: `Код «${slug}» уже занят — придумайте другой` } as const;
    await this.links.add({ ...input, slug, targetPath: input.kind === "site" ? input.targetPath : "/" });
    return { slug } as const;
  }

  archiveLink(id: string, archived: boolean) {
    return this.links.setArchived(id, archived);
  }

  /** Код рекламной ссылки в первом сообщении клиента → откуда он пришёл. */
  async attributionFromText(text: string) {
    const code = linkCodeFromText(text);
    const link = code ? await this.links.bySlug(code) : null;
    return link ? (linkAttribution(link) as Record<string, string>) : null;
  }

  async chatOffers(clientId: string | null, canDiscount: boolean): Promise<ChatOffers> {
    const c = await this.clients.load(clientId);
    return {
      order: c.order ? { number: c.order.number } : null,
      book: c.book ? { title: c.book.title || "Книга" } : null,
      maxDiscount: canDiscount ? discountCap(await this.settings.maxDiscount()) : 0,
    };
  }

  /** Готовит текст сообщения (и персональный промокод для скидки). Отправляет вызывающий. */
  async buildOffer(clientId: string | null, req: OfferRequest, staffLabel: string): Promise<{ text: string; promo?: string }> {
    const c = await this.clients.load(clientId);
    const t = offerTexts[c.locale];
    if (req.kind === "order") {
      if (!c.order) throw new Error("У клиента нет неоплаченного заказа");
      return { text: t.order(c.order.number, this.app.link(`/orders/${c.order.id}`, c.locale)) };
    }
    if (req.kind === "book") {
      if (!c.book) throw new Error("У клиента нет книги в работе");
      return { text: t.book(c.book.title || "—", this.app.link(`/books/${c.book.id}`, c.locale)) };
    }
    const max = discountCap(await this.settings.maxDiscount());
    if (!Number.isInteger(req.percent) || req.percent < 1 || req.percent > max) throw new Error(`Скидка — от 1 до ${max}%`);
    if (!DISCOUNT_HOURS.includes(req.hours)) throw new Error("Неверный срок действия");
    const promo = await this.promos.issuePersonal({ code: this.promoCode(), percent: req.percent, validHours: req.hours, note: `Персональная скидка из чата · ${staffLabel}` });
    if (!promo?.expiresAt) throw new Error("Не удалось выпустить промокод, попробуйте ещё раз");
    const url = c.book ? this.app.link(`/books/${c.book.id}/checkout?promo=${promo.code}`, c.locale) : this.app.link("/", c.locale);
    return { text: t.discount(req.percent, promo.code, this.app.formatDate(promo.expiresAt, c.locale), url), promo: promo.code };
  }
}
