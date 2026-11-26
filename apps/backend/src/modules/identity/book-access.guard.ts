import { createParamDecorator, Inject, Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import type { BookRow, BookViewer } from "@/modules/authoring";
import type { CurrentUser } from "@/modules/identity";
import { STAFF_ACCESS, type StaffAccessPort } from "../../core/auth/staff";
import { APP_CONFIG, type AppConfig } from "../../core/config/app-config";
import { ApiError } from "../../core/errors/api-error";
import { clientIp } from "../../core/http/client-ip";
import { CABINET_BOOK_PORTS, type CabinetBookPorts } from "./identity.tokens";

/** Книга и права текущего пользователя на неё (владелец или сотрудник CRM с доступом к книге). */
export interface AccessibleBook {
  book: BookRow;
  viewer: BookViewer;
}

const BOOK_ACCESS = new WeakMap<FastifyRequest, AccessibleBook>();

function contractBookId(input: unknown): string {
  if (typeof input === "object" && input !== null && "bookId" in input && typeof input.bookId === "string") {
    return input.bookId;
  }
  throw new ApiError(400, "badData");
}

/**
 * Доступ к книге без `next/headers` (паритет с `apiViewer`/`apiBook`/`localViewerOf`):
 * - обычный пользователь видит и редактирует только свои книги;
 * - действующий сотрудник CRM (прошедший IP-allowlist и обязательную 2FA) с правом `clients.view` видит все книги при
 *   `scope === "all"` или книги своих клиентов при `scope === "own"` (`bookOwnership` + `context.ownsClient`);
 * - право редактировать книгу сотрудника — `clients.view` + `clients.edit`.
 */
@Injectable()
export class BookAccessService {
  constructor(
    @Inject(STAFF_ACCESS) private readonly staffAccess: StaffAccessPort,
    @Inject(CABINET_BOOK_PORTS) private readonly books: CabinetBookPorts,
  ) {}

  async viewerFor(user: CurrentUser, ip: string, bookId: string | null): Promise<BookViewer> {
    if (user.role !== "admin" || user.staffDisabled) {
      return { userId: user.id, isStaff: false, staffEdits: false };
    }
    const resolved = await this.staffAccess.resolve(user, ip);
    // Как getStaff(): если сотрудника блокирует IP-allowlist или ненастроенная обязательная 2FA — доступ как у обычного клиента.
    if (!resolved || resolved.gate !== null) {
      return { userId: user.id, isStaff: false, staffEdits: false };
    }
    const { context } = resolved;
    let canSee = false;
    if (context.can("clients.view")) {
      if (context.scope === "all") {
        canSee = true;
      } else if (bookId) {
        const own = await this.books.bookOwnership(bookId);
        canSee = !!own && context.ownsClient(own.managerId);
      }
    }
    if (!canSee) {
      return { userId: user.id, isStaff: false, staffEdits: false };
    }
    return {
      userId: user.id,
      isStaff: true,
      staffEdits: context.can("clients.view", "clients.edit"),
    };
  }

  async loadBook(user: CurrentUser, ip: string, bookId: string): Promise<AccessibleBook> {
    const viewer = await this.viewerFor(user, ip, bookId);
    const book = await this.books.visibleBook(bookId, viewer);
    if (!book) throw new ApiError(404, "bookNotFound");
    return { book, viewer };
  }
}

/**
 * Guard доступа к книге по `bookId` из контракта: проверяет видимость (владелец или сотрудник CRM) и кладёт `{ book, viewer }`
 * для декоратора `@BookAccess()`. Чужая или несуществующая книга — одинаково 404 `bookNotFound`.
 */
@Injectable()
export class BookAccessGuard implements CanActivate {
  constructor(
    @Inject(BookAccessService) private readonly access: BookAccessService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<FastifyRequest>();
    if (!req.user) throw new ApiError(401, "unauthorized");
    const bookId = contractBookId(req.contractInput);
    const resolved = await this.access.loadBook(req.user, clientIp(req, this.config.edgeIpSecret), bookId);
    BOOK_ACCESS.set(req, resolved);
    return true;
  }
}

/** Книга и права просмотра, загруженные `BookAccessGuard`. */
export const BookAccess = createParamDecorator((_: unknown, ctx: ExecutionContext): AccessibleBook => {
  const req = ctx.switchToHttp().getRequest<FastifyRequest>();
  const resolved = BOOK_ACCESS.get(req);
  if (!resolved) throw new Error("BookAccess: маршрут без BookAccessGuard");
  return resolved;
});
