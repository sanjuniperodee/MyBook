import { Controller, Inject, Param, Req, Res } from "@nestjs/common";
import { ZipArchive } from "archiver";
import type { FastifyReply, FastifyRequest } from "fastify";
import { PassThrough } from "node:stream";
import { z } from "zod";
import type { LiveEvent } from "@/modules/workspace";
import type { StaffMember } from "../../core/auth/staff";
import { CurrentStaff, Permissions } from "../../core/auth/staff.decorators";
import { ApiError } from "../../core/errors/api-error";
import { header } from "../../core/http/request";
import { RawBody, SiteRoute } from "../../core/http/site-route";
import {
  createRequestAbort,
  measureFile,
  nodeStreamToWeb,
  parseJsonBody,
  requireUuid,
  safeParseJson,
  uuidSchema,
} from "./crm-site.helpers";
import { CRM_SITE_PORTS, type CrmSitePorts } from "./crm-site.tokens";

const WHATSAPP_CDN = /^https:\/\/[a-z0-9.-]+\.(whatsapp\.net|fbcdn\.net)\//i;
const CATALOG_ID = /^\d{1,40}$/;

const notificationsBodySchema = z.object({ id: uuidSchema.optional() });

const pushSubscribeSchema = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(4).max(100) }),
});

const pushUnsubscribeSchema = z.object({ endpoint: z.string().max(1000) });

/**
 * 7 маршрутов сайта CRM:
 * каталог WhatsApp (`/api/admin/catalog/photo`, `/api/admin/catalog/{id}/image`),
 * живые счётчики и SSE (`/api/admin/live`, `/api/admin/live/stream`),
 * уведомления (`/api/admin/notifications`), push-подписки (`/api/admin/push` GET/POST/DELETE)
 * и ZIP-пакет типографии (`/api/admin/orders/{id}/package`).
 */
@Controller()
export class CrmLiveCatalogSiteController {
  constructor(@Inject(CRM_SITE_PORTS) private readonly ports: CrmSitePorts) {}

  @SiteRoute("GET", "/api/admin/catalog/photo", { auth: "staff" })
  @Permissions("catalog.manage")
  async catalogPhoto(@Req() req: FastifyRequest): Promise<Response> {
    const url = new URL(req.url, "http://localhost").searchParams.get("u") ?? "";
    if (!WHATSAPP_CDN.test(url)) throw new ApiError(404, "notFound");
    const image = await this.ports.catalogRemoteImage(url).catch(() => null);
    if (!image) throw new ApiError(404, "notFound");
    return new Response(new Uint8Array(image.data), {
      headers: {
        "Content-Type": image.mime,
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  @SiteRoute("GET", "/api/admin/catalog/{id}/image", { auth: "staff" })
  async catalogImage(@Param("id") id: string, @CurrentStaff() staff: StaffMember): Promise<Response> {
    if (!staff.context.can("chats.view") && !staff.context.can("catalog.manage")) {
      throw new ApiError(403, "forbidden");
    }
    if (!CATALOG_ID.test(id)) throw new ApiError(404, "notFound");
    const image = await this.ports.catalogProductImage(id);
    if (!image) throw new ApiError(404, "notFound");
    return new Response(new Uint8Array(image.data), {
      headers: {
        "Content-Type": image.mime,
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  @SiteRoute("GET", "/api/admin/live", { auth: "staff" })
  async live(@CurrentStaff() staff: StaffMember): Promise<Response> {
    return Response.json(await this.ports.liveState(staff.context), { headers: { "Cache-Control": "no-store" } });
  }

  @SiteRoute("GET", "/api/admin/live/stream", { auth: "staff" })
  liveStream(
    @CurrentStaff() staff: StaffMember,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Response {
    const staffId = staff.user.id;
    const encoder = new TextEncoder();
    const { signal, cleanup: cleanupAbort } = createRequestAbort(req, reply);
    let closed = false;
    let cleanup = () => {
      if (closed) return;
      closed = true;
      cleanupAbort();
    };
    const stream = new ReadableStream<Uint8Array>({
      start: async (controller) => {
        const send = (chunk: string) => {
          if (closed) return;
          try {
            controller.enqueue(encoder.encode(chunk));
          } catch {
            cleanup();
          }
        };
        send("retry: 5000\n\n");
        let unsubscribe = () => {};
        // Таймер ставится после подписки, а closeAll его снимает раньше, если поток закрылся во время подписки.
        let ping: ReturnType<typeof setInterval> | undefined = undefined;
        const closeAll = () => {
          if (closed) return;
          closed = true;
          if (ping) clearInterval(ping);
          unsubscribe();
          cleanupAbort();
          try {
            controller.close();
          } catch {
            // Поток уже закрыт.
          }
        };
        cleanup = closeAll;
        if (signal.aborted) {
          closeAll();
          return;
        }
        signal.addEventListener("abort", () => closeAll(), { once: true });
        unsubscribe = await this.ports.subscribeLive((e: LiveEvent) => {
          if (e.users && !e.users.includes(staffId)) return;
          const payload = {
            type: e.type,
            conversationId: e.conversationId ?? null,
            ...(e.type === "board" ? { boardId: e.boardId ?? null, taskId: e.taskId ?? null } : {}),
          };
          send(`data: ${JSON.stringify(payload)}\n\n`);
        });
        if (closed) {
          unsubscribe();
          return;
        }
        ping = setInterval(() => send(": ping\n\n"), 25_000);
      },
      cancel() {
        cleanup();
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  }

  @SiteRoute("POST", "/api/admin/notifications", { auth: "staff" })
  async markNotifications(@CurrentStaff() staff: StaffMember, @RawBody() raw: Buffer): Promise<Response> {
    const { id } = notificationsBodySchema.parse(safeParseJson(raw, {}));
    await this.ports.markNotificationsRead(staff.user.id, id);
    void this.ports.syncMobileBadge(staff.user.id).catch((err: unknown) => console.error("[push:badge]", err));
    return Response.json({ ok: true });
  }

  @SiteRoute("GET", "/api/admin/push", { auth: "staff" })
  async pushKey(): Promise<Response> {
    const { publicKey } = await this.ports.vapidKeys();
    return Response.json({ publicKey });
  }

  @SiteRoute("POST", "/api/admin/push", { auth: "staff" })
  async pushSubscribe(
    @CurrentStaff() staff: StaffMember,
    @Req() req: FastifyRequest,
    @RawBody() raw: Buffer,
  ): Promise<Response> {
    const s = pushSubscribeSchema.parse(parseJsonBody(raw));
    await this.ports.subscribePush(staff.user.id, {
      endpoint: s.endpoint,
      p256dh: s.keys.p256dh,
      auth: s.keys.auth,
      userAgent: (header(req, "user-agent") ?? "").slice(0, 200),
    });
    return Response.json({ ok: true });
  }

  @SiteRoute("DELETE", "/api/admin/push", { auth: "staff" })
  async pushUnsubscribe(@CurrentStaff() staff: StaffMember, @RawBody() raw: Buffer): Promise<Response> {
    const { endpoint } = pushUnsubscribeSchema.parse(parseJsonBody(raw));
    await this.ports.unsubscribePush(staff.user.id, endpoint);
    return Response.json({ ok: true });
  }

  @SiteRoute("GET", "/api/admin/orders/{id}/package", { auth: "staff" })
  @Permissions("orders.files")
  orderPackage(@Param("id") rawId: string, @CurrentStaff() staff: StaffMember): Promise<Response> {
    return measureFile("order-package", async () => {
      const id = requireUuid(rawId);
      const order = await this.ports.findOrderDetails(id);
      if (!order || !(await this.ports.canSeeOrder(staff, order.id))) {
        throw new ApiError(404, "orderNotFound");
      }
      const job = {
        orderId: order.id,
        bookId: order.bookId,
        number: order.number,
        plan: order.plan,
        quantity: order.quantity,
      };
      await this.ports.preparePrintFiles(job);
      const [block, cover, layout, spec] = await Promise.all([
        this.ports.getPrintFile(job, "block"),
        this.ports.getPrintFile(job, "cover"),
        this.ports.getPrintFile(job, "layout"),
        this.ports.getPrintFile(job, "spec"),
      ]);
      const zip = new ZipArchive({ zlib: { level: 6 } });
      const out = new PassThrough();
      zip.pipe(out);
      const dir = `order-${order.number}`;
      zip.append(block, { name: `${dir}/block.pdf` });
      zip.append(cover, { name: `${dir}/cover.pdf` });
      zip.append(layout, { name: `${dir}/layout.pdf` });
      zip.append(spec, { name: `${dir}/spec.txt` });
      void zip.finalize();
      return new Response(nodeStreamToWeb(out), {
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="${dir}.zip"`,
          "Cache-Control": "private, no-store",
        },
      });
    });
  }
}
