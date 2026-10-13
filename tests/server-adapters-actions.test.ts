import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccessError } from "@/modules/access/domain";
import { IdentityError } from "@/modules/identity/domain";
import { OrderingError } from "@/modules/ordering/domain";
import { ForbiddenError } from "@/server/access";
import { updateOrderAction } from "@/app/admin/actions";
import { createStaffAction, setStaffRoleAction } from "@/app/admin/team/actions";
import { confirmTwoFactorAction, newBackupCodesAction, startTwoFactorAction } from "@/app/admin/security/actions";
import { loginAction } from "@/app/(auth)/actions";
import { anna, client, fake, owner, request, resetContainer, resetRequest, security, signIn } from "./doubles/web";

vi.mock("next/headers", async () => (await import("./doubles/web")).nextHeaders);
vi.mock("next/navigation", async () => (await import("./doubles/web")).nextNavigation);
vi.mock("next/cache", async () => (await import("./doubles/web")).nextCache);
vi.mock("@/server/container", async () => (await import("./doubles/web")).containerModule);

// Характеристические тесты (фаза 3, S6): локальные переводчики ошибок домена в server actions.
// E4 заменит их общим actionError(err) — тексты должны остаться прежними.

const ID = "0d0d0d0d-0000-4000-8000-000000000001";

const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

const failing = (err: unknown) => async () => {
  throw err;
};

/** Что бросило действие (или undefined, если не бросило). */
const thrown = (p: Promise<unknown>) => p.then(() => undefined, (e: unknown) => e);

beforeEach(() => {
  resetRequest();
  resetContainer();
});

describe("admin/actions.ts: orderingStaffMessage", () => {
  const update = (err?: unknown) => {
    fake.ordering = { orders: { update: err ? failing(err) : async () => {} } };
    return updateOrderAction({}, form({ orderId: ID, status: "paid" }));
  };

  it("четыре кода — свой текст, остальные — message ошибки, а без него сам код; прочие ошибки пробрасываются", async () => {
    signIn(anna);
    expect(await update()).toEqual({ ok: "Сохранено" });
    expect(await update(new OrderingError("orderNotFound"))).toEqual({ error: "Заказ не найден" });
    expect(await update(new OrderingError("invalidTransition", "pending_payment → delivered"))).toEqual({ error: "Такой переход статуса невозможен" });
    expect(await update(new OrderingError("staffNotFound"))).toEqual({ error: "Ответственным может быть только сотрудник CRM" });
    expect(await update(new OrderingError("promoExists"))).toEqual({ error: "Такой промокод уже есть" });
    expect(await update(new OrderingError("notPayable", "Заказ уже оплачен"))).toEqual({ error: "Заказ уже оплачен" });
    // так сейчас: у ошибки без message сотрудник видит машинный код
    expect(await update(new OrderingError("notPayable"))).toEqual({ error: "notPayable" });
    expect(await thrown(update(new AccessError("forbidden", "нет")))).toMatchObject({ code: "forbidden" });
  });

  it("не сотрудник — ForbiddenError; ошибка разбора формы — первое сообщение zod как есть", async () => {
    signIn(client);
    expect(await thrown(updateOrderAction({}, form({ orderId: ID, status: "paid" })))).toBeInstanceOf(ForbiddenError);
    signIn(anna);
    expect(await updateOrderAction({}, form({ orderId: "42", status: "paid" }))).toEqual({ error: "Invalid UUID" });
  });
});

describe("admin/team/actions.ts: run и orThrow", () => {
  beforeEach(() => signIn(owner));
  const create = (add: () => Promise<string>, email = "new@b.kz") => {
    fake.access.team = { add };
    return createStaffAction({}, form({ email, roleId: ID }));
  };

  it("createStaffAction: AccessError и IdentityError — их message в error, прочее пробрасывается", async () => {
    expect(await create(async () => "Сотрудник добавлен")).toEqual({ ok: "Сотрудник добавлен" });
    expect(await create(failing(new AccessError("ownerOnly", "Назначить руководителя может только руководитель")))).toEqual({ error: "Назначить руководителя может только руководитель" });
    // так сейчас: у IdentityError нет текста — руководитель видит код
    expect(await create(failing(new IdentityError("email")))).toEqual({ error: "email" });
    expect(await thrown(create(failing(new Error("db down"))))).toMatchObject({ message: "db down" });
    expect(await create(async () => "", "не почта")).toEqual({ error: "Проверьте адрес почты" });
  });

  it("orThrow: текст AccessError уходит простым Error, ZodError — как есть", async () => {
    fake.access.team = { changeRole: failing(new AccessError("lastOwner", "Должен остаться хотя бы один руководитель")) };
    const err = await thrown(setStaffRoleAction(ID, ID));
    expect(err).toBeInstanceOf(Error);
    expect(AccessError.is(err)).toBe(false);
    expect(err).toMatchObject({ message: "Должен остаться хотя бы один руководитель" });
    expect(await thrown(setStaffRoleAction("42", ID))).toMatchObject({ name: "ZodError" });
  });
});

describe("admin/security/actions.ts: fail", () => {
  const accounts = (methods: Record<string, () => Promise<unknown>>) => (fake.identity.accounts = methods);

  it("коды 2FA — свои тексты, AccessError — message, прочие IdentityError пробрасываются", async () => {
    signIn(anna);
    accounts({ regenerateBackupCodes: failing(new IdentityError("twoFactorCode")) });
    expect(await newBackupCodesAction("123456")).toEqual({ ok: false, message: "Неверный код. Проверьте, что время на телефоне точное, и введите свежий код." });
    accounts({ regenerateBackupCodes: failing(new AccessError("forbidden", "Нельзя")) });
    expect(await newBackupCodesAction("123456")).toEqual({ ok: false, message: "Нельзя" });
    accounts({ regenerateBackupCodes: failing(new IdentityError("credentials")) });
    expect(await thrown(newBackupCodesAction("123456"))).toMatchObject({ code: "credentials" });
    fake.rateLimiter = { hit: async () => false };
    expect(await newBackupCodesAction("123456")).toEqual({ ok: false, message: "Слишком много попыток — подождите 10 минут" });
  });

  it("шаги включения 2FA пускают без 2FA при обязательной; тот же код twoFactorCode — другим текстом", async () => {
    security.require2fa = true;
    signIn(anna);
    accounts({ beginTwoFactor: failing(new IdentityError("twoFactorAlreadyOn")), confirmTwoFactor: failing(new IdentityError("twoFactorCode")) });
    expect(await startTwoFactorAction()).toEqual({ ok: false, message: "2FA уже включена" });
    expect(await confirmTwoFactorAction("123456")).toEqual({ ok: false, message: "Код не подошёл. Проверьте, что время на телефоне точное, и введите свежий код." });
    expect(await thrown(newBackupCodesAction("123456"))).toBeInstanceOf(ForbiddenError);
  });
});

describe("(auth)/actions.ts: identityText — ошибки входа на языке пользователя", () => {
  const login = (err: unknown, fields = { email: "a@b.kz", password: "secret123" }) => {
    fake.identity.auth = { login: failing(err) };
    return loginAction({}, form(fields));
  };

  it("код домена → текст словаря auth.errors на ru и kk; код не из таблицы → «неверный логин или пароль»", async () => {
    expect(await login(new IdentityError("credentials"))).toEqual({ error: "Неверный логин или пароль" });
    expect(await login(new IdentityError("twoFactorExpired"))).toEqual({ error: "Время на ввод кода истекло. Войдите заново." });
    expect(await login(new IdentityError("tooMany"))).toEqual({ error: "Неверный логин или пароль" });
    request.headers.set("x-mb-locale", "kk");
    expect(await login(new IdentityError("credentials"))).toEqual({ error: "Логин немесе құпиясөз қате" });
    expect(await login(new IdentityError("credentials"), { email: "", password: "" })).toEqual({ error: "E-mail немесе телефон мен құпиясөзді енгізіңіз" });
    fake.rateLimiter = { hit: async () => false };
    expect(await login(new IdentityError("credentials"))).toEqual({ error: "Тым көп кіру әрекеті жасалды. 15 минут күтіңіз." });
  });

  it("не IdentityError пробрасывается", async () => {
    expect(await thrown(login(new OrderingError("notFound")))).toMatchObject({ code: "notFound" });
  });
});
