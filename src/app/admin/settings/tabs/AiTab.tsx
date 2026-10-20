import { aiProviderIds, aiProviders, isAiProvider, providerSettingKeys, type AiProvider } from "@/modules/assistant";
import { fromEnv, getSetting, getSettings, maskSecret } from "@/modules/workspace";
import { AiForm } from "../ai/AiForm";
import { ProofreadForm } from "../ai/ProofreadForm";
import { SellerForm } from "../ai/SellerForm";
import { RoutingForm } from "../ai/RoutingForm";
import { isSellerTier, type RouteMode } from "@/modules/assistant/domain/routing";
import { MediaForm } from "../ai/MediaForm";

const ROUTE_KEYS = [
  "seller.route",
  "seller.route.default",
  "seller.route.sonnetEnabled",
  "seller.route.opusEnabled",
  "seller.route.effort.haiku",
  "seller.route.effort.sonnet",
  "seller.route.effort.opus",
  "seller.route.cacheTtl.haiku",
  "seller.route.cacheTtl.sonnet",
  "seller.route.cacheTtl.opus",
  "seller.route.rewrite",
  "seller.route.haiku",
  "seller.route.sonnet",
  "seller.route.opus",
  "seller.fallbacks",
  "seller.route.sonnetAt",
  "seller.route.opusAt",
  "seller.route.maxExtra",
  "seller.route.budget",
  "seller.route.dailyBudget",
  "seller.route.prices",
] as const;

export async function AiTab() {
  const [aiProvider, aiEnabled, aiKnowledge, pr, sellerSettings, media, route] = await Promise.all([
    getSetting("ai.provider"),
    getSetting("ai.enabled"),
    getSetting("ai.knowledge"),
    getSettings(["proofread.provider", "proofread.model", "proofread.enabled"]),
    getSettings(["seller.provider", "seller.model"]),
    getSettings(["media.provider", "media.model", "media.vision"]),
    getSettings([...ROUTE_KEYS]),
  ]);
  const aiSaved = Object.fromEntries(
    await Promise.all(
      aiProviderIds.map(async (p) => {
        const k = providerSettingKeys[p];
        const v = await getSettings([k.apiKey, k.model, k.baseUrl]);
        // Адрес Claude по умолчанию хранится в настройках — показываем его как плейсхолдер, а не как своё значение.
        const baseUrl = v[k.baseUrl] === aiProviders[p].defaultBaseUrl ? "" : v[k.baseUrl];
        return [p, { apiKey: maskSecret(v[k.apiKey]), apiKeyEnv: fromEnv(k.apiKey), model: v[k.model], baseUrl, baseUrlEnv: fromEnv(k.baseUrl) }] as const;
      }),
    ),
  ) as Record<AiProvider, { apiKey: string; apiKeyEnv: boolean; model: string; baseUrl: string; baseUrlEnv: boolean }>;
  const assistant: AiProvider = isAiProvider(aiProvider) ? aiProvider : "anthropic";
  return (
    <>
      <AiForm provider={assistant} providerFromEnv={fromEnv("ai.provider")} providers={aiSaved} enabled={aiEnabled !== "off"} knowledge={aiKnowledge} />
      <RoutingForm
        saved={{
          mode: (["on", "shadow", "off"].includes(route["seller.route"]) ? route["seller.route"] : "on") as RouteMode,
          defaultTier: isSellerTier(route["seller.route.default"]) ? route["seller.route.default"] : "haiku",
          tiers: { sonnet: route["seller.route.sonnetEnabled"] !== "off", opus: route["seller.route.opusEnabled"] !== "off" },
          effort: {
            haiku: route["seller.route.effort.haiku"] === "low" ? "low" : "medium",
            sonnet: route["seller.route.effort.sonnet"] === "low" ? "low" : "medium",
            opus: route["seller.route.effort.opus"] === "low" ? "low" : "medium",
          },
          cacheTtl: {
            haiku: route["seller.route.cacheTtl.haiku"] === "5m" ? "5m" : "1h",
            sonnet: route["seller.route.cacheTtl.sonnet"] === "5m" ? "5m" : "1h",
            opus: route["seller.route.cacheTtl.opus"] === "5m" ? "5m" : "1h",
          },
          rewrite: route["seller.route.rewrite"] === "up" ? "up" : "same",
          models: { haiku: route["seller.route.haiku"], sonnet: route["seller.route.sonnet"], opus: route["seller.route.opus"] },
          fallbacks: route["seller.fallbacks"],
          sonnetAt: route["seller.route.sonnetAt"],
          opusAt: route["seller.route.opusAt"],
          maxExtra: route["seller.route.maxExtra"],
          budget: route["seller.route.budget"],
          dailyBudget: route["seller.route.dailyBudget"],
          prices: route["seller.route.prices"],
          env: ROUTE_KEYS.filter((k) => fromEnv(k)),
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
        vision={media["media.vision"] !== "media"}
        providers={aiSaved}
      />
      <ProofreadForm
        provider={isAiProvider(pr["proofread.provider"]) ? pr["proofread.provider"] : ""}
        assistantProvider={assistant}
        model={pr["proofread.model"]}
        enabled={pr["proofread.enabled"] !== "off"}
        providers={aiSaved}
      />
    </>
  );
}
