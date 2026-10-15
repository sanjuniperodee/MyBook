import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BookRow, PhotoRow } from "@/modules/authoring/infrastructure/queries";
import type { User } from "@/server/auth";
import { DrizzleAuthoringQueries } from "@/modules/authoring/infrastructure/queries";
import { AuthoringError, Book, type BookViewer } from "@/modules/authoring/domain";
import { allPermissions } from "@/shared/domain/permissions";
import { IdentityError } from "@/modules/identity/domain";
import { assertStaff, assertStaffShell, ForbiddenError, requireStaff, requireStaffShell } from "@/server/access";
import { api, apiBook, apiViewer } from "@/server/api";
import { getAccessibleBook, viewerOf } from "@/server/books";
import { trustedClientIp } from "@/server/rateLimit";
import { PATCH as patchQuestion } from "@/app/api/books/[id]/questions/[qid]/route";
import { GET as getPhoto } from "@/app/api/photos/[id]/route";
import { loginAction } from "@/app/(auth)/actions";
import { anna, client, egor, fake, NotFound, owner, person, Redirect, request, resetContainer, resetRequest, security, signIn, vera, withTwoFactor } from "./doubles/web";

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

  it("viewerOf: книги клиентов открыты сотруднику с clients.view (менять — с clients.edit), вошедшему из разрешённой сети и с 2FA (V1, решение 1)", async () => {
    const viewer = async (u: User) => (signIn(u), await viewerOf(u));
    expect(await viewer(client)).toEqual({ userId: "u1", isStaff: false, staffEdits: false });
    expect(await viewer(anna)).toEqual({ userId: "anna", isStaff: false, staffEdits: false });
    expect(await viewer(vera)).toEqual({ userId: "vera", isStaff: true, staffEdits: false });
    expect(await viewer(egor)).toEqual({ userId: "egor", isStaff: true, staffEdits: true });
    expect(await viewer(owner)).toEqual({ userId: "boss", isStaff: true, staffEdits: true });
    expect(await viewer(person("old", { role: "admin", staffDisabled: true }))).toEqual({ userId: "old", isStaff: false, staffEdits: false });
    // Правила «Безопасности»: обязательная 2FA не настроена, вход не из офиса — как клиент.
    security.require2fa = true;
    expect(await viewer(egor)).toEqual({ userId: "egor", isStaff: false, staffEdits: false });
    expect(await viewer({ ...egor, ...withTwoFactor })).toEqual({ userId: "egor", isStaff: true, staffEdits: true });
    security.allowlist = OFFICE;
    request.headers.set("x-real-ip", "8.8.8.8");
    expect(await viewer({ ...egor, ...withTwoFactor })).toEqual({ userId: "egor", isStaff: false, staffEdits: false });
  });

  it("владелец видит свою книгу и фото; чужой клиент и отключённый сотрудник — 404", async () => {
    signIn(client);
    expect(await bookOf()).toEqual({ status: 200, body: BOOK });
    expect(await getAccessibleBook(BOOK, client)).toBe(db.book);
    expect(await queries.photoFor(PHOTO, await viewerOf(client))).toBe(db.photo!.photo);
    for (const u of [person("u2"), person("old", { role: "admin", staffDisabled: true })]) {
      signIn(u);
      expect(await bookOf()).toEqual({ status: 404, body: { error: "Книга не найдена", code: "bookNotFound" } });
      await expect(getAccessibleBook(BOOK, u)).rejects.toBeInstanceOf(NotFound);
      expect(await queries.photoFor(PHOTO, await viewerOf(u))).toBeNull();
    }
  });

  it("мусор вместо id — 404 без запроса к базе; правка не черновика — 409 bookLocked", async () => {
    signIn(client);
    expect((await respond(async (r) => (await apiBook(r, "1 or 1=1")).book.id)).status).toBe(404);
    expect(await queries.photoFor("../etc/passwd", await viewerOf(client))).toBeNull();
    expect((await bookOf({ editable: true })).status).toBe(200);
    db.book = { ...db.book!, status: "ordered" };
    expect(await bookOf()).toEqual({ status: 200, body: BOOK });
    expect(await bookOf({ editable: true })).toEqual({ status: 409, body: { error: "Книга уже передана в печать и не может быть изменена", code: "bookLocked" } });
  });

  it("сотрудник без clients.view или не из разрешённой сети — 404 на книге, фото и API, как чужой клиент (V1 закрыт)", async () => {
    fake.authoring.photoFile = async (key: string) => Buffer.from(key);
    const photo = () => getPhoto(new Request(`http://localhost/api/photos/${PHOTO}`), { params: Promise.resolve({ id: PHOTO }) });
    const blocked = async (u: User) => {
      signIn(u);
      expect(await respond(async (r) => (await apiViewer(r)).viewer)).toEqual({ status: 200, body: { userId: u.id, isStaff: false, staffEdits: false } });
      expect(await bookOf()).toEqual({ status: 404, body: { error: "Книга не найдена", code: "bookNotFound" } });
      await expect(getAccessibleBook(BOOK, u)).rejects.toBeInstanceOf(NotFound);
      expect((await photo()).status).toBe(404);
    };
    // Менеджер без «Видеть клиентов и их книги»
    await blocked(anna);
    // С правом, но не из разрешённой сети / без обязательной 2FA
    security.allowlist = OFFICE;
    request.headers.set("x-real-ip", "8.8.8.8");
    await blocked(vera);
    request.headers.set("x-real-ip", "10.1.2.5");
    security.require2fa = true;
    await blocked(vera);
  });

  it("clients.view — читает книгу и фото клиента, но не меняет (404); clients.edit — меняет", async () => {
    fake.authoring.photoFile = async (key: string) => Buffer.from(key);
    signIn(vera);
    expect(await bookOf()).toEqual({ status: 200, body: BOOK });
    expect(await bookOf({ editable: true })).toEqual({ status: 404, body: { error: "Книга не найдена", code: "bookNotFound" } });
    expect(await getAccessibleBook(BOOK, vera)).toBe(db.book);
    const photo = await getPhoto(new Request(`http://localhost/api/photos/${PHOTO}`), { params: Promise.resolve({ id: PHOTO }) });
    expect(photo.status).toBe(200);
    expect(await photo.text()).toBe("thumb.jpg");
    signIn(egor);
    expect(await bookOf({ editable: true })).toEqual({ status: 200, body: BOOK });

    // PATCH /api/books/<id>/questions/<qid>: правило домена Book.isEditableBy пускает владельца и сотрудника с clients.edit
    const theme = { id: "love", titleSuggestions: ["Т"], defaultCover: "linen", defaultInterior: "classic", questions: [] };
    const book = Book.start(BOOK, { userId: "u1", language: "ru", authorName: "Алия", authorGender: "f", recipientName: "Марат", recipientGender: "m" }, theme, new Date()).book;
    const edits: string[] = [];
    fake.authoring.questions = {
      edit: async (_id: string, v: BookViewer, _qid: string, patch: { answer: string }) => {
        if (!book.isEditableBy(v)) throw new AuthoringError("bookNotFound");
        edits.push(`${v.userId}: ${patch.answer}`);
      },
    };
    const patch = (who: User) => {
      signIn(who);
      return patchQuestion(new Request(`http://localhost/api/books/${BOOK}/questions/${QUESTION}`, { method: "PATCH", body: JSON.stringify({ answer: "текст" }) }), { params: Promise.resolve({ id: BOOK, qid: QUESTION }) });
    };
    const statuses: Record<string, number> = {};
    for (const who of [client, person("u2"), anna, vera, egor, owner]) statuses[who.id] = (await patch(who)).status;
    expect(statuses).toEqual({ u1: 200, u2: 404, anna: 404, vera: 404, egor: 200, boss: 200 });
    expect(edits).toEqual(["u1: текст", "egor: текст", "boss: текст"]);
  });
});

describe("IP для лимитов частоты: trustedClientIp() (src/server/rateLimit.ts)", () => {
  it("адрес — от своего прокси (X-Real-IP или последний в X-Forwarded-For): подменённый первый адрес не сбрасывает лимит входа по IP (V2, решение 2)", async () => {
    // Прокси пишет настоящий адрес в X-Real-IP и дописывает его в конец X-Forwarded-For.
    resetRequest({ "x-real-ip": "10.0.0.1", "x-forwarded-for": "1.1.1.1, 10.0.0.1" });
    expect(await trustedClientIp()).toBe("10.0.0.1");
    resetRequest({ "x-forwarded-for": "1.1.1.1, 10.0.0.2" });
    expect(await trustedClientIp()).toBe("10.0.0.2");
    resetRequest({ "x-real-ip": "10.0.0.1", "x-forwarded-for": "1.1.1.1, 10.0.0.1" });

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
    // Ключ лимита по IP один и тот же, сколько ни меняй первый адрес.
    expect(keys).toEqual(["login:10.0.0.1", "login:a@b.kz", "login:10.0.0.1", "login:a@b.kz"]);
  });
});
