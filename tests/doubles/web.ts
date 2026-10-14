import type { User } from "@/server/auth";
import { Role, type RoleRepository } from "@/modules/access/domain";
import { StaffResolver } from "@/modules/access/application/services";

// ─── двойники веб-слоя: next/headers, next/navigation, next/cache, container() ─
// Подключаются в тесте так:
//   vi.mock("next/headers", async () => (await import("./doubles/web")).nextHeaders);

/** Текущий запрос глазами next/headers: тест задаёт заголовки и cookie перед вызовом. */
export const request = { headers: new Headers(), cookies: new Map<string, string>() };

export function resetRequest(headers: Record<string, string> = {}) {
  request.headers = new Headers(headers);
  request.cookies.clear();
}

export const nextHeaders = {
  headers: async () => request.headers,
  cookies: async () => ({
    get: (name: string) => (request.cookies.has(name) ? { name, value: request.cookies.get(name)! } : undefined),
    set: (name: string, value: string) => void request.cookies.set(name, value),
    delete: (name: string) => void request.cookies.delete(name),
  }),
};

/** redirect() и notFound() в Next прерывают рендер исключением; двойники бросают узнаваемые. */
export class Redirect extends Error {
  constructor(readonly url: string) {
    super(`redirect ${url}`);
  }
}

export class NotFound extends Error {}

export const nextNavigation = {
  redirect: (url: string): never => {
    throw new Redirect(url);
  },
  notFound: (): never => {
    throw new NotFound("notFound");
  },
};

export const nextCache = { revalidatePath: () => {} };

// ─── люди и роли ─────────────────────────────────────────────────────────────

/** Роль без «Видеть клиентов и их книги» (clients.view). */
const manager = Role.restore("r-manager", { name: "Менеджер", scope: "own", permissions: ["deals.view", "orders.edit"], key: "manager" });
/** Роли с одним правом из «Заказы и производство»: видеть заказы и скачивать файлы для типографии. */
const orderViewer = Role.restore("r-orders", { name: "Заказы", scope: "all", permissions: ["orders.view"], key: null });
const printer = Role.restore("r-print", { name: "Типография", scope: "all", permissions: ["orders.files"], key: null });
const allRoles = [manager, orderViewer, printer];

const roles: RoleRepository = {
  nextId: () => "r-new",
  findById: async (id) => allRoles.find((r) => r.id === id) ?? null,
  findByKey: async () => null,
  assignedCount: async () => 0,
  add: async () => {},
  save: async () => {},
  remove: async () => {},
};

/** Правила «Безопасности» CRM: белый список IP и обязательная 2FA. */
export const security = { allowlist: "", require2fa: false };

export const person = (id: string, over: Partial<User> = {}) =>
  ({ id, email: `${id}@b.kz`, name: id, role: "user", staffDisabled: false, crmRoleId: null, totpEnabledAt: null, totpSecret: null, lastSeenAt: new Date(), ...over }) as User;

export const client = person("u1");
/** Сотрудник без роли — руководитель со всеми правами. */
export const owner = person("boss", { role: "admin" });
/** Менеджер: сделки и заказы, клиентов и их книги по роли не видит. */
export const anna = person("anna", { role: "admin", crmRoleId: manager.id });
/** Видит заказы (orders.view), файлы для типографии — нет. */
export const olga = person("olga", { role: "admin", crmRoleId: orderViewer.id });
/** Скачивает файлы для типографии (orders.files), заказы в CRM не видит. */
export const pavel = person("pavel", { role: "admin", crmRoleId: printer.id });
export const withTwoFactor = { totpEnabledAt: new Date(), totpSecret: "secret" };

const sessions = new Map<string, User>();

/** Вход: cookie сессии, по которой container().identity находит пользователя. */
export function signIn(u: User) {
  sessions.set(u.id, u);
  request.cookies.set("mb_session", u.id);
}

// ─── container() ─────────────────────────────────────────────────────────────

/**
 * Подменный корень композиции: сессии и права — настоящий StaffResolver на ролях в памяти,
 * остальные модули тест дописывает сам (fake.authoring = …).
 */
export const fake: Record<string, Record<string, unknown>> = {};

export function resetContainer() {
  for (const k of Object.keys(fake)) delete fake[k];
  sessions.clear();
  security.allowlist = "";
  security.require2fa = false;
  Object.assign(fake, {
    identity: { tokens: { hash: (t: string) => t }, queries: { userBySession: async (hash: string) => sessions.get(hash) ?? null, touch: async () => {} } },
    access: { resolver: new StaffResolver(roles, { load: async () => security, save: async () => {} }), audit: { record: async () => {} } },
    rateLimiter: { hit: async () => true },
  });
}

export const containerModule = { container: () => fake };
