import { isAiProvider, type AiProvider } from "@/modules/assistant/domain/providers";
import { AiForm } from "../ai/AiForm";
import { ProofreadForm } from "../ai/ProofreadForm";
import { SellerForm } from "../ai/SellerForm";
import { RoutingForm } from "../ai/RoutingForm";
import { isSellerTier, type RouteMode } from "@/modules/assistant/domain/routing";
import { MediaForm } from "../ai/MediaForm";
import { WriterForm } from "../ai/WriterForm";
import { AiMap } from "../ai/AiMap";
import { SettingsFrame } from "../frame";
import { tabAnchors } from "../tabs";
import { crmRead } from "@/server/v1-local-bridge-crm";

export async function AiTab() {
  const { aiProvider, aiEnabled, aiKnowledge, pr, sellerSettings, media, route, autofill, providerFromEnv, routeEnv, ...rest } = await crmRead("settings.ai", {});
  const aiSaved = rest.aiSaved as Record<AiProvider, { apiKey: string; apiKeyEnv: boolean; model: string; baseUrl: string; baseUrlEnv: boolean }>;
  const assistant: AiProvider = isAiProvider(aiProvider) ? aiProvider : "anthropic";
  return (
    <SettingsFrame anchors={tabAnchors("ai")}>
      <AiMap />
      <AiForm provider={assistant} providerFromEnv={providerFromEnv} providers={aiSaved} enabled={aiEnabled !== "off"} autofill={autofill !== "off"} knowledge={aiKnowledge} />
      <RoutingForm
        saved={{
          mode: (["on", "shadow", "off"].includes(route["seller.route"]) ? route["seller.route"] : "on") as RouteMode,
          defaultTier: isSellerTier(route["seller.route.default"]) ? route["seller.route.default"] : "haiku",
          models: { haiku: route["seller.route.haiku"], sonnet: route["seller.route.sonnet"], opus: route["seller.route.opus"] },
          fallbacks: route["seller.fallbacks"],
          sonnetAt: route["seller.route.sonnetAt"],
          opusAt: route["seller.route.opusAt"],
          maxExtra: route["seller.route.maxExtra"],
          budget: route["seller.route.budget"],
          dailyBudget: route["seller.route.dailyBudget"],
          prices: route["seller.route.prices"],
          env: routeEnv,
        }}
        providers={aiSaved}
        legacyProvider={isAiProvider(sellerSettings["seller.provider"]) ? sellerSettings["seller.provider"] : assistant}
      />
      <SellerForm provider={isAiProvider(sellerSettings["seller.provider"]) ? sellerSettings["seller.provider"] : ""} assistantProvider={assistant} model={sellerSettings["seller.model"]} providers={aiSaved} />
      <MediaForm
        provider={isAiProvider(media["media.provider"]) ? media["media.provider"] : ""}
        sellerProvider={isAiProvider(sellerSettings["seller.provider"]) ? sellerSettings["seller.provider"] : assistant}
        sellerModel={sellerSettings["seller.model"]}
        model={media["media.model"]}
        providers={aiSaved}
      />
      <ProofreadForm
        provider={isAiProvider(pr["proofread.provider"]) ? pr["proofread.provider"] : ""}
        assistantProvider={assistant}
        model={pr["proofread.model"]}
        enabled={pr["proofread.enabled"] !== "off"}
        providers={aiSaved}
      />
      <WriterForm
        provider={isAiProvider(pr["writer.provider"]) ? pr["writer.provider"] : ""}
        proofreadProvider={isAiProvider(pr["proofread.provider"]) ? pr["proofread.provider"] : assistant}
        model={pr["writer.model"]}
        // Пока флажок помощника не сохранён, он выключается вместе с корректором — как было раньше.
        enabled={(pr["writer.enabled"] || pr["proofread.enabled"]) !== "off"}
        providers={aiSaved}
      />
    </SettingsFrame>
  );
}
