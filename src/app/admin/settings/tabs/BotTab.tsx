import { container } from "@/server/container";
import { getSetting, listFields } from "@/modules/workspace";
import { defaultBotConfig, defaultOptionLabels, parseBotConfig } from "@/modules/messaging/domain/botConfig";
import { BOT_VARS, catalogVars } from "@/modules/messaging/domain/botFaq";
import { skipReasonLabels } from "@/modules/messaging/domain/botEngine";
import { botSiteInfo } from "@/server/bot-site";
import { BotForm } from "../crm/BotForm";
import type { BotFormTab } from "../crm/botTabs";
import { BotStats } from "../crm/BotStats";

export async function BotTab({ section }: { section?: BotFormTab }) {
  const [botMode, botConfig, dealFields, botMetrics, rules, botCatalog, aiModel, sellerModel] = await Promise.all([
    getSetting("bot.mode"),
    getSetting("bot.config"),
    listFields("deal"),
    container().messaging.botMetrics(),
    container().automation.rules.list(),
    botSiteInfo.catalog(),
    container()
      .assistant.service.describe()
      .then(async (d) => ((await container().assistant.service.configured()) ? d.model || d.label : null))
      .catch(() => null),
    container()
      .assistant.seller.describe()
      .then(async (d) => ((await container().assistant.seller.configured()) ? d.model || d.label : null))
      .catch(() => null),
  ]);
  const botFields = dealFields.filter((f) => f.type !== "checkbox").map((f) => ({ key: f.key, label: f.label, type: f.type, options: f.options ?? [] }));
  const parsedBot = parseBotConfig(botConfig);
  const ruVars = catalogVars(botCatalog, "ru");
  const autoReplyRules = rules.filter((r) => r.active && r.trigger === "message.incoming" && (r.actions ?? []).some((a) => a.type === "send_message")).map((r) => r.name);
  return (
    <BotForm
      mode={botMode}
      config={parsedBot}
      fields={botFields}
      defaults={{ texts: defaultBotConfig.texts, faq: defaultBotConfig.faq, optionLabels: defaultOptionLabels }}
      vars={BOT_VARS.map((v) => ({ ...v, value: ruVars[v.key.slice(1, -1)] ?? "" })).filter((v) => v.key !== "{акция}" && v.key !== "{ссылка}")}
      autoReplyRules={autoReplyRules}
      aiModel={aiModel}
      seller={sellerModel}
      initialTab={section}
      stats={<BotStats m={botMetrics} questions={parsedBot.questions.flatMap((q) => botFields.filter((f) => f.key === q.field).map((f) => ({ key: f.key, label: f.label })))} skipLabels={skipReasonLabels} />}
    />
  );
}
