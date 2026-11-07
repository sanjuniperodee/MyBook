import { factoryCatalog, getAddons, getAiPacks, getDeliveryOptions, getFreeMediaMinutes, getMediaPacks, getPlans } from "@/config/site";
import { PageHeader } from "@/components/admin/PageHeader";
import { requireStaff } from "@/server/access";
import { ensureCatalog } from "@/server/catalog";
import { PricingForm } from "./PricingForm";

/** Разделы страницы: якоря слева (на телефоне — лентой над формой). id листов — в PricingForm. */
const SECTIONS = [
  ["pricing-plans", "Тарифы"],
  ["pricing-addons", "Допы"],
  ["pricing-delivery", "Доставка"],
  ["pricing-ai", "ИИ-дизайнер"],
  ["pricing-media", "Видео и аудио"],
] as const;

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
    mediaPacks: Object.fromEntries(factoryCatalog.mediaPacks.map((p) => [p.id, { price: p.price, minutes: p.minutes }])),
    mediaFreeMinutes: factoryCatalog.mediaFreeMinutes,
  };
  const changed = JSON.stringify({ plans: getPlans().map((p) => [p.price, p.extraCopyPrice, p.hidden]), a: getAddons().map((a) => [a.price, a.hidden]), d: getDeliveryOptions().map((d) => [d.price, !!d.quoted]), ai: getAiPacks().map((p) => [p.price, p.requests, !!p.hidden]), m: getMediaPacks().map((p) => [p.price, p.minutes, !!p.hidden]), mf: getFreeMediaMinutes() }) !==
    JSON.stringify({ plans: factoryCatalog.plans.map((p) => [p.price, p.extraCopyPrice, p.hidden]), a: factoryCatalog.addons.map((a) => [a.price, a.hidden]), d: factoryCatalog.delivery.map((d) => [d.price, !!d.quoted]), ai: factoryCatalog.aiPacks.map((p) => [p.price, p.requests, !!p.hidden]), m: factoryCatalog.mediaPacks.map((p) => [p.price, p.minutes, !!p.hidden]), mf: factoryCatalog.mediaFreeMinutes });
  return (
    <div className="flex flex-col gap-5 lg:gap-6">
      <PageHeader title="Цены и тарифы">
        Цены, доставка, допы и то, какие тарифы продаются. Изменения сразу попадают на витрину, в оформление заказа, сертификаты, ответы AI-помощника и бота, счёт бота и лимит скидки менеджеров. Суммы, которые вы сами
        написали в базе знаний AI, бот может назвать как есть — после смены цен проверьте их.
      </PageHeader>
      {/* «Настройки»: якоря разделов слева (липкие), справа — форма до 640 px, «Сохранить» — в липкой панели внизу формы. */}
      <div className="grid items-start gap-4 lg:grid-cols-[11rem_minmax(0,40rem)] lg:gap-8">
        <nav aria-label="Разделы цен" className="m-hscroll flex gap-1.5 lg:sticky lg:top-[calc(var(--topbar-h)+1.25rem)] lg:flex-col lg:gap-0.5">
          {SECTIONS.map(([id, label]) => (
            <a key={id} href={`#${id}`} className="chip max-lg:h-10 lg:h-8 lg:border-transparent lg:bg-transparent lg:px-2.5 lg:hover:bg-sunken">
              {label}
            </a>
          ))}
        </nav>
        <PricingForm
          plans={plans}
          addons={getAddons().map((a) => ({ id: a.id, price: a.price, visible: !a.hidden }))}
          delivery={getDeliveryOptions()
            .filter((d) => d.id !== "abroad")
            .map((d) => ({ id: d.id, price: d.quoted ? null : d.price, optional: !!factoryCatalog.delivery.find((f) => f.id === d.id)?.quoted }))}
          aiPacks={getAiPacks().map((p) => ({ id: p.id, price: p.price, requests: p.requests, visible: !p.hidden }))}
          mediaPacks={getMediaPacks().map((p) => ({ id: p.id, price: p.price, minutes: p.minutes, visible: !p.hidden }))}
          mediaFreeMinutes={getFreeMediaMinutes()}
          factory={factory}
          changed={changed}
        />
      </div>
    </div>
  );
}
