import type { Metadata } from "next";
import { Gift, PenLine, Sparkles } from "lucide-react";
import { LandingHeader } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { getCurrentUser } from "@/lib/auth";
import { Faq } from "@/components/Faq";
import { GiftForm } from "./GiftForm";

export const metadata: Metadata = {
  title: "Подарочный сертификат на книгу",
  description: "Подарите близкому возможность написать собственную книгу: о семье, любви, жизни. Сертификат в PDF или письмом в нужный день.",
  alternates: { canonical: "/gift" },
};

const steps = [
  { icon: Gift, title: "Вы дарите сертификат", text: "Красивый PDF с кодом — распечатайте, вложите в открытку или отправим письмом в нужный день." },
  { icon: PenLine, title: "Человек пишет свою книгу", text: "Отвечает на тёплые вопросы о жизни, семье и любви, добавляет фотографии, выбирает обложку." },
  { icon: Sparkles, title: "Мы печатаем издание", text: "Сверстаем как настоящую книгу и привезём в твёрдом переплёте. Сертификат оплачивает книгу целиком." },
];

const faq = [
  ["Кому подходит такой подарок?", "Родителям и бабушкам с дедушками — чтобы их истории остались у детей и внуков. Любимому человеку — чтобы он написал книгу о вас двоих. Другу — на юбилей."],
  ["Сколько действует сертификат?", "Год с момента оплаты. Писать можно в своём темпе — всё сохраняется автоматически."],
  ["Если получатель выберет другой вариант книги?", "Сумма сертификата засчитывается в заказ: можно доплатить за «Премиум» или дополнительные экземпляры."],
  ["Когда придёт сертификат?", "Сразу после оплаты — на ваш e-mail. Если выбрали отправку получателю, письмо уйдёт в указанный день."],
];

export default async function GiftPage() {
  const user = await getCurrentUser();
  return (
    <>
      <LandingHeader loggedIn={!!user} />
      <main className="pt-28 pb-20 sm:pt-36">
        <div className="container-x">
          <div className="max-w-2xl">
            <div className="eyebrow">Подарочный сертификат</div>
            <h1 className="mt-3 font-serif text-[40px] leading-[1.05] font-medium tracking-tight sm:text-6xl">
              Подарите возможность <em className="text-wine">написать свою книгу</em>
            </h1>
            <p className="mt-5 text-lg leading-relaxed text-ink-soft">
              Для мамы, папы, бабушки или любимого человека: истории, которые иначе остались бы только в памяти, станут настоящей книгой.
            </p>
          </div>

          <div className="mt-12">
            <GiftForm defaults={{ name: user?.name ?? "", email: user?.email ?? "" }} />
          </div>

          <section className="mt-24 grid gap-5 md:grid-cols-3">
            {steps.map((s, i) => (
              <div key={s.title} className="card p-6">
                <div className="flex items-center justify-between">
                  <span className="flex size-11 items-center justify-center rounded-2xl bg-rose text-wine">
                    <s.icon className="size-5" />
                  </span>
                  <span className="font-serif text-4xl text-line">{i + 1}</span>
                </div>
                <div className="mt-5 text-lg font-semibold">{s.title}</div>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">{s.text}</p>
              </div>
            ))}
          </section>

          <section className="mt-20 grid gap-10 lg:grid-cols-[1fr_1.4fr]">
            <h2 className="font-serif text-4xl font-medium">Частые вопросы о сертификате</h2>
            <Faq items={faq as [string, string][]} size="md" />
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}
