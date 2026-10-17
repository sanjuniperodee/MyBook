import { aiProviderIds, aiProviders, isAiProvider, providerSettingKeys, type AiProvider } from "@/modules/assistant";
import { fromEnv, getSetting, getSettings, maskSecret } from "@/modules/workspace";
import { AiForm } from "../ai/AiForm";
import { ProofreadForm } from "../ai/ProofreadForm";
import { SellerForm } from "../ai/SellerForm";
import { MediaForm } from "../ai/MediaForm";

export async function AiTab() {
  const [aiProvider, aiEnabled, aiKnowledge, pr, sellerSettings, media] = await Promise.all([
    getSetting("ai.provider"),
    getSetting("ai.enabled"),
    getSetting("ai.knowledge"),
    getSettings(["proofread.provider", "proofread.model", "proofread.enabled"]),
    getSettings(["seller.provider", "seller.model"]),
    getSettings(["media.provider", "media.model"]),
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
    </>
  );
}
