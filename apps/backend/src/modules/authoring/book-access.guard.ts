import { applyDecorators, createParamDecorator, Inject, Injectable, SetMetadata, UseGuards, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { FastifyRequest } from "fastify";
import type { BookRow } from "@/modules/authoring";
import { isBookEditableBy, type BookViewer } from "@/modules/authoring/domain";
import { STAFF_ACCESS, type StaffAccessPort } from "../../core/auth/staff";
import { APP_CONFIG, type AppConfig } from "../../core/config/app-config";
import { ApiError } from "../../core/errors/api-error";
import { clientIp } from "../../core/http/client-ip";
import { AUTHORING, AUTHORING_BOOK_OWNERSHIP, type AuthoringFacade, type BookOwnershipPort } from "./authoring.tokens";

/** Режим проверки доступа к книге (паритет с apiBook / apiViewer в src/server/api.ts). */
export type BookAccessMode = "read" | "edit" | "viewer";

interface BookAccessState {
  viewer: BookViewer;
  book?: BookRow;
}

const BOOK_ACCESS = Symbol("bookAccess");
const ACCESS_STORE = new WeakMap<FastifyRequest, BookAccessState>();

function extractBookId(input: unknown): string | null {
  if (typeof input !== "object" || input === null) return null;
  const id = Reflect.get(input, "bookId");
  return typeof id === "string" ? id : null;
}

/**
 * Доступ к книге для владельца и сотрудника CRM (без next/headers):
 * - запускается после SessionGuard и ContractInputGuard (кривой UUID даёт 400 до 404/409, как в mybook-api);
 * - для сотрудника (role === "admin", не отключён) проверяет роль, IP-allowlist, обязательную 2FA через STAFF_ACCESS,
 *   право clients.view / clients.edit и область видимости (scope "all" или книга своего клиента через bookOwnership);
 * - при блокировке IP/2FA сотрудник теряет права CRM, но сохраняет доступ владельца к собственной книге (паритет с getStaff).
 */
@Injectable()
export class BookAccessGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(STAFF_ACCESS) private readonly staffAccess: StaffAccessPort,
    @Inject(AUTHORING) private readonly authoring: AuthoringFacade,
    @Inject(AUTHORING_BOOK_OWNERSHIP) private readonly ownership: BookOwnershipPort,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const mode = this.reflector.getAllAndOverride<BookAccessMode | undefined>(BOOK_ACCESS, [ctx.getHandler(), ctx.getClass()]);
    if (!mode) return true;
    const req = ctx.switchToHttp().getRequest<FastifyRequest>();
    const user = req.user;
    if (!user) throw new ApiError(401, "unauthorized");
    const bookId = extractBookId(req.contractInput);

    let viewer: BookViewer = { userId: user.id, isStaff: false, staffEdits: false };
    if (user.role === "admin" && !user.staffDisabled) {
      const resolved = await this.staffAccess.resolve(user, clientIp(req, this.config.edgeIpSecret));
      if (resolved && !resolved.gate) {
        const staff = resolved.context;
        let sees = false;
        if (staff.can("clients.view")) {
          if (staff.scope === "all") sees = true;
          else if (bookId) {
            const own = await this.ownership.bookOwnership(bookId);
            sees = !!own && staff.ownsClient(own.managerId);
          }
        }
        const acting = sees ? staff : null;
        viewer = {
          userId: user.id,
          isStaff: !!acting?.can("clients.view"),
          staffEdits: !!acting?.can("clients.view", "clients.edit"),
        };
      }
    }

    if (mode === "viewer") {
      ACCESS_STORE.set(req, { viewer });
      return true;
    }

    if (!bookId) throw new ApiError(404, "bookNotFound");
    const book = await this.authoring.queries.visibleBook(bookId, viewer);
    if (!book || (mode === "edit" && !isBookEditableBy(book.userId, viewer))) throw new ApiError(404, "bookNotFound");
    if (mode === "edit" && book.status !== "draft") throw new ApiError(409, "bookLocked");
    ACCESS_STORE.set(req, { viewer, book });
    return true;
  }
}

/** Декларативная проверка доступа к книге: read (apiBook), edit (apiBook editable) или viewer (apiViewer). */
export const BookAccess = (mode: BookAccessMode) => applyDecorators(SetMetadata(BOOK_ACCESS, mode), UseGuards(BookAccessGuard));

/** Читатель/редактор книги (BookViewer), вычисленный BookAccessGuard. */
export const BookAccessViewer = createParamDecorator((_: unknown, ctx: ExecutionContext): BookViewer => {
  const state = ACCESS_STORE.get(ctx.switchToHttp().getRequest<FastifyRequest>());
  if (!state) throw new Error("BookAccessViewer: маршрут без @BookAccess");
  return state.viewer;
});

/** Книга (BookRow), проверенная и загруженная BookAccessGuard (режимы read / edit). */
export const AccessibleBook = createParamDecorator((_: unknown, ctx: ExecutionContext): BookRow => {
  const state = ACCESS_STORE.get(ctx.switchToHttp().getRequest<FastifyRequest>());
  if (!state?.book) throw new Error("AccessibleBook: маршрут без @BookAccess('read' | 'edit')");
  return state.book;
});
