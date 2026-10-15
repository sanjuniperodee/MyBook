import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BookRow, PhotoRow } from "@/modules/authoring/infrastructure/queries";
import type { User } from "@/server/auth";
import { DrizzleAuthoringQueries } from "@/modules/authoring/infrastructure/queries";
import { AuthoringError, Book, type BookViewer } from "@/modules/authoring/domain";
import { allPermissions } from "@/shared/domain/permissions";
import { IdentityError } from "@/modules/identity/domain";
import { assertStaff, assertStaffShell, ForbiddenError, requireStaff, requireStaffShell } from "@/server/access";
import { api, apiBook, apiStaff, apiViewer } from "@/server/api";
import { getAccessibleBook, viewerOf } from "@/server/books";
import { clientIp, trustedClientIp } from "@/server/rateLimit";
import { PATCH as patchQuestion } from "@/app/api/books/[id]/questions/[qid]/route";
import { GET as getPhoto } from "@/app/api/photos/[id]/route";
import { loginAction } from "@/app/(auth)/actions";
import { anna, client, fake, NotFound, owner, person, Redirect, request, resetContainer, resetRequest, security, signIn, withTwoFactor } from "./doubles/web";

/** База с одной книгой клиента u1 и одним её фото: запросы DrizzleAuthoringQueries настоящие, условия where не разбираются. */
const db = vi.hoisted(() => ({ book: undefined as BookRow | undefined, photo: undefined as { photo: PhotoRow; ownerId: string } | undefined }));

vi.mock("next/headers", async () => (await import("./doubles/web")).nextHeaders);
vi.mock("next/navigation", async () => (await import("./doubles/web")).nextNavigation);
vi.mock("@/server/container", async () => (await import("./doubles/web")).containerModule);
vi.mock("@/shared/infrastructure/database", () => ({
  rootDb: {
    query: { books: { findFirst: async () => db.book } },
    select: () => ({ from: () => ({ innerJoin: () => ({ where: async () => (db.photo ? [db.photo] : []) }) }) }),
  },
}));

// Характеристические тесты (фаза 3, S6): права сотрудников (src/server/access.ts) и доступ к книгам (src/server/books.ts, apiBook).

const BOOK = "0b0b0b0b-0000-4000-8000-000000000001";
const PHOTO = "0f0f0f0f-0000-4000-8000-000000000001";
const QUESTION = "0a0a0a0a-0000-4000-8000-000000000001";
const OFFICE = "10.1.2.0/24";
const queries = new DrizzleAuthoringQueries();

/** Чем закончился вызов guard'а: адрес редиректа, 404, исключение или сотрудник. */
async function outcome(guard: () => Promise<{ user: { id: string } } | { staff: { user: { id: string } }; gate: unknown }>) {
  try {
    const r = await guard();
    return "staff" in r ? `ok:${r.staff.user.id}:${r.gate}` : `ok:${r.user.id}`;
  } catch (err) {
    if (err instanceof Redirect) return `redirect:${err.url}`;
    if (err instanceof NotFound) return "404";
    if (err instanceof ForbiddenError) return `forbidden:${err.message}`;
    throw err;
  }
}

/** Ответ api() на обработчик, который сам вызывает проверку (apiBook, apiStaff и т. п.). */
async function respond(handler: (req: Request) => Promise<unknown>) {
  const res = await api(async (r: Request) => Response.json(await handler(r)))(new Request("http://localhost/api/x", { method: "POST" }), {});
  return { status: res.status, body: await res.json() };
}

beforeEach(() => {
  resetRequest({ "x-real-ip": "10.1.2.5" });
  resetContainer();
  fake.authoring = { queries };
  db.book = { id: BOOK, userId: "u1", status: "draft" } as BookRow;
  db.photo = { photo: { id: PHOTO, bookId: BOOK, storageKey: "full.jpg", thumbKey: "thumb.jpg" } as PhotoRow, ownerId: "u1" };
});

describe("requireStaff: страницы админки", () => {
  it("без входа — на вход, клиент и отключённый сотрудник — в кабинет", async () => {
    expect(await outcome(() => requireStaff())).toBe("redirect:/login?next=/admin");
    signIn(client);
    expect(await outcome(() => requireStaff())).toBe("redirect:/books");
    signIn(person("old", { role: "admin", staffDisabled: true }));
    expect(await outcome(() => requireStaff())).toBe("redirect:/books");
  });

  it("нет права — 404, право есть или не требуется — сотрудник; руководитель без роли может всё", async () => {
    signIn(anna);
    expect(await outcome(() => requireStaff("clients.view"))).toBe("404");
    expect(await outcome(() => requireStaff("deals.view", "clients.view"))).toBe("404");
    expect(await outcome(() => requireStaff("deals.view"))).toBe("ok:anna");
    expect(await outcome(() => requireStaff())).toBe("ok:anna");
    signIn(owner);
    expect(await outcome(() => requireStaff("team.manage", "settings.manage"))).toBe("ok:boss");
  });

  it("не из белого списка IP — /admin-denied (раньше, чем 2FA и права), без своей 2FA при обязательной — /admin/security", async () => {
    security.allowlist = OFFICE;
    security.require2fa = true;
    signIn(owner);
    request.headers.set("x-real-ip", "10.9.9.9");
    expect(await outcome(() => requireStaff("team.manage"))).toBe("redirect:/admin-denied");
    signIn(anna);
    expect(await outcome(() => requireStaff("clients.view"))).toBe("redirect:/admin-denied");
    signIn(owner);
    request.headers.set("x-real-ip", "10.1.2.77");
    expect(await outcome(() => requireStaff("team.manage"))).toBe("redirect:/admin/security");
    signIn({ ...owner, ...withTwoFactor });
    expect(await outcome(() => requireStaff("team.manage"))).toBe("ok:boss");
  });

  it("IP для белого списка: X-Real-IP, иначе последний адрес X-Forwarded-For, иначе «local»", async () => {
    security.allowlist = OFFICE;
    const from = async (headers: Record<string, string>) => {
      resetRequest(headers);
      signIn(owner);
      return outcome(() => requireStaff());
    };
    expect(await from({ "x-real-ip": "10.1.2.5", "x-forwarded-for": "8.8.8.8" })).toBe("ok:boss");
    expect(await from({ "x-forwarded-for": "10.1.2.5, 8.8.8.8" })).toBe("redirect:/admin-denied");
    expect(await from({ "x-forwarded-for": "8.8.8.8, 10.1.2.5" })).toBe("ok:boss");
    expect(await from({})).toBe("redirect:/admin-denied");
  });
});

describe("assertStaff: server actions и API — исключение вместо редиректа", () => {
  it("без входа, клиент, без права, не из сети, без обязательной 2FA → ForbiddenError с русским текстом", async () => {
    const denied = "forbidden:Недостаточно прав для этого действия";
    expect(await outcome(() => assertStaff())).toBe(denied);
    signIn(client);
    expect(await outcome(() => assertStaff())).toBe(denied);
    signIn(anna);
    expect(await outcome(() => assertStaff("clients.view"))).toBe(denied);
    expect(await outcome(() => assertStaff("deals.view"))).toBe("ok:anna");
    security.require2fa = true;
    expect(await outcome(() => assertStaff("deals.view"))).toBe(denied);
    signIn({ ...anna, ...withTwoFactor });
    expect(await outcome(() => assertStaff("deals.view"))).toBe("ok:anna");
    security.allowlist = OFFICE;
    request.headers.set("x-real-ip", "8.8.8.8");
    expect(await outcome(() => assertStaff("deals.view"))).toBe(denied);
  });

  it("сотрудник: роль, охват и права от StaffResolver; без роли — руководитель со всеми правами", async () => {
    signIn(anna);
    const a = await assertStaff();
    expect([a.roleName, a.roleKey, a.scope, a.isOwner, [...a.permissions]]).toEqual(["Менеджер", "manager", "own", false, ["deals.view", "orders.edit"]]);
    signIn(owner);
    const b = await assertStaff();
    expect([b.roleName, b.roleKey, b.scope, b.isOwner, b.permissions.size]).toEqual(["Руководитель", "owner", "all", true, allPermissions.length]);
  });
});

describe("requireStaffShell и assertStaffShell: каркас админки и «Безопасность»", () => {
  it("пускают сотрудника, которому осталось настроить 2FA, но не из чужой сети", async () => {
    expect(await outcome(() => requireStaffShell())).toBe("redirect:/login?next=/admin");
    signIn(client);
    expect(await outcome(() => requireStaffShell())).toBe("redirect:/books");
    expect(await outcome(() => assertStaffShell())).toBe("forbidden:Недостаточно прав для этого действия");
    signIn(anna);
    security.require2fa = true;
    expect(await outcome(() => requireStaffShell())).toBe("ok:anna:2fa");
    expect(await outcome(() => assertStaffShell())).toBe("ok:anna");
    security.allowlist = OFFICE;
    request.headers.set("x-real-ip", "8.8.8.8");
    expect(await outcome(() => requireStaffShell())).toBe("redirect:/admin-denied");
    expect(await outcome(() => assertStaffShell())).toBe("forbidden:Недостаточно прав для этого действия");
  });
});

describe("книги клиентов: viewerOf, apiBook, getAccessibleBook, photoFor", () => {
  const bookOf = (opts?: { editable?: boolean }) => respond(async (r) => (await apiBook(r, BOOK, opts)).book.id);

  it("V1: так сейчас — viewerOf: сотрудник — любой с ролью admin, не отключённый, без учёта прав и правил безопасности (закроет E6)", () => {
    expect(viewerOf(client)).toEqual({ userId: "u1", isStaff: false });
    expect(viewerOf(anna)).toEqual({ userId: "anna", isStaff: true });
    expect(viewerOf(person("old", { role: "admin", staffDisabled: true }))).toEqual({ userId: "old", isStaff: false });
  });

  it("владелец видит свою книгу и фото; чужой клиент и отключённый сотрудник — 404", async () => {
    signIn(client);
    expect(await bookOf()).toEqual({ status: 200, body: BOOK });
    expect(await getAccessibleBook(BOOK, client)).toBe(db.book);
    expect(await queries.photoFor(PHOTO, viewerOf(client))).toBe(db.photo!.photo);
    for (const u of [person("u2"), person("old", { role: "admin", staffDisabled: true })]) {
      signIn(u);
      expect(await bookOf()).toEqual({ status: 404, body: { error: "Книга не найдена", code: "bookNotFound" } });
      await expect(getAccessibleBook(BOOK, u)).rejects.toBeInstanceOf(NotFound);
      expect(await queries.photoFor(PHOTO, viewerOf(u))).toBeNull();
    }
  });

  it("мусор вместо id — 404 без запроса к базе; правка не черновика — 409 bookLocked", async () => {
    signIn(client);
    expect((await respond(async (r) => (await apiBook(r, "1 or 1=1")).book.id)).status).toBe(404);
    expect(await queries.photoFor("../etc/passwd", viewerOf(client))).toBeNull();
    expect((await bookOf({ editable: true })).status).toBe(200);
    db.book = { ...db.book!, status: "ordered" };
    expect(await bookOf()).toEqual({ status: 200, body: BOOK });
    expect(await bookOf({ editable: true })).toEqual({ status: 409, body: { error: "Книга уже передана в печать и не может быть изменена", code: "bookLocked" } });
  });

  it("V1: так сейчас — сотрудник без clients.view и не из разрешённой сети читает и меняет книги клиентов (закроет E6)", async () => {
    security.allowlist = OFFICE;
    security.require2fa = true;
    request.headers.set("x-real-ip", "8.8.8.8");
    signIn(anna);

    // В CRM такого сотрудника не пускают…
    expect(await outcome(() => requireStaff("clients.view"))).toBe("redirect:/admin-denied");
    expect(await outcome(() => assertStaff("clients.view"))).toBe("forbidden:Недостаточно прав для этого действия");
    expect((await respond(async (r) => (await apiStaff(r, "clients.view")).user.id)).status).toBe(403);

    // …а книги клиента ему открыты: viewerOf не смотрит ни на права, ни на IP и 2FA
    const viewer = viewerOf(anna);
    expect(viewer).toEqual({ userId: "anna", isStaff: true });
    expect(await respond(async (r) => (await apiViewer(r)).viewer)).toEqual({ status: 200, body: viewer });
    expect(await bookOf({ editable: true })).toEqual({ status: 200, body: BOOK });
    expect(await getAccessibleBook(BOOK, anna)).toBe(db.book);

    // GET /api/photos/<id> отдаёт файл фото клиента
    fake.authoring.photoFile = async (key: string) => Buffer.from(key);
    const photo = await getPhoto(new Request(`http://localhost/api/photos/${PHOTO}`), { params: Promise.resolve({ id: PHOTO }) });
    expect(photo.status).toBe(200);
    expect(await photo.text()).toBe("thumb.jpg");

    // PATCH /api/books/<id>/questions/<qid> доходит до сервиса, и правило домена Book.isVisibleTo его пропускает
    const theme = { id: "love", titleSuggestions: ["Т"], defaultCover: "linen", defaultInterior: "classic", questions: [] };
    const book = Book.start(BOOK, { userId: "u1", language: "ru", authorName: "Алия", authorGender: "f", recipientName: "Марат", recipientGender: "m" }, theme, new Date()).book;
    const edits: unknown[] = [];
    fake.authoring.questions = {
      edit: async (_id: string, v: BookViewer, _qid: string, patch: unknown) => {
        if (!book.isVisibleTo(v)) throw new AuthoringError("bookNotFound");
        edits.push(patch);
      },
    };
    const patch = (who: User) => {
      signIn(who);
      return patchQuestion(new Request(`http://localhost/api/books/${BOOK}/questions/${QUESTION}`, { method: "PATCH", body: JSON.stringify({ answer: "чужой текст" }) }), { params: Promise.resolve({ id: BOOK, qid: QUESTION }) });
    };
    expect((await patch(person("u2"))).status).toBe(404);
    expect((await patch(anna)).status).toBe(200);
    expect(edits).toEqual([{ answer: "чужой текст" }]);
  });
});

describe("IP для лимитов частоты: clientIp() (src/server/rateLimit.ts)", () => {
  it("V2: так сейчас — первый адрес X-Forwarded-For подставляет сам клиент: сменил заголовок — новый ключ лимита входа по IP (закроет G)", async () => {
    // Прокси пишет настоящий адрес в X-Real-IP и дописывает его в конец X-Forwarded-For.
    resetRequest({ "x-real-ip": "10.0.0.1", "x-forwarded-for": "1.1.1.1, 10.0.0.1" });
    expect(await clientIp()).toBe("1.1.1.1");
    expect(await trustedClientIp()).toBe("10.0.0.1");

    const keys: string[] = [];
    fake.rateLimiter = {
      hit: async (key: string) => {
        keys.push(key);
        return true;
      },
    };
    fake.identity.auth = {
      login: async () => {
        throw new IdentityError("credentials");
      },
    };
    const form = new FormData();
    form.set("email", "a@b.kz");
    form.set("password", "secret123");
    for (const first of ["1.1.1.1", "2.2.2.2"]) {
      request.headers.set("x-forwarded-for", `${first}, 10.0.0.1`);
      expect(await loginAction({}, form)).toEqual({ error: "Неверный логин или пароль" });
    }
    // Лимит по логину держится, лимит по IP каждый раз начинается заново.
    expect(keys).toEqual(["login:1.1.1.1", "login:a@b.kz", "login:2.2.2.2", "login:a@b.kz"]);
  });
});
