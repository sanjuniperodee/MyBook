import { ensureKaspiWebhookSecretAction } from "../kaspi/actions";
import { KaspiForm } from "../kaspi/KaspiForm";
import { TransferForm } from "../transfer/TransferForm";
import { SettingsFrame } from "../frame";
import { tabAnchors } from "../tabs";
import { hook } from "./shared";
import { crmRead } from "@/web/crm";

export async function PaymentsTab() {
  const { kaspi, transfer, alertAfterMinutes, secretFromEnv, transferFromEnv } = await crmRead("settings.payments", {});
  // Секрет вебхука заводится при первом открытии — действием (запись), не чтением.
  const webhookSecret = secretFromEnv ? null : await ensureKaspiWebhookSecretAction();
  return (
    <SettingsFrame anchors={tabAnchors("payments")}>
      <KaspiForm {...kaspi} webhookUrl={hook("/api/payments/kaspi/webhook")} webhookSecret={webhookSecret} alertAfterMinutes={alertAfterMinutes} />
      <TransferForm phone={transfer["pay.transferPhone"]} name={transfer["pay.transferName"]} fromEnv={transferFromEnv} />
    </SettingsFrame>
  );
}
