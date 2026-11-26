import { beforeEach, describe, expect, it, vi } from "vitest";

// Тесты API v1 для «Почему так?» бота, коммерческого предложения (КП), ролей и 2FA.
vi.mock("@/i18n/server", async () => ({
  getMessages: async () => ({ api: (await import("@/i18n/messages/ru/api")).api }),
  getLocale: async () => "ru",
}));

const STAFF_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const OTHER_ID = "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff";
const CHAT_ID = "5e6dcde7-35d8-4016-b259-9b85acfd3b3e";
const MSG_ID = "0b6f3c1e-2a4d-4e5f-9b6c-1d2e3f4a5b6c";
const ROLE_OWNER_ID = "11111111-1111-4111-8111-111111111111";
const ROLE_SALES_ID = "22222222-2222-4222-8222-222222222222";
const TURN_1_ID = "33333333-3333-4333-8333-333333333333";
const TURN_2_ID = "44444444-4444-4444-8444-444444444444";

let currentPerms = new Set<string>(["chats.view", "chats.send", "promo.give", "team.manage", "settings.manage"]);
let currentCanSee = true;
let currentCanWork = true;
let currentIsOwner = true;
let currentTotpEnabledAt: Date | null = null;
let currentTotpBackup: string[] = [];

const makeStaff = () => ({
  user: {
    id: STAFF_ID,
    name: "Руководитель",
    email: "owner@mybooks.kz",
    crmRoleId: ROLE_OWNER_ID,
    totpEnabledAt: currentTotpEnabledAt,
    totpBackup: currentTotpBackup,
  },
  isOwner: currentIsOwner,
  permissions: currentPerms,
  context: {
    canSee: () => currentCanSee,
    canWork: () => currentCanWork,
    canAssignOthers: true,
  },
});

const apiStaffMock = vi.fn(async () => makeStaff());
vi.mock("@/server/api", async (orig) => ({
  ...(await orig<typeof import("@/server/api")>()),
  apiStaff: (...args: unknown[]) => {
    void args;
    return apiStaffMock();
  },
}));

vi.mock("@/server/access", async (orig) => ({
  ...(await orig<typeof import("@/server/access")>()),
  can: (s: ReturnType<typeof makeStaff>, ...perms: string[]) => perms.every((p) => s.permissions.has(p)),
  canWork: () => currentCanWork,
}));

const botTracesMock = vi.fn(async () => [
  {
    id: TURN_1_ID,
    at: new Date("2026-11-25T10:15:00.000Z"),
    messageId: null,
    trace: {
      v: 1 as const,
      purpose: "reply" as const,
      model: { action: "wait" as const, stage: "discovery" as const, handoff: "none" as const, lang: "ru" as const, summary: "Клиент печатает ещё" },
      result: { phase: "active" as const, outcome: null, handoff: null },
      fields: {},
      deadline: null,
      materials: null,
      notes: [{ code: "unanswered" as const }],
      lessons: [],
      knowledge: { all: false, titles: ["Доставка и сроки"] },
      tokens: { input: 1200, output: 85, calls: 1 },
    },
  },
  {
    id: TURN_2_ID,
    at: new Date("2026-11-25T10:10:00.000Z"),
    messageId: MSG_ID,
    trace: {
      v: 1 as const,
      purpose: "reply" as const,
      model: { action: "reply" as const, stage: "offer" as const, handoff: "none" as const, lang: "ru" as const, summary: "Назвал цену печатной книги" },
      result: { phase: "active" as const, outcome: null, handoff: null },
      fields: { recipient: "Маме" },
      deadline: null,
      materials: null,
      notes: [],
      lessons: [{ id: "l1", text: "Всегда уточнять дату праздника" }],
      knowledge: { all: false, titles: ["Тарифы"] },
      tokens: { input: 1400, output: 110, calls: 1 },
    },
  },
]);

const chatOffersMock = vi.fn(async (_clientId: string | null, canDiscount: boolean) => ({
  order: { number: 108 },
  book: { title: "Книга для мамы" },
  maxDiscount: canDiscount ? 15 : 0,
}));

const rolesWithMembersMock = vi.fn(async () => [
  { role: { id: ROLE_OWNER_ID, key: "owner", name: "Руководитель", scope: "all" as const, permissions: [] }, members: 1 },
  { role: { id: ROLE_SALES_ID, key: null, name: "Продавец", scope: "own" as const, permissions: ["deals.view", "chats.view", "chats.send"] }, members: 3 },
]);

const twoFactorStatusMock = vi.fn(async () => [
  { id: STAFF_ID, name: "Руководитель", email: "owner@mybooks.kz", totpEnabledAt: currentTotpEnabledAt, staffDisabled: false },
  { id: OTHER_ID, name: "Айгерим", email: "aigerim@mybooks.kz", totpEnabledAt: new Date("2026-11-20T00:00:00.000Z"), staffDisabled: false },
]);

const beginTwoFactorMock = vi.fn(async () => ({
  secret: "JBSWY3DPEHPK3PXP",
  otpauthUrl: "otpauth://totp/MyBooks:owner%40mybooks.kz?secret=JBSWY3DPEHPK3PXP&issuer=MyBooks&algorithm=SHA1&digits=6&period=30",
}));

vi.mock("@/server/container", () => ({
  container: () => ({
    messaging: {
      queries: {
        conversation: async (id: string) => ({ id, clientId: "client-1", assigneeId: STAFF_ID }),
      },
      botTraces: () => botTracesMock(),
    },
    marketing: {
      service: {
        chatOffers: (clientId: string | null, canDiscount: boolean) => chatOffersMock(clientId, canDiscount),
      },
    },
    access: {
      queries: {
        rolesWithMembers: () => rolesWithMembersMock(),
        twoFactorStatus: () => twoFactorStatusMock(),
      },
    },
    identity: {
      accounts: {
        beginTwoFactor: () => beginTwoFactorMock(),
      },
    },
  }),
}));

const settingsStore: Record<string, string> = {
  "security.require2fa": "",
  "security.ipAllowlist": "95.56.10.20",
};
vi.mock("@/modules/workspace", async (orig) => ({
  ...(await orig<object>()),
  getSetting: vi.fn(async (key: string) => settingsStore[key] ?? ""),
}));
vi.mock("@/server/rateLimit", () => ({ trustedClientIp: vi.fn(async () => "95.56.10.20") }));

const botTraceActionMock = vi.fn(async () => ({
  trace: {
    v: 1,
    purpose: "reply",
    model: { action: "reply", stage: "offer", handoff: "none", lang: "ru", summary: "Пояснил стоимость и сроки" },
    result: { phase: "active", outcome: null, handoff: null },
    fields: { recipient: "Папе" },
    deadline: null,
    materials: null,
    notes: [{ code: "greeting_removed" }],
    lessons: [{ id: "l1", text: "Короткие сообщения" }],
    knowledge: { all: false, titles: ["Цены и тарифы"] },
    tokens: { input: 900, output: 70, calls: 1 },
  },
}));
const sendOfferActionMock = vi.fn(async (id: string, req: Record<string, unknown>) => {
  void id;
  if (req.kind === "discount") return { ok: true, message: "Отправлено, промокод GIFT15" };
  return { ok: true, message: "Отправлено" };
});
vi.mock("@/server/crm-actions/chats", () => ({
  startBotAction: vi.fn(),
  stopBotAction: vi.fn(),
  botTraceAction: () => botTraceActionMock(),
  sendOfferAction: (id: string, req: Record<string, unknown>) => sendOfferActionMock(id, req),
}));

const saveRoleActionMock = vi.fn(async (_state: unknown, form: FormData) => {
  void form;
  return { ok: "Роль сохранена" };
});
const deleteRoleActionMock = vi.fn(async () => {});
vi.mock("@/server/crm-actions/team", () => ({
  createStaffAction: vi.fn(),
  resetStaffPasswordAction: vi.fn(),
  revokeStaffAction: vi.fn(),
  setStaffDisabledAction: vi.fn(),
  setStaffExtensionAction: vi.fn(),
  setStaffPhoneAction: vi.fn(),
  setStaffRoleAction: vi.fn(),
  saveRoleAction: (s: unknown, f: FormData) => saveRoleActionMock(s, f),
  deleteRoleAction: () => deleteRoleActionMock(),
}));

const confirmTwoFactorActionMock = vi.fn(async (code: string) =>
  code === "123456" ? { ok: true as const, codes: ["AAAA-1111", "BBBB-2222"] } : { ok: false as const, message: "Неверный код" },
);
const newBackupCodesActionMock = vi.fn(async (code: string) => {
  void code;
  return { ok: true as const, codes: ["CCCC-3333", "DDDD-4444"] };
});
const disableTwoFactorActionMock = vi.fn(async (code: string) =>
  code === "123456" ? { ok: true as const } : { ok: false as const, message: "Неверный код" },
);
const saveSecurityActionMock = vi.fn(async (_s: unknown, form: FormData) => {
  void form;
  return { ok: "Сохранено" };
});
const resetStaffTwoFactorActionMock = vi.fn(async () => ({ ok: true as const }));
vi.mock("@/server/crm-actions/security", () => ({
  confirmTwoFactorAction: (c: string) => confirmTwoFactorActionMock(c),
  newBackupCodesAction: (c: string) => newBackupCodesActionMock(c),
  disableTwoFactorAction: (c: string) => disableTwoFactorActionMock(c),
  saveSecurityAction: (s: unknown, f: FormData) => saveSecurityActionMock(s, f),
  resetStaffTwoFactorAction: () => resetStaffTwoFactorActionMock(),
}));

const { v1 } = await import("@mybook/contracts");
const { createApp } = await import("../apps/api/src/app");
const { createRouter } = await import("../apps/api/src/http/router");
const { handlers } = await import("../apps/api/src/routes");
const { HttpError } = await import("@/server/api");

const user = { id: STAFF_ID, name: "Руководитель", email: "owner@mybooks.kz", phone: null, locale: "ru", role: "admin" } as never;
const auth = (isStaff: boolean) => ({
  user: async () => user,
  staff: async () => {
    if (!isStaff) throw new HttpError(403, "forbidden");
    return user;
  },
});

const call = (app: ReturnType<typeof createApp>, method: string, path: string, body?: unknown) =>
  app(
    new Request(`http://127.0.0.1:3044${path}`, {
      method,
      headers: body ? { "content-type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    }),
  );

describe("CRM v1: «Почему так?» бота, КП, роли и 2FA", () => {
  const app = createApp(handlers, auth(true));

  beforeEach(() => {
    vi.clearAllMocks();
    currentPerms = new Set(["chats.view", "chats.send", "promo.give", "team.manage", "settings.manage"]);
    currentCanSee = true;
    currentCanWork = true;
    currentIsOwner = true;
    currentTotpEnabledAt = null;
    currentTotpBackup = [];
    settingsStore["security.require2fa"] = "";
    settingsStore["security.ipAllowlist"] = "95.56.10.20";
  });

  it("все новые маршруты зарегистрированы в роутере и требуют auth=staff", () => {
    const router = createRouter(v1);
    expect(router.match("GET", `/api/v1/crm/chats/${CHAT_ID}/bot/traces`)).toMatchObject({ name: "crmChatBotTraces" });
    expect(router.match("GET", `/api/v1/crm/chats/${CHAT_ID}/offers`)).toMatchObject({ name: "crmChatOffers" });
    expect(router.match("POST", `/api/v1/crm/chats/${CHAT_ID}/offers`)).toMatchObject({ name: "crmChatOfferSend" });
    expect(router.match("GET", "/api/v1/crm/roles")).toMatchObject({ name: "crmRoles" });
    expect(router.match("POST", "/api/v1/crm/roles")).toMatchObject({ name: "crmRoleSave" });
    expect(router.match("DELETE", `/api/v1/crm/roles/${ROLE_SALES_ID}`)).toMatchObject({ name: "crmRoleDelete" });
    expect(router.match("GET", "/api/v1/crm/security")).toMatchObject({ name: "crmSecurity" });
    expect(router.match("POST", "/api/v1/crm/security/2fa/start")).toMatchObject({ name: "crmSecurity2faStart" });
    expect(router.match("POST", "/api/v1/crm/security/2fa/confirm")).toMatchObject({ name: "crmSecurity2faConfirm" });
    expect(router.match("PATCH", "/api/v1/crm/security/rules")).toMatchObject({ name: "crmSecurityRules" });
  });

  it("«Почему так?» по сообщению и журнал ходов диалога (включая молчание бота)", async () => {
    const single = await call(app, "GET", `/api/v1/crm/chats/${CHAT_ID}/messages/${MSG_ID}/trace`);
    expect(single.status).toBe(200);
    const singleJson = await single.json();
    expect(singleJson.rows.some((r: { label: string }) => r.label === "Модель решила")).toBe(true);
    expect(singleJson.rows.some((r: { label: string; warn: boolean }) => r.label === "Что сделал код" && r.warn)).toBe(true);
    expect(singleJson.rows.some((r: { label: string }) => r.label === "База знаний")).toBe(true);

    const list = await call(app, "GET", `/api/v1/crm/chats/${CHAT_ID}/bot/traces`);
    expect(list.status).toBe(200);
    const listJson = await list.json();
    expect(listJson.items).toHaveLength(2);
    expect(listJson.items[0].silent).toBe(true);
    expect(listJson.items[0].messageId).toBeNull();
    expect(listJson.items[0].rows.some((r: { warn: boolean }) => r.warn)).toBe(true);
    expect(listJson.items[1].silent).toBe(false);
    expect(listJson.items[1].messageId).toBe(MSG_ID);

    currentCanSee = false;
    expect((await call(app, "GET", `/api/v1/crm/chats/${CHAT_ID}/bot/traces`)).status).toBe(404);
  });

  it("КП (предложения клиенту): варианты с сервера, право promo.give и отправка", async () => {
    const res = await call(app, "GET", `/api/v1/crm/chats/${CHAT_ID}/offers`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      order: { number: 108 },
      book: { title: "Книга для мамы" },
      maxDiscount: 15,
      percents: [5, 10, 15],
      hours: [24, 48, 72, 168],
      canSend: true,
    });
    expect(json.hourOptions[0]).toEqual({ hours: 24, label: "на сутки" });

    currentPerms.delete("promo.give");
    const noPromo = await (await call(app, "GET", `/api/v1/crm/chats/${CHAT_ID}/offers`)).json();
    expect(noPromo.maxDiscount).toBe(0);
    expect(noPromo.percents).toEqual([]);

    const badDiscount = await call(app, "POST", `/api/v1/crm/chats/${CHAT_ID}/offers`, { kind: "discount", percent: 10 });
    expect(badDiscount.status).toBe(400);

    const okDiscount = await call(app, "POST", `/api/v1/crm/chats/${CHAT_ID}/offers`, { kind: "discount", percent: 15, hours: 48 });
    expect(okDiscount.status).toBe(200);
    expect(await okDiscount.json()).toEqual({ ok: true, message: "Отправлено, промокод GIFT15" });
    expect(sendOfferActionMock).toHaveBeenCalledWith(CHAT_ID, { kind: "discount", percent: 15, hours: 48 });
  });

  it("роли: список с матрицей прав, сохранение и удаление", async () => {
    const res = await call(app, "GET", "/api/v1/crm/roles");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.roles).toHaveLength(2);
    expect(json.roles[0].locked).toBe(true);
    expect(json.roles[0].permissions.length).toBe(json.totalPermissions);
    expect(json.roles[1]).toMatchObject({ id: ROLE_SALES_ID, name: "Продавец", scope: "own", locked: false, system: false, members: 3 });
    expect(json.groups.length).toBeGreaterThan(5);

    const save = await call(app, "POST", "/api/v1/crm/roles", {
      id: ROLE_SALES_ID,
      name: "Старший продавец",
      scope: "all",
      permissions: ["deals.view", "chats.view", "promo.give"],
    });
    expect(save.status).toBe(200);
    const form = saveRoleActionMock.mock.calls[0][1] as FormData;
    expect(form.get("id")).toBe(ROLE_SALES_ID);
    expect(form.get("name")).toBe("Старший продавец");
    expect(form.get("scope")).toBe("all");
    expect(form.getAll("permissions")).toEqual(["deals.view", "chats.view", "promo.give"]);

    const del = await call(app, "DELETE", `/api/v1/crm/roles/${ROLE_SALES_ID}`);
    expect(del.status).toBe(200);
    expect(deleteRoleActionMock).toHaveBeenCalledOnce();
  });

  it("2FA и безопасность: статус, запуск с QR/otpauth, подтверждение, коды, отключение и правила команды", async () => {
    const sec = await call(app, "GET", "/api/v1/crm/security");
    expect(sec.status).toBe(200);
    const secJson = await sec.json();
    expect(secJson).toMatchObject({
      enabled: false,
      backupLeft: 0,
      canDisable: true,
      currentIp: "95.56.10.20",
      canManage: true,
      require2fa: false,
      ipAllowlist: "95.56.10.20",
    });
    expect(secJson.team).toHaveLength(2);
    expect(secJson.team[1].canReset).toBe(true);

    // Обычный сотрудник без прав настроек не видит IP allowlist и список команды.
    currentPerms = new Set(["chats.view"]);
    const limited = await (await call(app, "GET", "/api/v1/crm/security")).json();
    expect(limited.canManage).toBe(false);
    expect(limited.ipAllowlist).toBe("");
    expect(limited.team).toEqual([]);

    // Запуск 2FA: секрет, otpauth URI и QR PNG data URL.
    const start = await call(app, "POST", "/api/v1/crm/security/2fa/start");
    expect(start.status).toBe(200);
    const startJson = await start.json();
    expect(startJson.secret).toBe("JBSWY3DPEHPK3PXP");
    expect(startJson.otpauthUrl).toContain("otpauth://totp/");
    expect(startJson.qrDataUrl).toMatch(/^data:image\/png;base64,/);

    // Подтверждение 2FA: неверный код -> 400, верный -> резервные коды.
    expect((await call(app, "POST", "/api/v1/crm/security/2fa/confirm", { code: "000000" })).status).toBe(400);
    const confirmed = await call(app, "POST", "/api/v1/crm/security/2fa/confirm", { code: "123456" });
    expect(confirmed.status).toBe(200);
    expect(await confirmed.json()).toEqual({ codes: ["AAAA-1111", "BBBB-2222"] });

    // Новые резервные коды и отключение.
    const backup = await call(app, "POST", "/api/v1/crm/security/2fa/backup", { code: "123456" });
    expect(backup.status).toBe(200);
    expect(await backup.json()).toEqual({ codes: ["CCCC-3333", "DDDD-4444"] });

    const disabled = await call(app, "POST", "/api/v1/crm/security/2fa/disable", { code: "123456" });
    expect(disabled.status).toBe(200);
    expect(await disabled.json()).toEqual({ ok: true, message: "2FA отключена" });

    // Частичное обновление правил (только require2fa=true сохраняет текущий ipAllowlist).
    currentPerms = new Set(["settings.manage", "team.manage"]);
    const rules = await call(app, "PATCH", "/api/v1/crm/security/rules", { require2fa: true });
    expect(rules.status).toBe(200);
    const rulesForm = saveSecurityActionMock.mock.calls[0][1] as FormData;
    expect(rulesForm.get("require2fa")).toBe("on");
    expect(rulesForm.get("ipAllowlist")).toBe("95.56.10.20");

    // Сброс 2FA сотруднику.
    const reset = await call(app, "POST", `/api/v1/crm/security/staff/${OTHER_ID}/reset-2fa`);
    expect(reset.status).toBe(200);
    expect(resetStaffTwoFactorActionMock).toHaveBeenCalledOnce();
  });
});
