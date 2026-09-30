import { planName, deliveryName } from "@/i18n/labels";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/crm/rbac";
import { getOrderWithBook } from "@/lib/orders";
import { site } from "@/config/site";
import { formatDate } from "@/lib/utils";
import { PrintButton } from "./PrintButton";

export const metadata = { title: "Упаковочный лист", robots: { index: false } };

/** Упаковочный лист / накладная для курьера. Печатается на A4 (две одинаковые половины — одна в коробку, одна курьеру). */
export default async function PackingSlip({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff("orders.view");
  const { id } = await params;
  const order = await getOrderWithBook(id);
  if (!order) notFound();

  const half = (copy: string) => (
    <section className="flex h-[138mm] flex-col border-b border-dashed border-ink/30 p-[10mm] last:border-b-0">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs tracking-[0.2em] text-muted uppercase">{copy}</div>
          <div className="mt-1 font-serif text-3xl font-semibold">Заказ №{order.number}</div>
          <div className="text-sm text-muted">от {formatDate(order.createdAt)}{order.desiredDate ? ` · нужна к ${formatDate(order.desiredDate)}` : ""}</div>
        </div>
        <div className="text-right text-xs text-muted">
          <div className="font-serif text-lg text-ink">{site.name}</div>
          <div>{site.company.legalName}</div>
          <div>{site.contacts.phone}</div>
        </div>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-6">
        <div>
          <div className="text-xs text-muted uppercase">Получатель</div>
          <div className="mt-1 text-xl font-semibold">{order.contactName}</div>
          <div className="text-lg">{order.contactPhone}</div>
          <div className="mt-2 text-base leading-snug">{[order.postalCode, order.city, order.address].filter(Boolean).join(", ") || "Самовывоз"}</div>
          <div className="mt-1 text-sm text-muted">{deliveryName(order.deliveryMethod)}</div>
          {order.addons.includes("express") || order.plan === "premium" ? <div className="mt-3 mr-2 inline-block bg-ink px-2 py-1 text-sm font-bold text-white uppercase">Срочно — вне очереди</div> : null}
          {order.surprise ? <div className="mt-3 inline-block border-2 border-ink px-2 py-1 text-sm font-bold uppercase">Сюрприз! Не звонить получателю заранее</div> : null}
        </div>
        <div>
          <div className="text-xs text-muted uppercase">Состав</div>
          <ul className="mt-1 space-y-1.5 text-sm">
            <li className="flex gap-2"><span className="inline-block size-4 shrink-0 border border-ink" /> «{order.book.title}» — {planName(order.plan)}, {order.quantity} экз.</li>
            {order.plan === "premium" || order.addons.includes("giftwrap") ? <li className="flex gap-2"><span className="inline-block size-4 shrink-0 border border-ink" /> Подарочная {order.plan === "premium" ? "коробка" : "упаковка (крафт, лента)"}</li> : null}
            {order.giftNote ? <li className="flex gap-2"><span className="inline-block size-4 shrink-0 border border-ink" /> Открытка с текстом</li> : null}
            <li className="flex gap-2"><span className="inline-block size-4 shrink-0 border border-ink" /> Проверка качества печати</li>
          </ul>
          {order.giftNote ? <p className="mt-3 border-l-2 border-ink/40 pl-3 font-serif text-base italic">«{order.giftNote}»</p> : null}
        </div>
      </div>
      {order.customerComment ? <p className="mt-auto text-sm"><b>Комментарий:</b> {order.customerComment}</p> : null}
    </section>
  );

  return (
    <div className="min-h-dvh bg-[#e9e4dc] py-6 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[210mm] justify-end print:hidden">
        <PrintButton />
      </div>
      <div className="mx-auto w-[210mm] bg-white text-ink shadow-lift print:shadow-none">
        {half("В коробку")}
        {half("Курьеру")}
      </div>
      <style>{`@page { size: A4; margin: 0 } @media print { body { background: #fff } }`}</style>
    </div>
  );
}
