import Link from "next/link";
import { Section } from "@/components/admin/Section";

/**
 * Справка наверху вкладки AI: какая настройка за что отвечает. AI на сайте несколько, и у каждого своя модель, свой флажок
 * и свои лимиты — здесь они перечислены с тем, где живут.
 */
const ROWS: { name: string; who: string; where: React.ReactNode }[] = [
  { name: "ИИ-дизайнер", who: "клиент оформляет страницы и обложку", where: <Link href="/admin/ai-designer" className="text-wine underline">страница «ИИ-дизайнер»: модели, осмотр, лимит, расходы</Link> },
  { name: "AI-помощник при письме", who: "клиент: «Оформить», «Улучшить», «Короче», «Длиннее»", where: "форма «AI-помощник при письме у клиента» ниже" },
  { name: "AI-корректор", who: "клиент: кнопка «Проверить грамотность»", where: "форма «AI-корректор у клиента» ниже" },
  { name: "AI-помощник менеджеров", who: "менеджер в CRM: сводка, подсказки, заполнение сделки", where: "форма «AI-помощник менеджеров (CRM)» ниже" },
  { name: "AI-продажник бота", who: "бот в WhatsApp", where: "формы «Маршрутизация модели продажника», «Прежняя модель» и «Голосовые и фото» ниже" },
];

export function AiMap() {
  return (
    <Section defaultOpen title="Что здесь настраивается">
      <p className="mb-3 text-sm text-muted">
        AI на сайте несколько — у каждого своя модель, свой флажок и свои лимиты. Ключ Claude (Anthropic) общий: он у ИИ-дизайнера и у продажника; его вводят в форме «AI-помощник менеджеров (CRM) и ключи провайдеров».
      </p>
      <ul className="divide-y divide-line text-sm">
        {ROWS.map((r) => (
          <li key={r.name} className="grid gap-1 py-2 sm:grid-cols-[13rem_1fr_1.2fr] sm:gap-4">
            <span className="font-medium">{r.name}</span>
            <span className="text-ink-soft">{r.who}</span>
            <span className="text-muted">{r.where}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}
