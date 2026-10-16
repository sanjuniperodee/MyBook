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

// Характеристические тесты (фаза 3, S6): переводчики ошибок домена в server actions. E4 заменил их общим actionError(err);
// тексты остались прежними, кроме исправленного B11 (маркеры «B11»): сотрудник видит текст, а не машинный код.

const ID = "0d0d0d0d-0000-4000-8000-000000000001";
/** Единственный текст кода twoFactorCode: словарь auth.errors, он же — на входе по коду из приложения. */
const AUTH_2FA_CODE = "Неверный код. Проверьте время на телефоне и попробуйте ещё раз.";

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

describe("admin/actions.ts: ошибки заказов и промокодов", () => {
  const update = (err?: unknown) => {
    fake.ordering = { orders: { update: err ? failing(err) : async () => {} } };
    return updateOrderAction({}, form({ orderId: ID, status: "paid" }));
  };

  it("четыре кода — свои тексты, остальные — текст по коду из словаря; прочие ошибки пробрасываются", async () => {
    signIn(anna);
    expect(await update()).toEqual({ ok: "Сохранено" });
    expect(await update(new OrderingError("orderNotFound"))).toEqual({ error: "Заказ не найден" });
    expect(await update(new OrderingError("invalidTransition", "pending_payment → delivered"))).toEqual({ error: "Такой переход статуса невозможен" });
    expect(await update(new OrderingError("staffNotFound"))).toEqual({ error: "Ответственным может быть только сотрудник CRM" });
    expect(await update(new OrderingError("promoExists"))).toEqual({ error: "Такой промокод уже есть" });
    // B11: код без message раньше показывался сотруднику как есть («notPayable»), теперь — текст словаря
    expect(await update(new OrderingError("notPayable", "Заказ уже оплачен"))).toEqual({ error: "Этот заказ уже не ждёт оплаты — обновите страницу" });
    expect(await update(new OrderingError("notPayable"))).toEqual({ error: "Этот заказ уже не ждёт оплаты — обновите страницу" });
    expect(await update(new OrderingError("notFound"))).toEqual({ error: "Такого промокода нет" });
    expect(await thrown(update(new AccessError("forbidden", "нет")))).toMatchObject({ code: "forbidden" });
  });

  it("язык сайта в cookie (kk) на тексты CRM не влияет: в /admin proxy заголовок x-mb-locale не ставит, сотрудник читает по-русски", async () => {
    signIn(anna);
    request.cookies.set("mb_locale", "kk");
    expect(await update(new OrderingError("orderNotFound"))).toEqual({ error: "Заказ не найден" });
    expect(await update(new OrderingError("notFound"))).toEqual({ error: "Такого промокода нет" });
  });

  it("не сотрудник — ForbiddenError; B11: ошибка разбора формы — первое сообщение по-русски, а не английский текст zod", async () => {
    signIn(client);
    expect(await thrown(updateOrderAction({}, form({ orderId: ID, status: "paid" })))).toBeInstanceOf(ForbiddenError);
    signIn(anna);
    expect(await updateOrderAction({}, form({ orderId: "42", status: "paid" }))).toEqual({ error: "Заказ не найден" });
    // поля нет вовсе (форма без скрытого orderId или статуса) — тоже по-русски, а не «Invalid input: expected string…»
    expect(await updateOrderAction({}, form({ status: "paid" }))).toEqual({ error: "Заказ не найден" });
    expect(await updateOrderAction({}, form({ orderId: ID }))).toEqual({ error: "Выберите статус заказа" });
    expect(await updateOrderAction({}, form({}))).toEqual({ error: "Заказ не найден" });
    expect(await updateOrderAction({}, form({ orderId: ID, status: "возвращён" }))).toEqual({ error: "Выберите статус заказа" });
    expect(await updateOrderAction({}, form({ orderId: ID, status: "paid", note: "я".repeat(1001) }))).toEqual({ error: "Заметка — до 1000 символов" });
  });
});

describe("admin/team/actions.ts: run и действия без ответа в форме", () => {
  beforeEach(() => signIn(owner));
  const create = (add: () => Promise<string>, email = "new@b.kz") => {
    fake.access.team = { add };
    return createStaffAction({}, form({ email, roleId: ID }));
  };

  it("createStaffAction: AccessError — его message, IdentityError — текст по коду, прочее пробрасывается", async () => {
    expect(await create(async () => "Сотрудник добавлен")).toEqual({ ok: "Сотрудник добавлен" });
    expect(await create(failing(new AccessError("ownerOnly", "Назначить руководителя может только руководитель")))).toEqual({ error: "Назначить руководителя может только руководитель" });
    // B11: у IdentityError нет message — руководитель видел код («email»), теперь текст словаря
    expect(await create(failing(new IdentityError("email")))).toEqual({ error: "Проверьте адрес почты" });
    expect(await create(failing(new IdentityError("exists")))).toEqual({ error: "Этот e-mail уже зарегистрирован" });
    expect(await thrown(create(failing(new Error("db down"))))).toMatchObject({ message: "db down" });
    expect(await create(async () => "", "не почта")).toEqual({ error: "Проверьте адрес почты" });
  });

  it("язык сайта в cookie (kk) на тексты руководителю не влияет", async () => {
    request.cookies.set("mb_locale", "kk");
    expect(await create(failing(new IdentityError("email")))).toEqual({ error: "Проверьте адрес почты" });
  });

  it("B11: действия без ответа в форме пробрасывают AccessError как есть (раньше — простым Error без кода), ZodError — как есть", async () => {
    fake.access.team = { changeRole: failing(new AccessError("lastOwner", "Должен остаться хотя бы один руководитель")) };
    const err = await thrown(setStaffRoleAction(ID, ID));
    expect(AccessError.is(err)).toBe(true);
    expect(err).toMatchObject({ code: "lastOwner", message: "Должен остаться хотя бы один руководитель" });
    expect(await thrown(setStaffRoleAction("42", ID))).toMatchObject({ name: "ZodError" });
  });
});

describe("admin/security/actions.ts: fail", () => {
  const accounts = (methods: Record<string, () => Promise<unknown>>) => (fake.identity.accounts = methods);

  it("IdentityError — текст по коду, AccessError — message, прочие ошибки пробрасываются; B11: IdentityError любого кода ловится", async () => {
    signIn(anna);
    accounts({ regenerateBackupCodes: failing(new IdentityError("twoFactorCode")) });
    expect(await newBackupCodesAction("123456")).toEqual({ ok: false, message: AUTH_2FA_CODE });
    accounts({ regenerateBackupCodes: failing(new AccessError("forbidden", "Нельзя")) });
    expect(await newBackupCodesAction("123456")).toEqual({ ok: false, message: "Нельзя" });
    accounts({ regenerateBackupCodes: failing(new IdentityError("credentials")) });
    expect(await newBackupCodesAction("123456")).toEqual({ ok: false, message: "Неверный логин или пароль" });
    accounts({ regenerateBackupCodes: failing(new Error("db down")) });
    expect(await thrown(newBackupCodesAction("123456"))).toMatchObject({ message: "db down" });
    fake.rateLimiter = { hit: async () => false };
    expect(await newBackupCodesAction("123456")).toEqual({ ok: false, message: "Слишком много попыток — подождите 10 минут" });
  });

  it("язык сайта в cookie (kk) на тексты «Безопасности» не влияет: twoFactorCode — тот же русский текст", async () => {
    signIn(anna);
    request.cookies.set("mb_locale", "kk");
    accounts({ regenerateBackupCodes: failing(new IdentityError("twoFactorCode")) });
    expect(await newBackupCodesAction("123456")).toEqual({ ok: false, message: AUTH_2FA_CODE });
  });

  it("шаги включения 2FA пускают без 2FA при обязательной; B11: код twoFactorCode — тот же один текст, что везде", async () => {
    security.require2fa = true;
    signIn(anna);
    accounts({ beginTwoFactor: failing(new IdentityError("twoFactorAlreadyOn")), confirmTwoFactor: failing(new IdentityError("twoFactorCode")) });
    expect(await startTwoFactorAction()).toEqual({ ok: false, message: "2FA уже включена" });
    expect(await confirmTwoFactorAction("123456")).toEqual({ ok: false, message: AUTH_2FA_CODE });
    expect(await thrown(newBackupCodesAction("123456"))).toBeInstanceOf(ForbiddenError);
  });
});

describe("(auth)/actions.ts: ошибки входа на языке пользователя", () => {
  const login = (err: unknown, fields = { email: "a@b.kz", password: "secret123" }) => {
    fake.identity.auth = { login: failing(err) };
    return loginAction({}, form(fields));
  };

  it("код домена → текст словаря auth.errors на ru и kk; код не из таблицы → «неверный логин или пароль»", async () => {
    expect(await login(new IdentityError("credentials"))).toEqual({ error: "Неверный логин или пароль" });
    expect(await login(new IdentityError("twoFactorExpired"))).toEqual({ error: "Время на ввод кода истекло. Войдите заново." });
    expect(await login(new IdentityError("nope" as never))).toEqual({ error: "Неверный логин или пароль" });
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
