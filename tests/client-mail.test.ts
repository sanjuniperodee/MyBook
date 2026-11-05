import { describe, expect, it, vi } from "vitest";
import { mailPaymentToClient } from "@/server/client-mail";
import type { Container } from "@/server/container";

type Send = (to: string, subject: string, html: string) => Promise<void>;

// Письмо клиенту о платеже/возврате по сделке: адрес и язык — из Identity (ADR 0009 P2), ошибка почты не ломает приём.
function fake(user: { email: string; locale: "ru" | "kk" } | null, send = vi.fn<Send>(async () => {})) {
  const account = vi.fn(async () => user);
  return { c: { identity: { accounts: { account } }, mailer: { send } } as unknown as Container, send, account };
}

describe("mailPaymentToClient", () => {
  it("платёж: письмо на почту клиента, на его языке", async () => {
    const { c, send, account } = fake({ email: "client@example.kz", locale: "kk" });
    await mailPaymentToClient(c, { clientId: "0b9a7c1e-2f3d-4a5b-8c6d-7e8f9a0b1c2d", dealNumber: 12, kind: "payment", amount: 10000, left: 5000 });
    expect(account).toHaveBeenCalledWith("0b9a7c1e-2f3d-4a5b-8c6d-7e8f9a0b1c2d");
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toBe("client@example.kz");
  });

  it("возврат — отдельное письмо", async () => {
    const { c, send } = fake({ email: "client@example.kz", locale: "ru" });
    await mailPaymentToClient(c, { clientId: "0b9a7c1e-2f3d-4a5b-8c6d-7e8f9a0b1c2d", dealNumber: 12, kind: "refund", amount: 3000, left: 0 });
    expect(send).toHaveBeenCalledTimes(1);
    expect(String(send.mock.calls[0][1])).toMatch(/3\s?000/);
  });

  it("нет клиента или учётной записи — письма нет; ошибка почты не пробрасывается", async () => {
    const none = fake(null);
    await mailPaymentToClient(none.c, { clientId: null, dealNumber: 1, kind: "payment", amount: 1, left: 0 });
    await mailPaymentToClient(none.c, { clientId: "0b9a7c1e-2f3d-4a5b-8c6d-7e8f9a0b1c2d", dealNumber: 1, kind: "payment", amount: 1, left: 0 });
    expect(none.send).not.toHaveBeenCalled();
    const broken = fake({ email: "x@example.kz", locale: "ru" }, vi.fn<Send>(async () => Promise.reject(new Error("smtp down"))));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(mailPaymentToClient(broken.c, { clientId: "0b9a7c1e-2f3d-4a5b-8c6d-7e8f9a0b1c2d", dealNumber: 1, kind: "payment", amount: 1, left: 0 })).resolves.toBeUndefined();
    err.mockRestore();
  });
});
