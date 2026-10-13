import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { kaspiStatusCode, OrderingError, parseKaspiPayment, type KaspiMethod, type KaspiPaymentView } from "../../domain";
import type { KaspiAuthGateway, KaspiConfigStore, KaspiGateway, KaspiSession } from "../../application/ports";

/** Таймауты к kaspi-pos: вход дольше (SMS), чтение — быстрее, чтобы страница оплаты не висела. */
const TIMEOUT_MS = { auth: 15_000, write: 10_000, read: 6_000 } as const;

const record = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

/**
 * HTTP-клиент kaspi-pos-automation (github.com/tapter-dev/kaspi-pos-automation, docs/API.md): счета, QR, вход кассира.
 * Сессия кассира хранится в настройках и передаётся заголовками X-Token-SN / X-Vtoken-Secret / X-Profile-Id.
 */
export class KaspiPosClient implements KaspiGateway, KaspiAuthGateway {
  constructor(
    private readonly store: KaspiConfigStore,
    private readonly fetchImpl: typeof fetch = (...args) => fetch(...args),
  ) {}

  async connected() {
    return !!(await this.store.config()).session;
  }

  async createInvoice(phone: string, amount: number, comment: string): Promise<KaspiPaymentView> {
    const body = await this.call("/api/invoice/create", { method: "POST", json: { phoneNumber: phone, amount, comment } }, "write");
    return this.created(body);
  }

  async createQr(amount: number): Promise<KaspiPaymentView> {
    const body = await this.call("/api/qr/create", { method: "POST", json: { amount } }, "write");
    return this.created(body);
  }

  async details(externalId: string, method: KaspiMethod) {
    const path = method === "qr" ? `/api/qr/status?qrOperationId=${encodeURIComponent(externalId)}` : `/api/invoice/details?operationId=${encodeURIComponent(externalId)}`;
    return parseKaspiPayment(await this.call(path, { method: "GET" }, "read"), externalId);
  }

  async cancel(externalId: string) {
    await this.call("/api/invoice/cancel", { method: "POST", json: { operationId: externalId } }, "write");
  }

  async start(phone: string) {
    const init = record(await this.call("/api/auth/init", { method: "POST", session: false }, "auth"));
    const processId = String(init?.processId ?? record(init?.data)?.processId ?? "");
    if (!processId) throw new OrderingError("kaspiUnavailable", "kaspi-pos: нет processId");
    await this.call("/api/auth/send-phone", { method: "POST", json: { phoneNumber: phone, processId }, session: false }, "auth");
    return { processId };
  }

  async verify(processId: string, otp: string): Promise<KaspiSession> {
    const res = record(await this.call("/api/auth/verify-otp", { method: "POST", json: { processId, otp }, session: false }, "auth"));
    const view = record(res?.view);
    // Kaspi просит пароль или звонок-подтверждение — вход кассира нужно завершить в приложении Kaspi Pay.
    if (view?.code === "KPEnterLoginPassword" || view?.code === "KPMobileCall") throw new OrderingError("kaspiUnavailable", `Kaspi требует подтверждения: ${String(view.code)}`);
    const data = record(res?.data) ?? res;
    const tokenSn = String(data?.tokenSN ?? "");
    const vtokenSecret = String(data?.vtokenSecret ?? "");
    if (!tokenSn || !vtokenSecret) throw new OrderingError("kaspiUnavailable", "Неверный код из SMS");
    return { tokenSn, vtokenSecret, profileId: Number(data?.profileId ?? 0), organizationId: Number(data?.organizationId ?? 0), orgName: String(data?.orgName ?? ""), phone: String(data?.phone ?? "") };
  }

  async sessionActive() {
    const res = record(await this.call("/api/session/check", { method: "GET" }, "read"));
    return res?.active === true;
  }

  async reachable() {
    try {
      return record(await this.call("/health", { method: "GET", session: false }, "read"))?.status === "ok";
    } catch {
      return false;
    }
  }

  // ─── внутреннее ──────────────────────────────────────────────────────────

  private created(body: unknown): KaspiPaymentView {
    const code = kaspiStatusCode(body);
    const view = parseKaspiPayment(body);
    if (code !== 0 || !view) throw new OrderingError("kaspiUnavailable", `kaspi-pos: StatusCode ${code}`);
    return view;
  }

  private async call(path: string, opts: { method: "GET" | "POST"; json?: unknown; session?: boolean }, kind: keyof typeof TIMEOUT_MS): Promise<unknown> {
    const { apiUrl, session } = await this.store.config();
    const headers: Record<string, string> = {};
    if (opts.session !== false) {
      if (!session) throw new OrderingError("kaspiNotConnected");
      headers["X-Token-SN"] = session.tokenSn;
      headers["X-Vtoken-Secret"] = session.vtokenSecret;
      if (session.profileId > 0) headers["X-Profile-Id"] = String(session.profileId);
    }
    if (opts.json !== undefined) headers["Content-Type"] = "application/json";
    let res: Response;
    try {
      res = await this.fetchImpl(`${apiUrl.replace(/\/+$/, "")}${path}`, { method: opts.method, headers, body: opts.json === undefined ? undefined : JSON.stringify(opts.json), signal: AbortSignal.timeout(TIMEOUT_MS[kind]) });
    } catch (err) {
      throw new OrderingError("kaspiUnavailable", `kaspi-pos недоступен: ${err instanceof Error ? err.message : String(err)}`);
    }
    const text = await res.text();
    // 401 — kaspi-pos не принял сессию: кассира нужно подключить заново.
    if (res.status === 401 && opts.session !== false) throw new OrderingError("kaspiNotConnected", "Сессия кассира Kaspi не принята");
    if (!res.ok) throw new OrderingError("kaspiUnavailable", `kaspi-pos ${res.status}: ${text.replace(/\s+/g, " ").slice(0, 200)}`);
    try {
      return JSON.parse(text);
    } catch {
      throw new OrderingError("kaspiUnavailable", `kaspi-pos: не JSON (${text.slice(0, 80)})`);
    }
  }
}

/** Подпись вебхука kaspi-pos: `X-Webhook-Signature: sha256=<hex HMAC-SHA256(тело, секрет)>`. */
export function verifyKaspiSignature(rawBody: string, signature: string | null, secret: string | null | undefined): boolean {
  if (!signature || !secret) return false;
  const expected = Buffer.from(`sha256=${createHmac("sha256", secret).update(rawBody, "utf8").digest("hex")}`);
  const got = Buffer.from(signature.trim());
  return expected.length === got.length && timingSafeEqual(expected, got);
}
