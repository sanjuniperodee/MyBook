export const meta = {
  name: 'mybook-book-modes',
  description: 'Режимы книги «Автобиография» и «Вручную»: критика спецификации, основа и банк вопросов, проверка, пять зон интерфейса',
  phases: [
    { title: 'Critique', detail: 'состязательная проверка docs/features/book-modes.md по коду' },
    { title: 'Foundation', detail: 'данные, домен, API, сборка книги; банк автобиографии ru → kk → вычитка' },
    { title: 'Combine', detail: 'слияние основы и банка, проверка основы по спецификации' },
    { title: 'Zones', detail: 'мастер и экраны книги, редактор, печать, CRM и письма, сайт' },
  ],
}

const BASE = '883e522'
const MAIN_WT = '/Users/sanjuniperodee/MyBook/.claude/worktrees/funny-tesla-gsqj79'
const MAP = '/tmp/modesmap/content.md, /tmp/modesmap/domain.md, /tmp/modesmap/editor.md, /tmp/modesmap/print.md, /tmp/modesmap/site.md'

const RULES = `Проект MyBook — Next.js с изменёнными API (AGENTS.md: при работе со страницами, роутами и server actions читай node_modules/next/dist/docs). Спецификация: docs/features/book-modes.md (решения владельца). Карта кода, собранная заранее (пути и строки): ${MAP}.
Правила (их проверяют линтер и тесты): модули src/modules/* не импортируют друг друга, связи — портами в src/server/container.ts; тексты для клиента — только в словарях src/i18n/messages/{ru,kk}/* (tests/i18n.test.ts ловит кириллицу вне словарей; CRM-строки и строки для команды — по исключениям этого теста), ключи ru и kk совпадают; казахский — грамотный и естественный; вход действий и роутов — zod; права — как в соседнем коде; тяжёлые модули (themes.ts, банки вопросов) не попадают в клиентский бандл (tests/client-weight.test.ts); вёрстка — в стиле существующих экранов, мобильная версия обязательна. Комментарии и коммиты — по-русски в стиле репозитория, в конце коммита: Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>. Не пушь, не деплой, на прод не ходи.
Подготовка worktree: убедись, что pwd ≠ ${MAIN_WT} (там ничего не редактируй); нет node_modules — ln -s ${MAIN_WT}/node_modules node_modules; база для интеграционных тестов: export DATABASE_URL=$(grep -o 'DATABASE_URL=[^ ]*' ${MAIN_WT}/.env | cut -d= -f2-) (локальный Postgres; если твоя ветка добавляет миграцию — примени её: npm run -s db:migrate; миграции применяются к общей локальной базе, новые таблицы/колонки другим не мешают).
Перед коммитом: npx tsc --noEmit -p . ; npx eslint . ; npx vitest run — зелёные; интеграционные своей зоны: INTEGRATION=1 npx vitest run tests/<файл>.`

const RESULT = {
  type: 'object',
  properties: {
    branch: { type: 'string' },
    commit: { type: 'string', description: 'полный sha последнего коммита' },
    summary: { type: 'string' },
    files: { type: 'array', items: { type: 'string' } },
    checks: { type: 'string' },
    contracts: { type: 'string', description: 'интерфейсы, на которые опираются следующие исполнители: функции, типы, маршруты, ключи словарей' },
    deviations: { type: 'string' },
    followUps: { type: 'array', items: { type: 'string' } },
  },
  required: ['branch', 'commit', 'summary', 'files', 'checks', 'contracts', 'deviations', 'followUps'],
}

const prep = (base, branch) => `Перед работой: git merge-base --is-ancestor ${base} HEAD && [ "$(git rev-parse HEAD)" = "$(git rev-parse ${base})" ] || git reset --hard ${base}; git checkout -b ${branch}. В конце: git add -A && git commit, затем git branch -f done/${branch.replace(/\//g, '-')} HEAD.`

// ── 0. Критика спецификации ─────────────────────────────────────────────
phase('Critique')
const critique = await agent(`${RULES}

Задача: СОСТЯЗАТЕЛЬНАЯ проверка спецификации docs/features/book-modes.md (в ${MAIN_WT}, только чтение). Найди дыры: противоречия с кодом (сверяйся с картой и с самим кодом), пропущенные места, где режим меняет поведение, гонки и порядок в редакторе, перенумерация, удаление с фото, смена языка у книг autobiography/blank, старые книги и обратная совместимость, CRM и письма, печать (PDF/HTML/3D должны совпадать), мобильный редактор, права, лимиты, i18n, тесты. Для каждой дыры — конкретная поправка (что именно сделать, где). Не переписывай спецификацию целиком и не спорь с решениями владельца (режимы, названия, «вручную = книга с нуля»), улучшай реализацию.`, {
  label: 'Критика спецификации', phase: 'Critique',
  schema: { type: 'object', properties: { amendments: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, problem: { type: 'string' }, fix: { type: 'string' }, area: { type: 'string', description: 'foundation | wizard | editor | print | crm | site | content' } }, required: ['title', 'problem', 'fix', 'area'] } } }, required: ['amendments'] },
})
const amendments = critique?.amendments ?? []
log(`Поправок к спецификации: ${amendments.length}`)
const amendFor = (areas) => JSON.stringify(amendments.filter((a) => areas.includes(a.area)))

// ── 1. Основа и банк вопросов параллельно ───────────────────────────────
phase('Foundation')
const foundationP = agent(`${RULES}
${prep(BASE, 'modes/foundation')}

Зона: ОСНОВА режимов (без интерфейса — им займутся следующие исполнители по твоим контрактам). Сделай по спецификации §1, §2, §3.1, §3.2 (только ядро) и поправкам критика (применяй те, что закрывают реальные дыры; отклонённые — объясни в deviations): ${amendFor(['foundation', 'print', 'editor', 'crm'])}
Состав:
1. src/lib/content/kinds.ts (BookKind, bookKind, recipientPolicy, hasQuestionBank, hasOutline, progressOf с порогами из §3.1, лимиты §1.9) — без импорта банков. Тесты.
2. Темы: ThemeId + autobiography, blank; ThemeDef.kind/recipient, необязательные recipientLabel/Placeholder; base и тексты ru/kk для обеих тем (название, short, описание, titleSuggestions одинаковой длины); giftThemes/темы с банком для маркетинга; content.test: blank исключён из проверок банка, у автобиографии нет [..|..]. Банк автобиографии пишет ПАРАЛЛЕЛЬНЫЙ исполнитель в src/lib/content/autobiography.ts и src/lib/content/kk/autobiography.ts (export const autobiographyChapters: ChapterDef[]) — создай эти два файла ЗАГЛУШКАМИ с ключами глав из §1.3 (по одному вопросу в главе, пометка «// ВРЕМЕННО: банк придёт из соседней ветки»), импортируй их; тест «> 40 вопросов» для autobiography пометь временно пропущенным только если иначе не собрать — укажи это в deviations.
3. Схема и миграция: books.recorded_by, таблица book_chapters (§1.5) → npm run db:generate (drizzle/0035_*), применить к локальной базе; relations; tests/schema.test.
4. Домен authoring: Book.start по видам (получатель по recipientPolicy, recordedBy, у blank — первая глава и пустой раздел §1.7), BookSettings + recordedBy, BookRef.theme, unknownTheme в BooksService.start, ThemeCatalog без молчаливого love для новых тем; BookOutlineService (§2) с перенумерацией (§1.6) и лимитами; запрет оглавления вне blank (outlineNotAllowed); Question: правка title/prompt у custom, корзина слов для book_progressed (§3.1); коды ошибок + тексты в i18n api; репозитории и двойники tests/doubles/authoring.ts.
5. Маршруты §2 (+ проверки принадлежности, как photos/order).
6. Сборка книги: bookTexts/assembleBookContent берут главы blank из book_chapters (порядок, названия, эпиграфы), applyGender не трогает custom и названия своих глав (§1.8), printableText на названиях, defaultTitle никогда не пустой; BookBundle/queries.bundle/stats/preview/spreadSample получают главы; coverNames(book) (§3.2) и замена всех вызовов coverNamesLine; readiness по progressOf; userBooks — слова и число разделов; editor-data/editor-model: EditorChapter[], EditorBook.kind, sectionLabel, группировка по списку глав (включая пустые), без импорта тем в клиент. LAYOUT_VERSION + 1.
7. Тесты по §4 для всего этого (юнит + интеграционные на PostgreSQL: перенумерация, удаление главы с фото, порядок PDF = порядок редактора).
В contracts перечисли точно: экспорт kinds.ts, новые методы сервисов и их сигнатуры, маршруты и тела запросов, поля EditorBook/EditorChapter/EditorQuestion, поля BookContent, ключи словарей, которые завёл, coverNames.`, { label: 'Основа режимов', phase: 'Foundation', isolation: 'worktree', schema: RESULT })

const contentP = (async () => {
  const ru = await agent(`${RULES}
${prep(BASE, 'modes/bank-ru')}

Зона: БАНК ВОПРОСОВ АВТОБИОГРАФИИ, русский. Файл src/lib/content/autobiography.ts: export const autobiographyChapters: ChapterDef[] (типы — src/lib/content/types.ts: QuestionTuple = [вопрос рассказчику, заголовок в книге, подсказка?]; ChapterDef {key, title, epigraph?, questions}). Посмотри, как написаны parent.ts, love.ts, friend.ts — тон, длина, подсказки. Требования — спецификация §1.3 и поправки: ${amendFor(['content'])}
- Ключи глав строго: intro, roots, childhood, school, youth, work, love, children, home, times, trials, joys, wisdom, letter. Названия глав — тёплые, короткие (например «Мои корни», «Время, в котором я {жил|жила}»).
- Не меньше 60 вопросов (по 4–7 в главе). Вопрос — к рассказчику на «вы», конкретный, вызывающий историю, а не «да/нет» («Опишите дом, где прошло ваше детство: запахи, звуки, вид из окна»). Заголовок — короткий, от первого лица, как подзаголовок книги. Род рассказчика — только {м|ж}, без [..|..]. Супруг — нейтрально.
- Подсказки (третий элемент) там, где нужно помочь вспомнить; у первого вопроса — про запись со слов близкого («Если вы записываете за мамой или дедушкой — пишите его словами, от первого лица»).
- Эпиграфы — у части глав; только народные пословицы (в т.ч. казахские в переводе) или собственные строки, без цитат современных авторов (авторское право).
- Контекст Казахстана: шежіре и семь поколений, аул и город, той, дастархан, Наурыз, советское время, 90-е, независимость, переезды; без политики и оценок.
Проверь файл тестом формата (applyGender раскрывает все {..|..}, нет [..|..]) — можно временным тестом. Закоммить только этот файл (и временный тест удали).`, { label: 'Банк автобиографии: ru', phase: 'Foundation', isolation: 'worktree', schema: RESULT })
  if (!ru) return null
  const kk = await agent(`${RULES}
${prep(ru.commit, 'modes/bank-kk')}

Зона: БАНК АВТОБИОГРАФИИ, казахский. Русский банк готов: src/lib/content/autobiography.ts (коммит ${ru.commit}). Создай src/lib/content/kk/autobiography.ts (export const autobiographyChapters: ChapterDef[]) — ПОЛНЫЙ паритет с русским: те же ключи глав в том же порядке, то же число вопросов в каждой главе, эпиграфы и подсказки на тех же местах (tests/content.test.ts это проверяет). Это не подстрочник: естественный литературный казахский, обращение «Сіз» к рассказчику, заголовки — от первого лица; эпиграфы — казахские мақал-мәтелдер по смыслу. Без букв ё, щ, ъ, э. Род в казахском не нужен — {..|..} используй только для лексики (если нужно) по правилу «первая форма — мужская». Посмотри kk/parent.ts и kk/love.ts — тон и приёмы. Закоммить этот файл.`, { label: 'Банк автобиографии: kk', phase: 'Foundation', isolation: 'worktree', schema: RESULT })
  if (!kk) return { ru }
  const kkReview = await agent(`${RULES}
${prep(kk.commit, 'modes/bank-kk-review')}

Зона: ВЫЧИТКА казахского банка автобиографии носителем языка. Файлы: src/lib/content/autobiography.ts (ru) и src/lib/content/kk/autobiography.ts (kk), коммит ${kk.commit}. Ты — литературный редактор-носитель казахского языка. Проверь каждую строку kk: грамматика, падежи и притяжательные окончания, порядок слов, естественность (не калька с русского), единообразие обращения «Сіз», заголовки от первого лица, смысл совпадает с ru, нет ё/щ/ъ/э, мақал-мәтелдер подлинные и к месту. Проверь и ru: опечатки, тон, повторы, {..|..} корректны для обоих родов. Исправь найденное, сохрани паритет структуры. В summary — список правок (было → стало) кратко.`, { label: 'Вычитка банка kk', phase: 'Foundation', isolation: 'worktree', schema: RESULT })
  return { ru, kk, kkReview }
})()

const [foundation, content] = await Promise.all([foundationP, contentP])
if (!foundation) return { critique, content, failed: 'foundation' }
const bankCommit = content?.kkReview?.commit ?? content?.kk?.commit ?? null

// ── 2. Слияние и проверка основы ───────────────────────────────────────
phase('Combine')
const combined = await agent(`${RULES}
${prep(foundation.commit, 'modes/core')}

Зона: СЛИЯНИЕ И ПРОВЕРКА ОСНОВЫ. Основа: ${foundation.commit} (отчёт: ${JSON.stringify(foundation)}).
${bankCommit ? `1. Влей банк вопросов: git merge --no-edit ${bankCommit}. Конфликт по src/lib/content/autobiography.ts и kk/autobiography.ts (заглушки основы) — бери версию банка (git checkout --theirs …). Верни тест «> 40 вопросов» для автобиографии, если основа его временно ослабила.` : '1. Банка нет — оставь заглушки и отметь в followUps.'}
2. Придирчиво проверь основу по docs/features/book-modes.md и поправкам критика (${JSON.stringify(amendments)}): перенумерация и инвариант позиций, проверки набора при перестановке, права и принадлежность, запрет оглавления вне blank, удаление главы с фото, лимиты, смена языка у autobiography/blank, старые книги не изменились (характеристические снимки tests/characterization — без изменений, кроме объяснимых), applyGender не трогает текст пользователя, coverNames везде, progressOf, readiness, book_progressed по корзинам слов, editor-model с пустыми главами, отсутствие банков в клиентском бандле. Пиши проверочные тесты на сомнительные места. Найденное исправь.
3. Все проверки зелёные. Закоммить.
В contracts — итоговые интерфейсы для следующих исполнителей (дополни и поправь то, что было у основы).`, { label: 'Слияние и проверка основы', phase: 'Combine', isolation: 'worktree', schema: RESULT })
if (!combined) return { critique, foundation, content, failed: 'combine' }

// ── 3. Пять зон интерфейса ─────────────────────────────────────────────
phase('Zones')
const CORE = `Основа режимов готова в коммите ${combined.commit}. Контракты основы: ${combined.contracts}
Отчёт основы: ${combined.summary}
Не меняй сигнатуры основы; если без правки ядра никак — минимально и опиши в отчёте (другие зоны идут параллельно, ветки сольют).`

const ZONES = [
  { slug: 'wizard', title: 'Мастер и экраны книги', areas: ['wizard'], brief: `Зона: МАСТЕР И ЭКРАНЫ КНИГИ (кроме редактора текста). Спецификация §1.2, §1.4, §1.7, §3.3, §3.5. Сделать:
- Мастер src/app/(app)/books/new/*: «Какую книгу пишете?» — четыре подарка и отдельный ряд «Книга о себе» (автобиография) и «Вручную — своя книга с чистого листа»; формы по видам (автобиография: «Чья это история?» — моя / близкого со слов, имя и род рассказчика, «Кто записывает», «Кому посвящаете» → посвящение; blank: автор, «Для кого — необязательно», название с вариантами, «Как назовёте первую главу?»; язык, повод по видам); createBookAction (zod по recipientPolicy, recordedBy, dedication, firstChapter); событие аналитики с видом книги; ссылки ?theme=autobiography|blank работают и после регистрации.
- Настройки книги (settings): рассказчик и «кто записывает» у автобиографии, без рода получателя у обоих режимов, необязательный получатель у blank; текст подтверждения смены языка для blank (переводятся только служебные надписи).
- Обложка: поле получателя скрыто у автобиографии / «необязательно» у blank, подпись автора «Имя рассказчика»; BackSection — готовые фразы и плейсхолдеры для обоих режимов (единственное число).
- Страницы: подсказка посвящения по виду.
- Письма близких: приглашение и текст для WhatsApp по виду (автобиография — «соберите воспоминания о {author}», blank — «{author} пишет книгу «{title}»»), строка приватности — по условию; публичная страница /letters/[token].
- Список книг и хаб книги: подпись вида, прогресс по progressOf (blank — «N разделов · X слов»), главы blank из book_chapters (включая пустые), CTA «Создайте первую главу» / «Продолжить», ссылки на раздел по id (?s=); шапка студии без «· получатель», если его нет; AgreementCard по progressOf.
- Тексты ru/kk. Тесты: действие мастера по видам, DOM мастера и хаба.` },
  { slug: 'editor', title: 'Редактор «Вручную»', areas: ['editor'], brief: `Зона: РЕДАКТОР ТЕКСТА. Спецификация §1.6–§1.9, §2, §3.4. Сделать в src/components/editor/** и src/app/(app)/books/[id]/questions/**:
- Пустая книга и пустая глава не роняют редактор ни в каком режиме (сейчас index=-1 и q.id у undefined); текущий раздел — по id (?s=<id>, ?q=N — совместимость).
- blank: заголовок раздела — крупное поле (h1, в стиле HeadingField), под ним свёрнутая «Подсказка для себя», текст; автосохранение title/prompt через PATCH; «без заголовка» (разделитель); удаление любого раздела; после удаления последнего — пустое состояние.
- Оглавление (ChapterNav, сайдбар и Drawer на телефоне): глава — переименование в строке (Enter/blur — сохранить, Esc — отмена), выше/ниже, удалить (confirmDialog: «Глава и её N разделов будут удалены. Фото из них останутся в книге — в общей галерее.»), «+ Новая глава», «+ Раздел» в главе; раздел — выше/ниже, «Переместить в главу…», удалить; пустая глава — «Пока нет разделов · Добавить раздел»; поиск по заголовку и тексту; кнопки ≥ 40 px на телефоне; перед перестановкой и удалением — flush черновика и dirty.delete удаляемых; оптимистично с откатом при ошибке.
- Карточка прогресса blank «N разделов · ≈ X стр.» (progressOf/оценка), пейджер «Следующий раздел», MobileBar «+ Раздел» на последнем; заметка, что пустые главы в книгу не попадут.
- Автобиография: обычный редактор с банком, подсказки «С чего начать» про воспоминания и запись со слов близкого, плейсхолдер ответа от первого лица.
- Тексты editor.* ru/kk. Тесты: модель и черновик (операции, откат), DOM пустых состояний и оглавления, отсутствие themes в клиентском бандле.` },
  { slug: 'print', title: 'Печать и превью', areas: ['print'], brief: `Зона: ПЕЧАТЬ И ПРЕВЬЮ. Спецификация §1.4, §1.8, §3.2. Сделать:
- Подписи по виду в BookContent и одинаково в PDF (src/modules/production/infrastructure/pdf/interior/*), HTML-полосах (src/components/interior/*) и 3D (src/components/book3d/*, FlipbookData из books/[id]/preview/page.tsx): заголовок галереи (автобиография — «Из семейного альбома», blank — «Фотографии»), строка «Записано со слов автора — {recordedBy}» на обороте титула; галерея в оглавлении 3D как в PDF; название обложки в 3D = content.title.
- Примеры разворотов до первых ответов (src/server/spreadSample.ts, InteriorSpread, подписи примеров фото): своя история для автобиографии (детство от первого лица), нейтральный пример для blank (глава книги или «Глава 1»), без любовного сюжета.
- Обложка PDF и оборот — через coverNames (проверь все места). LAYOUT_VERSION поднят основой — проверь, что этого достаточно.
- Тексты book.* ru/kk. Тесты: снимки страниц/контента для трёх видов (tests/characterization — старые книги без изменений), PDF-рукопись plainText, оборот титула с recordedBy.` },
  { slug: 'crm', title: 'CRM, письма, воронка, AI', areas: ['crm'], brief: `Зона: CRM, АВТОПИСЬМА, ВОРОНКА, AI. Спецификация §3.1, §3.5. Файлы бота (src/modules/messaging/domain/botConfig.ts, QualifierBot, BotForm) НЕ трогай — бота улучшают отдельно. Сделать:
- Воронка продаж: вехи book_half/book_ready по progressOf (порт прогресса отдаёт theme и слова), название сделки «Автобиография: {author}» / «Своя книга «{title}»», поле recipient у автобиографии пустое; подписи вех нейтральные (sales/domain/meta.ts и настройка autoDealFrom).
- Автописьма (notifications): DraftProgress/LatestDraft с theme, словами и разделами; start/nudge/almost по progressOf; советы и тексты по виду (ru/kk mail.ts); ссылки — на раздел по id или корень редактора для пустой книги; письмо об отзыве по виду.
- CRM-экраны: /admin/books (фильтр «почти готовы» по progressOf, строка «Автобиография · рассказчик …», «Своя книга»), карточка клиента, заказа, сделки, поиск, дашборд — «→ получатель» только если есть, прогресс по виду; тип книги виден.
- Помощник менеджера: промпт и досье знают три вида книг; корректор: вид книги в промпте и в ключе кэша.
- Отзывы: подписи тем ru/kk (витрина и админка). Поводы по видам (src/lib/occasions.ts, tests/occasions).
- Тесты по каждому пункту.` },
  { slug: 'site', title: 'Сайт и посадочные', areas: ['site'], brief: `Зона: САЙТ. Спецификация §3.5 (главная и /kniga). Сделать:
- Главная src/app/page.tsx: четыре подарка как сейчас (сетка не ломается), отдельный блок «Книга о себе» и «Своя книга вручную» с понятным текстом вместо «N вопросов», CTA ?theme=…; loveCount не зависит от порядка тем; FAQ: «Можно ли написать книгу о своей жизни?», «Можно ли без вопросов — своими главами?»; формулировки meta/tagline расширить аккуратно (книга в подарок или о своей жизни). ru и kk.
- Посадочные /kniga: две новые страницы ru/kk (автобиография: книга о своей жизни / записать историю бабушки или дедушки; blank: написать свою книгу с нуля) по образцу существующих landings (уникальные metaTitle и h1 — tests/seo.test), в первых 8 для футера; страница посадочной не падает на теме без вопросов (blank — блок о редакторе вместо примеров); хаб /kniga — подпись секции.
- Проверь /blog, sitemap и OG — новые темы не ломают.
- Тесты seo/i18n/контента.` },
]

const zones = await parallel(ZONES.map((z) => () =>
  agent(`${RULES}
${prep(combined.commit, `modes/${z.slug}`)}

${CORE}

${z.brief}
Поправки критика для твоей зоны: ${amendFor(z.areas)}`, { label: z.title, phase: 'Zones', isolation: 'worktree', schema: RESULT })
    .then((r) => (r ? { zone: z.slug, ...r } : { zone: z.slug, failed: true }))
))

return { amendments, foundation, content, combined, zones }
