import { describe, expect, it } from "vitest";
import { getLocale } from "@/shared/infrastructure/http/locale";
import { StaffContext } from "@/modules/access/domain/StaffContext";
import { isPhoneEmail } from "@/modules/identity";
import { assertStaff, assertStaffShell, ForbiddenError, getStaff } from "@/server/access";
import { getCurrentUser, sessionToken } from "@/server/auth";
import { trustedClientIp } from "@/server/rateLimit";
import type { Permission } from "@/shared/domain/permissions";
import type { StaffMember } from "../src/core/auth/staff";
import { runInLegacyRequest } from "../src/legacy/legacy-request";
import { testUser } from "./app";

function makeStaff(id: string, perms: Permission[], gate: StaffMember["gate"] = null): StaffMember {
  const user = testUser(id, { role: "admin" });
  const set = new Set<Permission>(perms);
  return {
    user,
    roleName: "Менеджер",
    roleKey: "manager",
    scope: "all",
    permissions: set,
    isOwner: false,
    context: new StaffContext(user.id, "Менеджер", "manager", "all", set, false, { isPhoneEmail }),
    gate,
  };
}

describe("runInLegacyRequest — контекст переходного слоя без next/headers", () => {
  it("отдаёт токен, пользователя, сотрудника, IP и язык без обращения к next/headers", async () => {
    const staff = makeStaff("staff-1", ["deals.view", "deals.edit"]);
    const res = await runInLegacyRequest({ token: "tok-1", staff, ip: "198.51.100.7", locale: "kk" }, async () => ({
      token: await sessionToken(),
      userId: (await getCurrentUser())?.id ?? null,
      staffId: (await getStaff())?.user.id ?? null,
      asserted: (await assertStaff("deals.edit")).user.id,
      ip: await trustedClientIp(),
      locale: await getLocale(),
    }));
    expect(res).toEqual({
      token: "tok-1",
      userId: "staff-1",
      staffId: "staff-1",
      asserted: "staff-1",
      ip: "198.51.100.7",
      locale: "kk",
    });
  });

  it("учитывает gate 2fa и ip для getStaff / assertStaff / assertStaffShell", async () => {
    const need2fa = makeStaff("staff-2fa", ["deals.view"], "2fa");
    await runInLegacyRequest({ staff: need2fa, ip: "198.51.100.8" }, async () => {
      expect(await getStaff()).toBeNull();
      expect((await assertStaffShell()).user.id).toBe("staff-2fa");
      await expect(assertStaff("deals.view")).rejects.toSatisfy((e: unknown) => ForbiddenError.is(e));
    });

    const blockedIp = makeStaff("staff-ip", ["deals.view"], "ip");
    await runInLegacyRequest({ staff: blockedIp, ip: "198.51.100.9" }, async () => {
      expect(await getStaff()).toBeNull();
      await expect(assertStaffShell()).rejects.toSatisfy((e: unknown) => ForbiddenError.is(e));
    });
  });

  it("изолирует параллельные запросы друг от друга", async () => {
    const a = makeStaff("staff-a", ["deals.view"]);
    const b = makeStaff("staff-b", ["chats.view"]);
    const [ra, rb] = await Promise.all([
      runInLegacyRequest({ token: "tok-a", staff: a, ip: "10.0.0.1", locale: "ru" }, async () => {
        await new Promise((r) => setTimeout(r, 15));
        return { id: (await getStaff())?.user.id, ip: await trustedClientIp(), locale: await getLocale() };
      }),
      runInLegacyRequest({ token: "tok-b", staff: b, ip: "10.0.0.2", locale: "uz" }, async () => {
        await new Promise((r) => setTimeout(r, 5));
        return { id: (await getStaff())?.user.id, ip: await trustedClientIp(), locale: await getLocale() };
      }),
    ]);
    expect(ra).toEqual({ id: "staff-a", ip: "10.0.0.1", locale: "ru" });
    expect(rb).toEqual({ id: "staff-b", ip: "10.0.0.2", locale: "uz" });
  });
});
