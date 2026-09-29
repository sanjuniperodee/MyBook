import Link from "next/link";
import {
  ArrowRight,
  BookHeart,
  Camera,
  Check,
  ChevronDown,
  Eye,
  Gift,
  PenLine,
  Printer,
  Save,
  Sparkles,
  Truck,
  Type,
  WandSparkles,
} from "lucide-react";
import { LandingHeader } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { Book3D } from "@/components/cover/Book3D";
import { GiftCardVisual } from "@/components/GiftCardVisual";
import { SampleBook } from "@/components/landing/SampleBook";
import { TrustList } from "@/components/TrustList";
import { CoverPreview } from "@/components/cover/CoverPreview";
import { coverTemplates } from "@/lib/book/covers";
import { countQuestions, themes } from "@/lib/content/themes";
import { getCurrentUser } from "@/lib/auth";
import { formatPrice, plans, productionDays, site } from "@/config/site";
import { pluralRu } from "@/lib/book/layout";

const sampleTitles: Record<string, { title: string; names: string; subtitle?: string }> = {
  blossom: { title: "Ты — моё всё", names: "Алия & Марғұлан" },
  linen: { title: "Наша история", names: "Дана & Тимур" },
  midnight: { title: "Папа, спасибо", names: "от Арнура" },
  sage: { title: "Мама, это для тебя", names: "Твоя Айгерим" },
  terracotta: { title: "Друзья навсегда", names: "Мадина & Жанель" },
  hearts: { title: "Пять лет любви", names: "Саша & Ника" },
  script: { title: "Моя любовь", names: "Ерлан & Асель" },
  ocean: { title: "Наше лето", names: "Ильяс & Камила" },
  terrazzo: { title: "Просто мы", names: "Аня & Макс" },
  noir: { title: "Навсегда", names: "Даурен & Сабина" },
  photo: { title: "Мы", names: "Айдос & Лаура" },
};

const faq = [
  {
    q: "Сколько времени нужно, чтобы написать книгу?",
    a: "Обычно от двух вечеров до пары недель. Все ответы сохраняются автоматически — можно писать с телефона в дороге и продолжать с компьютера дома. Отвечать на все вопросы не обязательно: в книгу попадут только заполненные.",
  },
  {
    q: "Что если я не умею красиво писать?",
    a: "Этого и не нужно. Пишите так, как рассказали бы подруге за чашкой чая. Для каждого вопроса есть подсказки, а заголовки глав и вёрстку мы берём на себя — текст в книге выглядит как в хорошем романе.",
  },
  {
    q: "Можно ли добавить свои вопросы или изменить формулировки?",
    a: "Да. Любой заголовок можно переписать, скрыть или добавить собственный вопрос в любую главу. Книга — ваша, мы лишь помогаем начать.",
  },
  {
    q: "Как выглядит книга и из чего она сделана?",
    a: "Твёрдый переплёт с шитым блоком, плотная бумага, полноцветная печать фотографий. Перед заказом вы видите точный PDF-макет каждой страницы — ровно так книга и будет напечатана.",
  },
  {
    q: "Сколько стоит доставка и как долго ждать?",
    a: `Производство занимает ${productionDays.standard} рабочих дней (${productionDays.premium} для тарифа «Премиум»). Доставляем курьером по Алматы и Астане и по всему Казахстану. Электронную версию можно скачать сразу после оплаты.`,
  },
  {
    q: "Мои тексты кто-то увидит?",
    a: "Нет. Ваша книга доступна только вам. Сотрудники производства получают готовые файлы для печати исключительно для выполнения заказа.",
  },
  {
    q: "Можно ли заказать несколько экземпляров?",
    a: "Конечно — например, для родителей с обеих сторон. Дополнительные экземпляры стоят дешевле первого.",
  },
];

const occasions = ["Годовщина", "День рождения", "14 февраля", "Свадьба", "Юбилей родителей", "8 марта", "Новый год", "Просто так"];

export default async function HomePage() {
  const user = await getCurrentUser();
  const cta = user ? "/books/new" : "/register";
  const loveCount = countQuestions(themes[0]);

  return (
    <>
      <LandingHeader loggedIn={!!user} />
      <main className="overflow-x-clip">
        {/* ─── HERO ─── */}
        <section className="relative pt-28 pb-16 sm:pt-36 sm:pb-24">
          <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_75%_30%,#f4e4df_0%,transparent_70%),radial-gradient(40%_40%_at_10%_80%,#efe7da_0%,transparent_70%)]" />
          <div className="container-x grid items-center gap-14 lg:grid-cols-[1.05fr_1fr]">
            <div className="animate-fade-up">
              <div className="inline-flex items-center gap-2 rounded-full border border-line bg-white/70 px-3.5 py-1.5 text-sm text-ink-soft shadow-soft">
                <Sparkles className="size-4 text-wine" /> Подарок, который невозможно купить в магазине
              </div>
              <h1 className="mt-6 font-serif text-[44px] leading-[1.02] font-medium tracking-tight sm:text-6xl lg:text-7xl">
                Книга о вашей любви, <em className="text-wine">написанная вами</em>
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-soft sm:text-xl">
                Отвечайте на тёплые вопросы, добавляйте фотографии и выбирайте обложку. Мы сверстаем всё как настоящее издание и напечатаем книгу в твёрдом переплёте.
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Link href={cta} className="btn btn-primary btn-lg">
                  Начать писать бесплатно <ArrowRight className="size-5" />
                </Link>
                <a href="#inside" className="btn btn-outline btn-lg">
                  Посмотреть пример
                </a>
              </div>
              <ul className="mt-9 grid max-w-lg grid-cols-1 gap-2.5 text-[15px] text-ink-soft sm:grid-cols-2">
                {["Писать можно бесплатно", "Точный макет перед печатью", "Автосохранение каждого слова", "Доставка по Казахстану"].map((t) => (
                  <li key={t} className="flex items-center gap-2">
                    <Check className="size-4 shrink-0 text-wine" /> {t}
                  </li>
                ))}
              </ul>
            </div>
            <div className="relative mx-auto h-[420px] w-full max-w-[520px] sm:h-[520px]">
              <div className="absolute top-6 left-[2%] w-[44%] animate-float [--r:-8deg] [animation-delay:-2s]">
                <Book3D template="midnight" title="Папа, спасибо" names="от Арнура" rotate={18} className="drop-shadow-xl" />
              </div>
              <div className="absolute top-0 right-[4%] w-[40%] animate-float [--r:7deg] [animation-delay:-4s]">
                <Book3D template="sage" title="Мама, это для тебя" names="Твоя Айгерим" rotate={-18} />
              </div>
              <div className="absolute bottom-0 left-1/2 w-[54%] -translate-x-1/2 animate-float">
                <Book3D template="blossom" title="Ты — моё всё" subtitle="Четыре года вместе" names="Алия & Марғұлан" rotate={-14} />
              </div>
            </div>
          </div>
        </section>

        {/* ─── OCCASIONS ─── */}
        <section className="border-y border-line/70 bg-white/60 py-5">
          <div className="no-scrollbar container-x flex gap-3 overflow-x-auto">
            <span className="shrink-0 py-1.5 text-sm text-muted">Идеально на:</span>
            {occasions.map((o) => (
              <span key={o} className="shrink-0 rounded-full border border-line bg-paper px-4 py-1.5 text-sm text-ink-soft">
                {o}
              </span>
            ))}
          </div>
        </section>

        {/* ─── HOW ─── */}
        <section id="how" className="scroll-mt-20 py-20 sm:py-28">
          <div className="container-x">
            <div className="max-w-2xl">
              <div className="eyebrow">Как это работает</div>
              <h2 className="mt-3 font-serif text-4xl font-medium tracking-tight sm:text-5xl">Четыре шага до книги, которую будут перечитывать годами</h2>
            </div>
            <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { icon: BookHeart, title: "Выберите, кому", text: "Любимому человеку, маме, папе или другу — для каждого свой набор вопросов и глав." },
                { icon: PenLine, title: "Отвечайте на вопросы", text: `До ${loveCount} продуманных вопросов с подсказками. Пишите сколько хотите — хоть по строчке в день.` },
                { icon: Camera, title: "Добавьте фото и обложку", text: "Загрузите фотографии, выберите макет страниц и одну из дизайнерских обложек." },
                { icon: Truck, title: "Получите книгу", text: "Проверьте готовый макет, оформите заказ — мы напечатаем и доставим книгу." },
              ].map((s, i) => (
                <div key={s.title} className="card relative p-7">
                  <div className="flex items-center justify-between">
                    <div className="flex size-12 items-center justify-center rounded-2xl bg-rose text-wine">
                      <s.icon className="size-6" />
                    </div>
                    <span className="font-serif text-5xl text-line">{i + 1}</span>
                  </div>
                  <h3 className="mt-6 text-lg font-semibold">{s.title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-muted">{s.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── INSIDE ─── */}
        <section id="inside" className="scroll-mt-20 bg-ink py-20 text-paper sm:py-28">
          <div className="container-x grid items-center gap-14 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <div className="eyebrow text-[#e3a6ae]">Пример книги</div>
              <h2 className="mt-3 font-serif text-4xl font-medium tracking-tight sm:text-5xl">Не альбом и не анкета — настоящая книга</h2>
              <p className="mt-5 text-lg leading-relaxed text-paper/70">
                Ваши ответы превращаются в главы с красивыми заголовками, эпиграфами и оглавлением. Профессиональная типографика, переносы и поля — как в изданиях, которые стоят на полке годами.
              </p>
              <ul className="mt-8 space-y-4">
                {[
                  "Титульный лист, посвящение и оглавление",
                  "Главы: знакомство, первое свидание, мечты, благодарность…",
                  "Фото прямо в тексте — в рамке, полароидом, на всю страницу",
                  "Письма от близких — отдельной главой",
                  "Три стиля вёрстки и два формата книги",
                ].map((t) => (
                  <li key={t} className="flex gap-3 text-paper/85">
                    <Check className="mt-0.5 size-5 shrink-0 text-[#e3a6ae]" /> {t}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <SampleBook />
              <p className="mt-3 text-center text-xs text-paper/40"><span className="hidden md:inline">Листайте стрелками или нажмите на страницу</span><span className="md:hidden">Листайте свайпом</span></p>
            </div>
          </div>
        </section>

        {/* ─── THEMES ─── */}
        <section className="py-20 sm:py-28">
          <div className="container-x">
            <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
              <div className="max-w-2xl">
                <div className="eyebrow">Кому подарить</div>
                <h2 className="mt-3 font-serif text-4xl font-medium tracking-tight sm:text-5xl">Для каждого — своя история</h2>
              </div>
              <p className="max-w-sm text-muted">Вопросы написаны отдельно для каждого случая и учитывают, кто пишет и кому — «ты увидел» или «ты увидела».</p>
            </div>
            <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {themes.map((t) => {
                const qn = countQuestions(t);
                return (
                  <Link key={t.id} href={user ? `/books/new?theme=${t.id}` : `/register?theme=${t.id}`} className="group card flex flex-col overflow-hidden transition hover:-translate-y-1 hover:shadow-lift">
                    <div className="flex justify-center bg-cream/60 px-10 pt-8 pb-0">
                      <div className="w-[62%] translate-y-4 transition duration-500 group-hover:translate-y-1">
                        <CoverPreview template={t.defaultCover} title={t.titleSuggestions[0]} names={sampleTitles[t.defaultCover]?.names} lite className="rounded-sm shadow-book" />
                      </div>
                    </div>
                    <div className="flex flex-1 flex-col p-6">
                      <h3 className="text-lg font-semibold">{t.name}</h3>
                      <p className="mt-2 flex-1 text-sm leading-relaxed text-muted">{t.description}</p>
                      <div className="mt-5 flex items-center justify-between text-sm">
                        <span className="text-muted">
                          {qn} {pluralRu(qn, "вопрос", "вопроса", "вопросов")} · {t.chapters.length} {pluralRu(t.chapters.length, "глава", "главы", "глав")}
                        </span>
                        <ArrowRight className="size-4 text-wine transition group-hover:translate-x-1" />
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>

        {/* ─── COVERS ─── */}
        <section id="covers" className="scroll-mt-20 bg-cream/60 py-20 sm:py-28">
          <div className="container-x">
            <div className="mx-auto max-w-2xl text-center">
              <div className="eyebrow">Обложки</div>
              <h2 className="mt-3 font-serif text-4xl font-medium tracking-tight sm:text-5xl">{coverTemplates.length} дизайнерских обложек — или ваше фото</h2>
              <p className="mt-4 text-muted">Название, имена и подзаголовок вы задаёте сами. Меняйте обложку сколько угодно — до самой печати.</p>
            </div>
            <div className="mt-14 grid grid-cols-2 gap-x-5 gap-y-10 sm:grid-cols-3 lg:grid-cols-5">
              {coverTemplates
                .filter((t) => !t.requiresPhoto)
                .map((t) => {
                  const s = sampleTitles[t.id];
                  return (
                    <div key={t.id} className="group">
                      <div className="transition duration-500 group-hover:-translate-y-2">
                        <CoverPreview template={t.id} title={s.title} names={s.names} className="rounded-[3px] shadow-book" />
                      </div>
                      <div className="mt-3 text-center text-sm text-muted">{t.name}</div>
                    </div>
                  );
                })}
            </div>
          </div>
        </section>

        {/* ─── FEATURES ─── */}
        <section className="py-20 sm:py-28">
          <div className="container-x">
            <div className="max-w-2xl">
              <div className="eyebrow">Почему {site.name}</div>
              <h2 className="mt-3 font-serif text-4xl font-medium tracking-tight sm:text-5xl">Сделано, чтобы вам было легко писать</h2>
            </div>
            <div className="mt-14 grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
              {[
                { icon: Save, title: "Автосохранение", text: "Каждое слово сохраняется само. Закрыли вкладку — продолжите с того же места на любом устройстве." },
                { icon: Eye, title: "Живой предпросмотр", text: "Во время письма справа видно, как ответ будет выглядеть на странице книги." },
                { icon: WandSparkles, title: "Умные формулировки", text: "Вопросы подстраиваются под род автора и адресата. Любой заголовок можно переписать." },
                { icon: Type, title: "Типографика издательского уровня", text: "Переносы, выключка, оглавление, эпиграфы — вёрстка как в хорошей книге." },
                { icon: Printer, title: "Точный макет перед печатью", text: "Перед заказом вы листаете PDF каждой страницы. Что видите — то и получите." },
                { icon: Gift, title: "Подарочное оформление", text: "Твёрдый переплёт, плотная бумага и подарочная коробка в тарифе «Премиум»." },
              ].map((f) => (
                <div key={f.title}>
                  <f.icon className="size-7 text-wine" strokeWidth={1.6} />
                  <h3 className="mt-4 text-lg font-semibold">{f.title}</h3>
                  <p className="mt-2 leading-relaxed text-muted">{f.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── TESTIMONIALS (показываются, только если заполнены в config/site.ts) ─── */}
        {site.testimonials.length ? (
          <section className="bg-rose/40 py-20 sm:py-28">
            <div className="container-x">
              <h2 className="text-center font-serif text-4xl font-medium tracking-tight sm:text-5xl">Что говорят наши клиенты</h2>
              <div className="mt-12 grid gap-5 md:grid-cols-3">
                {site.testimonials.map((t) => (
                  <figure key={t.name} className="card p-7">
                    <blockquote className="font-serif text-xl leading-snug">«{t.text}»</blockquote>
                    <figcaption className="mt-5 text-sm text-muted">
                      {t.name}
                      {t.occasion ? ` · ${t.occasion}` : ""}
                    </figcaption>
                  </figure>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {/* ─── PRICING ─── */}
        <section id="pricing" className="scroll-mt-20 bg-cream/60 py-20 sm:py-28">
          <div className="container-x">
            <div className="mx-auto max-w-2xl text-center">
              <div className="eyebrow">Цены</div>
              <h2 className="mt-3 font-serif text-4xl font-medium tracking-tight sm:text-5xl">Пишите бесплатно — платите, когда книга готова</h2>
              <p className="mt-4 text-muted">Никаких подписок. Оплата только при оформлении заказа.</p>
            </div>
            <div className="mt-14 grid gap-5 lg:grid-cols-3">
              {plans.map((p) => (
                <div key={p.id} className={`card relative flex flex-col p-8 ${p.badge ? "border-wine/40 ring-4 ring-wine/10" : ""}`}>
                  {p.badge ? <span className="absolute -top-3 left-8 rounded-full bg-wine px-3 py-1 text-xs font-medium text-white">{p.badge}</span> : null}
                  <h3 className="text-lg font-semibold">{p.name}</h3>
                  <div className="mt-4 font-serif text-5xl font-medium [font-variant-numeric:lining-nums]">{formatPrice(p.price)}</div>
                  {p.extraCopyPrice ? <div className="mt-1 text-sm text-muted">доп. экземпляр — {formatPrice(p.extraCopyPrice)}</div> : <div className="mt-1 text-sm text-muted">без доставки, сразу</div>}
                  <ul className="mt-7 flex-1 space-y-3">
                    {p.features.map((f) => (
                      <li key={f} className="flex gap-2.5 text-[15px] text-ink-soft">
                        <Check className="mt-0.5 size-4 shrink-0 text-wine" /> {f}
                      </li>
                    ))}
                  </ul>
                  <Link href={cta} className={`btn mt-8 ${p.badge ? "btn-primary" : "btn-outline"}`}>
                    Начать книгу
                  </Link>
                </div>
              ))}
            </div>
            <TrustList className="mx-auto mt-16 max-w-5xl" />
          </div>
        </section>

        {/* ─── GIFT CARD ─── */}
        <section className="py-20 sm:py-28">
          <div className="container-x grid items-center gap-12 lg:grid-cols-2">
            <div className="order-2 lg:order-1">
              <GiftCardVisual plan="hardcover" recipientName="Гульнара Сериковна" buyerName="Айгерим" message="Мама, напиши историю нашей семьи — я хочу, чтобы она осталась у внуков" className="rotate-[-2deg]" />
            </div>
            <div className="order-1 lg:order-2">
              <div className="eyebrow">Подарочный сертификат</div>
              <h2 className="mt-3 font-serif text-4xl font-medium tracking-tight sm:text-5xl">Хотите, чтобы книгу написали вам — или о себе?</h2>
              <p className="mt-5 text-lg leading-relaxed text-ink-soft">
                Подарите сертификат маме, папе или бабушке: их истории станут книгой, которая останется у детей и внуков. PDF с кодом — сразу после оплаты, или отправим письмом в нужный день.
              </p>
              <Link href="/gift" className="btn btn-primary btn-lg mt-8">
                <Gift className="size-5" /> Подарить сертификат
              </Link>
            </div>
          </div>
        </section>

        {/* ─── FAQ ─── */}
        <section id="faq" className="scroll-mt-20 py-20 sm:py-28">
          <div className="container-x grid gap-12 lg:grid-cols-[1fr_1.6fr]">
            <div>
              <div className="eyebrow">Вопросы и ответы</div>
              <h2 className="mt-3 font-serif text-4xl font-medium tracking-tight sm:text-5xl">Всё, что важно знать</h2>
              <p className="mt-4 text-muted">
                Не нашли ответ?{" "}
                <a href={site.contacts.whatsapp} className="text-wine underline underline-offset-4" target="_blank" rel="noopener noreferrer">
                  Напишите нам
                </a>{" "}
                — ответим в течение часа.
              </p>
            </div>
            <div className="divide-y divide-line border-y border-line">
              {faq.map((f) => (
                <details key={f.q} className="group py-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-lg font-medium [&::-webkit-details-marker]:hidden">
                    {f.q}
                    <ChevronDown className="size-5 shrink-0 text-muted transition group-open:rotate-180" />
                  </summary>
                  <p className="mt-3 pr-10 leading-relaxed text-muted">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ─── CTA ─── */}
        <section className="pb-20 sm:pb-28">
          <div className="container-x">
            <div className="relative overflow-hidden rounded-[32px] bg-wine px-6 py-16 text-center text-white sm:px-16 sm:py-20">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_60%_at_20%_0%,rgba(255,255,255,.18),transparent),radial-gradient(40%_60%_at_100%_100%,rgba(0,0,0,.25),transparent)]" />
              <h2 className="relative mx-auto max-w-3xl font-serif text-4xl leading-tight font-medium sm:text-6xl">Самые важные слова заслуживают переплёта</h2>
              <p className="relative mx-auto mt-5 max-w-xl text-lg text-white/80">Начните сегодня — первые страницы можно написать уже за вечер.</p>
              <Link href={cta} className="btn btn-lg relative mt-9 bg-white text-wine hover:bg-paper">
                Создать свою книгу <ArrowRight className="size-5" />
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
