import "server-only";
import { randomBytes } from "node:crypto";
import { getSettings, saveSettings } from "@/lib/crm/settings";
import type { PasswordGenerator, SecuritySettingsStore } from "../application/ports";

export const settingsSecurityStore: SecuritySettingsStore = {
  async load() {
    const s = await getSettings(["security.ipAllowlist", "security.require2fa"]);
    return { allowlist: s["security.ipAllowlist"], require2fa: s["security.require2fa"] === "on" };
  },
  async save(input, actorId) {
    await saveSettings({ "security.ipAllowlist": input.allowlist, "security.require2fa": input.require2fa ? "on" : "off" }, actorId);
  },
};

export const randomPasswords: PasswordGenerator = { generate: () => randomBytes(9).toString("base64url") };
