import { factoryCatalog, getAddons, getDeliveryOptions, getPlans } from "@/config/site";
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
  };
  const changed = JSON.stringify({ plans: getPlans().map((p) => [p.price, p.extraCopyPrice, p.hidden]), a: getAddons().map((a) => a.price), d: getDeliveryOptions().map((d) => [d.price, !!d.quoted]) }) !==
    JSON.stringify({ plans: factoryCatalog.plans.map((p) => [p.price, p.extraCopyPrice, p.hidden]), a: factoryCatalog.addons.map((a) => a.price), d: factoryCatalog.delivery.map((d) => [d.price, !!d.quoted]) });
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Цены и тарифы</h1>
        <p className="mt-1 text-sm text-muted">Цены, доставка, допы и то, какие тарифы продаются. Изменения сразу попадают на витрину, в оформление заказа, сертификаты и ответы AI-помощника.</p>
      </div>
      <PricingForm
        plans={plans}
        addons={getAddons().map((a) => ({ id: a.id, price: a.price }))}
        delivery={getDeliveryOptions()
          .filter((d) => d.id !== "abroad")
          .map((d) => ({ id: d.id, price: d.quoted ? null : d.price, optional: !!factoryCatalog.delivery.find((f) => f.id === d.id)?.quoted }))}
        factory={factory}
        changed={changed}
      />
    </div>
  );
}
