import { generateKeyPairSync, verify } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/modules/workspace", () => ({ notify: async () => {}, iosDevices: { save: async () => {}, ofUser: async () => [], all: async () => [] } }));
vi.mock("@/shared/infrastructure/storage", () => ({ fileExists: async () => false, getFile: async () => Buffer.from(""), putFile: async () => {} }));

const { ascJwt, iosSignConfig, PROFILE_NAME, provisionDevices } = await import("@/server/ios-sign");

const cfg = { keyId: "K1", issuerId: "ISS", ascKey: "/k.p8", signKeyFile: "/d.key", signCertFile: "/d.pem", certId: "CERT1", bundleId: "kz.workdesk.mobile", zsign: "zsign" };

describe("автоподпись iPhone-версии на сервере", () => {
  it("настройки: без любого из ключей — выключено (работает сборка на Mac)", () => {
    expect(iosSignConfig({})).toBeNull();
    const env = { IOS_ASC_KEY_ID: "K1", IOS_ASC_ISSUER_ID: "ISS", IOS_ASC_KEY_FILE: "/k.p8", IOS_SIGN_KEY_FILE: "/d.key", IOS_SIGN_CERT_FILE: "/d.pem", IOS_SIGN_CERT_ID: "CERT1", IOS_BUNDLE_ID: "kz.workdesk.mobile", IOS_ZSIGN: "/bin/zsign" };
    expect(iosSignConfig(env)?.zsign).toBe("/bin/zsign");
    expect(iosSignConfig({ ...env, IOS_SIGN_CERT_ID: "" })).toBeNull();
  });

  it("JWT App Store Connect: ES256, kid, issuer, срок 15 минут", () => {
    const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const jwt = ascJwt(cfg, privateKey.export({ type: "pkcs8", format: "pem" }).toString(), 1_800_000_000);
    const [h, c, s] = jwt.split(".");
    expect(JSON.parse(Buffer.from(c, "base64url").toString())).toEqual({ iss: "ISS", iat: 1_800_000_000, exp: 1_800_000_900, aud: "appstoreconnect-v1" });
    expect(verify("sha256", Buffer.from(`${h}.${c}`), { key: publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(s, "base64url"))).toBe(true);
  });

  it("новый телефон регистрируется, старый профиль удаляется, новый — со всеми включёнными iPhone", async () => {
    const calls: string[] = [];
    let created: { relationships: { devices: { data: { id: string }[] }; certificates: { data: { id: string }[] } }; attributes: { name: string } } | null = null;
    const asc = async (method: string, path: string, body?: unknown) => {
      calls.push(`${method} ${path.split("?")[0]}`);
      if (method === "GET" && path.startsWith("/v1/devices"))
        return { data: [{ id: "D1", attributes: { udid: "OLD-UDID", status: "ENABLED" } }, { id: "D0", attributes: { udid: "GONE", status: "DISABLED" } }] };
      if (method === "POST" && path === "/v1/devices") return { data: { id: "D2", attributes: {} } };
      if (path.startsWith("/v1/bundleIds")) return { data: [{ id: "B1", attributes: { identifier: "kz.workdesk.mobile" } }] };
      if (method === "GET" && path.startsWith("/v1/profiles")) return { data: [{ id: "P-old", attributes: { name: PROFILE_NAME } }] };
      if (method === "POST" && path === "/v1/profiles") {
        created = (body as { data: typeof created }).data;
        return { data: { id: "P-new", attributes: { profileContent: Buffer.from("PROFILE").toString("base64") } } };
      }
      return { data: null };
    };
    const r = await provisionDevices(asc, cfg, [
      { udid: "old-udid", name: "WD-1 iPhone" },
      { udid: "NEW-UDID", name: "WD-2 iPhone15,2" },
    ]);
    expect(calls).toContain("DELETE /v1/profiles/P-old");
    expect(calls.filter((c) => c === "POST /v1/devices")).toHaveLength(1);
    expect(created!.relationships.devices.data.map((d) => d.id)).toEqual(["D1", "D2"]);
    expect(created!.relationships.certificates.data[0].id).toBe("CERT1");
    expect(r.profile.toString()).toBe("PROFILE");
    expect(r.udids).toEqual(["OLD-UDID", "NEW-UDID"]);
  });
});
