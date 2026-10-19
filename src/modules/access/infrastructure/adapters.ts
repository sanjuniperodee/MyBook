import "server-only";
import { randomBytes } from "node:crypto";
import type { SettingsStore } from "@/shared/application";
import type { PasswordGenerator, SecuritySettingsStore } from "../application/ports";

/** Настройки CRM, которые читает и пишет Access: правила безопасности. */
export type AccessSettingKey = "security.ipAllowlist" | "security.require2fa";

export const settingsSecurityStore = (settings: SettingsStore<AccessSettingKey>): SecuritySettingsStore => ({
  async load() {
    const s = await settings.getMany(["security.ipAllowlist", "security.require2fa"]);
    return { allowlist: s["security.ipAllowlist"], require2fa: s["security.require2fa"] === "on" };
  },
  async save(input, actorId) {
    await settings.save({ "security.ipAllowlist": input.allowlist, "security.require2fa": input.require2fa ? "on" : "off" }, actorId);
  },
});

export const randomPasswords: PasswordGenerator = { generate: () => randomBytes(9).toString("base64url") };
