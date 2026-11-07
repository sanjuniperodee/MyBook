import Link from "next/link";
import { Section } from "../ui";

/**
 * Справка наверху вкладки AI: какая настройка за что отвечает. AI на сайте несколько, и у каждого своя модель, свой флажок
 * и свои лимиты — здесь они перечислены с тем, где живут.
 */
const ROWS: { name: string; who: string; where: React.ReactNode }[] = [
  { name: "ИИ-дизайнер", who: "клиент оформляет страницы и обложку", where: <Link href="/admin/ai-designer" className="text-wine underline">страница «ИИ-дизайнер»: модели, осмотр, лимит, расходы</Link> },
  { name: "AI-помощник при письме", who: "клиент: «Оформить», «Улучшить», «Короче», «Длиннее»", where: <a href="#ai-writer" className="text-wine underline">лист «Помощник при письме» ниже</a> },
  { name: "AI-корректор", who: "клиент: кнопка «Проверить грамотность»", where: <a href="#ai-proofread" className="text-wine underline">лист «Корректор у клиента» ниже</a> },
  { name: "AI-помощник менеджеров", who: "менеджер в CRM: сводка, подсказки, заполнение сделки", where: <a href="#ai-assistant" className="text-wine underline">лист «Помощник менеджеров» ниже</a> },
  { name: "AI-продажник бота", who: "бот в WhatsApp", where: (
      <>
        листы <a href="#ai-routing" className="text-wine underline">«Маршрутизация»</a>, <a href="#ai-seller" className="text-wine underline">«Прежняя модель»</a> и <a href="#ai-media" className="text-wine underline">«Голосовые и фото»</a> ниже
      </>
    ) },
];

export function AiMap() {
  return (
    <Section id="ai-map" defaultOpen={false} title="Что здесь настраивается" description="У каждого AI своя модель, свой флажок и свои лимиты; ключ Claude общий">
      <p className="mb-3 max-w-[40rem] text-[13px] text-muted">
        Ключ Claude (Anthropic) общий: он у ИИ-дизайнера и у продажника; его вводят в листе «AI-помощник менеджеров (CRM) и ключи провайдеров».
      </p>
      <ul className="divide-y divide-line text-sm">
        {ROWS.map((r) => (
          <li key={r.name} className="grid gap-1 py-2.5 first:pt-0 sm:grid-cols-[13rem_1fr_1.2fr] sm:gap-4">
            <span className="font-medium">{r.name}</span>
            <span className="text-ink-soft">{r.who}</span>
            <span className="text-muted">{r.where}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}
