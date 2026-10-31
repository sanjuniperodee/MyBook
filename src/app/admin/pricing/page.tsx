import { factoryCatalog, getAddons, getAiPacks, getDeliveryOptions, getPlans } from "@/config/site";
import { PageHeader } from "@/components/admin/PageHeader";
import { requireStaff } from "@/server/access";
import { ensureCatalog } from "@/server/catalog";
import { PricingForm } from "./PricingForm";

export const metadata = { title: "Цены и тарифы" };

export default async function PricingPage() {
  await requireStaff("settings.manage");
  await ensureCatalog();
  const plans = getPlans().map((p) => ({ id: p.id, printed: p.printed, price: p.price, extraCopyPrice: p.extraCopyPrice ?? 0, visible: !p.hidden }));
  const factory = {
    plans: Object.fromEntries(factoryCatalog.plans.map((p) => [p.id, { price: p.price, extraCopyPrice: p.extraCopyPrice ?? 0, visible: !p.hidden }])),
    addons: Object.fromEntries(factoryCatalog.addons.map((a) => [a.id, a.price])),
    delivery: Object.fromEntries(factoryCatalog.delivery.map((d) => [d.id, d.price])),
    aiPacks: Object.fromEntries(factoryCatalog.aiPacks.map((p) => [p.id, { price: p.price, requests: p.requests }])),
  };
  const changed = JSON.stringify({ plans: getPlans().map((p) => [p.price, p.extraCopyPrice, p.hidden]), a: getAddons().map((a) => [a.price, a.hidden]), d: getDeliveryOptions().map((d) => [d.price, !!d.quoted]), ai: getAiPacks().map((p) => [p.price, p.requests, !!p.hidden]) }) !==
    JSON.stringify({ plans: factoryCatalog.plans.map((p) => [p.price, p.extraCopyPrice, p.hidden]), a: factoryCatalog.addons.map((a) => [a.price, a.hidden]), d: factoryCatalog.delivery.map((d) => [d.price, !!d.quoted]), ai: factoryCatalog.aiPacks.map((p) => [p.price, p.requests, !!p.hidden]) });
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader title="Цены и тарифы">
        Цены, доставка, допы и то, какие тарифы продаются. Изменения сразу попадают на витрину, в оформление заказа, сертификаты, ответы AI-помощника и бота, счёт бота и лимит скидки менеджеров. Суммы, которые вы сами
        написали в базе знаний AI, бот может назвать как есть — после смены цен проверьте их.
      </PageHeader>
      <PricingForm
        plans={plans}
        addons={getAddons().map((a) => ({ id: a.id, price: a.price, visible: !a.hidden }))}
        delivery={getDeliveryOptions()
          .filter((d) => d.id !== "abroad")
          .map((d) => ({ id: d.id, price: d.quoted ? null : d.price, optional: !!factoryCatalog.delivery.find((f) => f.id === d.id)?.quoted }))}
        aiPacks={getAiPacks().map((p) => ({ id: p.id, price: p.price, requests: p.requests, visible: !p.hidden }))}
        factory={factory}
        changed={changed}
      />
    </div>
  );
}
