import { randomUUID } from "node:crypto";
import { Controller, Inject, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import type { Output, Parsed } from "@mybook/contracts";
import type { Locale } from "@/i18n/config";
import { catalogLink } from "@/modules/messaging";
import type { Clock } from "@/shared/application";
import type { StaffMember } from "../../core/auth/staff";
import { CurrentStaff, Permissions } from "../../core/auth/staff.decorators";
import { APP_CONFIG, type AppConfig } from "../../core/config/app-config";
import { Input, RequestLocale, SessionToken } from "../../core/http/decorators";
import { Endpoint } from "../../core/http/endpoint";
import { CLOCK } from "../../core/kernel/tokens";
import { callContext, done, refused } from "./crm-admin.helpers";
import { CRM_ADMIN_PORTS, type CrmAdminPorts } from "./crm-admin.tokens";

const UPLOAD_TTL_MS = 30 * 60_000;
const UPLOAD_MAX_BYTES = 8 * 1024 * 1024;
const STALE_SYNC_MS = 5 * 60_000;

interface StagedUpload {
  staffId: string;
  file: Blob;
  fileName: string;
  at: number;
}

const photoSrc = (u: string) => `/api/admin/catalog/photo?u=${encodeURIComponent(u)}`;

/**
 * Каталог WhatsApp в CRM (8 контрактных маршрутов): просмотр товаров/коллекций, синхронизация,
 * загрузка фото во временное хранилище процесса (TTL 30 мин, владелец — загрузивший сотрудник),
 * сохранение/скрытие/удаление товара, сохранение/удаление коллекции.
 */
@Controller()
export class CrmCatalogController {
  private readonly uploads = new Map<string, StagedUpload>();

  constructor(
    @Inject(CRM_ADMIN_PORTS) private readonly ports: CrmAdminPorts,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  private sweep(now = this.clock.now().getTime()) {
    for (const [k, v] of this.uploads) {
      if (now - v.at > UPLOAD_TTL_MS) this.uploads.delete(k);
    }
  }

  @Endpoint("crmCatalog")
  @Permissions("catalog.manage")
  async catalog(): Promise<Output<"crmCatalog">> {
    const problem = await this.ports.catalogSyncIfStale(STALE_SYNC_MS);
    const [products, synced, phone] = await Promise.all([
      this.ports.catalogList(),
      this.ports.catalogLastSyncedAt(),
      this.ports.gowaCachedPhone(),
    ]);
    const collections = await this.ports.catalogCollections().then(
      (list) => ({ list, error: null as string | null }),
      (err: unknown) => ({ list: [], error: err instanceof Error ? err.message : String(err) }),
    );
    return {
      products: products.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        price: p.price,
        currency: p.currency,
        retailerId: p.retailerId,
        url: p.url,
        hidden: p.hidden,
        review: p.review,
        photos: p.imageUrls.map((u) => ({ url: u, src: photoSrc(u) })),
        coverSrc: `/api/admin/catalog/${p.id}/image`,
        videos: p.videoUrls.length,
      })),
      collections: collections.list.map((c) => ({ id: c.id, name: c.name, productIds: c.productIds })),
      collectionsError: collections.error,
      link: phone ? catalogLink(phone) : null,
      problem: problem ?? null,
      syncedLabel: synced ? synced.toLocaleString("ru-RU", { timeZone: "Asia/Almaty" }) : null,
    };
  }

  @Endpoint("crmCatalogSync")
  @Permissions("catalog.manage")
  async sync(
    @Req() req: FastifyRequest,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
  ): Promise<Output<"crmCatalogSync"> | Response> {
    const ctx = callContext(req, this.config, staff, token, locale);
    const r = await this.ports.syncCatalog(ctx);
    if (!r.ok) return refused(r.error);
    return done(`Обновлено из WhatsApp: ${r.total} товаров${r.removed ? `, убрано ${r.removed}` : ""}`);
  }

  @Endpoint("crmCatalogUpload")
  @Permissions("catalog.manage")
  async upload(
    @CurrentStaff() staff: StaffMember,
    @Input() input: Parsed<"crmCatalogUpload">,
  ): Promise<Output<"crmCatalogUpload"> | Response> {
    const now = this.clock.now().getTime();
    this.sweep(now);
    const tokens: string[] = [];
    for (const file of input.files) {
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return refused("Фото товара — JPEG, PNG или WebP");
      if (file.size > UPLOAD_MAX_BYTES) return refused("Фото больше 8 МБ — уменьшите");
      const token = randomUUID();
      const fileName = file instanceof File && file.name ? file.name : "photo.jpg";
      this.uploads.set(token, { staffId: staff.user.id, file, fileName, at: now });
      tokens.push(token);
    }
    return { tokens };
  }

  @Endpoint("crmCatalogSave")
  @Permissions("catalog.manage")
  async saveProduct(
    @Req() req: FastifyRequest,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
    @Input() input: Parsed<"crmCatalogSave">,
  ): Promise<Output<"crmCatalogSave"> | Response> {
    this.sweep();
    const b = input.body;
    const form = new FormData();
    form.set("name", b.name);
    form.set("description", b.description);
    form.set("price", b.price);
    form.set("currency", b.currency);
    form.set("retailerId", b.retailerId);
    form.set("url", b.url);
    form.set("hidden", b.hidden ? "true" : "false");
    if (b.keep) {
      form.set("keepSet", "1");
      for (const u of b.keep) form.append("keep", u);
    }
    for (const t of b.uploads) {
      const up = this.uploads.get(t);
      if (!up || up.staffId !== staff.user.id) return refused("Фото не дождалось сохранения — добавьте его ещё раз");
      form.append("image", up.file, up.fileName || "photo.jpg");
    }
    const ctx = callContext(req, this.config, staff, token, locale);
    const r = b.id ? await this.ports.updateProduct(ctx, b.id, form) : await this.ports.createProduct(ctx, form);
    if (!r.ok) return refused(r.error);
    for (const t of b.uploads) this.uploads.delete(t);
    return done(b.id ? "Товар сохранён — WhatsApp проверит изменения" : "Товар добавлен — после проверки WhatsApp его увидят клиенты");
  }

  @Endpoint("crmCatalogHidden")
  @Permissions("catalog.manage")
  async setHidden(
    @Req() req: FastifyRequest,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
    @Input() input: Parsed<"crmCatalogHidden">,
  ): Promise<Output<"crmCatalogHidden"> | Response> {
    const ctx = callContext(req, this.config, staff, token, locale);
    const r = await this.ports.setProductHidden(ctx, input.id, input.body.hidden);
    if (!r.ok) return refused(r.error);
    return done(input.body.hidden ? "Товар скрыт" : "Товар снова виден");
  }

  @Endpoint("crmCatalogDelete")
  @Permissions("catalog.manage")
  async deleteProduct(
    @Req() req: FastifyRequest,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
    @Input() input: Parsed<"crmCatalogDelete">,
  ): Promise<Output<"crmCatalogDelete"> | Response> {
    const ctx = callContext(req, this.config, staff, token, locale);
    const r = await this.ports.deleteProduct(ctx, input.id);
    if (!r.ok) return refused(r.error);
    return done("Товар удалён");
  }

  @Endpoint("crmCatalogCollectionSave")
  @Permissions("catalog.manage")
  async saveCollection(
    @Req() req: FastifyRequest,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
    @Input() input: Parsed<"crmCatalogCollectionSave">,
  ): Promise<Output<"crmCatalogCollectionSave"> | Response> {
    const ctx = callContext(req, this.config, staff, token, locale);
    const r = await this.ports.saveCollection(ctx, input.body.id ?? null, {
      name: input.body.name,
      productIds: input.body.productIds,
    });
    if (!r.ok) return refused(r.error);
    return done("Коллекция сохранена");
  }

  @Endpoint("crmCatalogCollectionDelete")
  @Permissions("catalog.manage")
  async deleteCollection(
    @Req() req: FastifyRequest,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
    @Input() input: Parsed<"crmCatalogCollectionDelete">,
  ): Promise<Output<"crmCatalogCollectionDelete"> | Response> {
    const ctx = callContext(req, this.config, staff, token, locale);
    const r = await this.ports.deleteCollection(ctx, input.id);
    if (!r.ok) return refused(r.error);
    return done("Коллекция удалена");
  }
}
