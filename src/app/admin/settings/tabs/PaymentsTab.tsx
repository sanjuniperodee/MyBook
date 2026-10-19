import { ensureToken, fromEnv, getSettings } from "@/modules/workspace";
import { container } from "@/server/container";
import { KaspiForm } from "../kaspi/KaspiForm";
import { TransferForm } from "../transfer/TransferForm";
import { hook } from "./shared";

export async function PaymentsTab() {
  const [kaspi, transfer, alertAfterMinutes] = await Promise.all([container().ordering.kaspiSetup.status(), getSettings(["pay.transferPhone", "pay.transferName"]), container().ordering.kaspiWatch.alertAfterMinutes()]);
  return (
    <>
      <KaspiForm {...kaspi} webhookUrl={hook("/api/payments/kaspi/webhook")} webhookSecret={fromEnv("kaspi.webhookSecret") ? null : await ensureToken("kaspi.webhookSecret")} alertAfterMinutes={alertAfterMinutes} />
      <TransferForm phone={transfer["pay.transferPhone"]} name={transfer["pay.transferName"]} fromEnv={fromEnv("pay.transferPhone")} />
    </>
  );
}
