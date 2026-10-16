# site

Тема книги — обычная строка books.theme (src/shared/infrastructure/db/schema/authoring.ts:29, комментарий «love | mom | dad | friend»). Вся логика берёт тему через getTheme/getThemes/isThemeId из src/lib/content/themes.ts. getTheme молча подставляет love для неизвестного id (themes.ts:115-121), поэтому новая тема, не внесённая в base, везде будет выглядеть как «Любимому человеку». Вопросы банка копируются в book_questions при создании книги (adapters.ts:11-24, Book.start в Book.ts:102-141). Заголовок главы берётся из банка темы по ключу, а для неизвестного ключа ставится «Разное» (book-content.ts:11-19, layout.ts:168-172). Своих глав нет вообще, ни в базе, ни в коде, поэтому для режима «вручную» нужно новое хранилище глав. Без него все разделы напечатаются в одной главе «Разное». Почти всё вокруг книги измеряет прогресс числом ответов: answered/total из book_questions. Пороги разбросаны по коду: 10 ответов (AgreementCard, хаб книги, readiness, воронка на дашборде, письмо о дедлайне), 25 (вехи CRM book_ready и письмо «almost»), 30 (фильтр «Почти готовы» в /admin/books). У книги «вручную» несколько длинных разделов, и все эти пороги для неё бессмысленны. Хуже того, веха book_half срабатывает при answered*2>=total, то есть сразу после первого заполненного раздела. Получатель обязателен только в мастере (books/actions.ts:23). API настроек и coverNamesLine пустое имя переживают, но CRM-экраны рисуют «Автор → » и «для —». Письма о незаконченной книге (lifecycle) не знают тему: DraftProgress без theme. Они ведут на /books/{id}/questions?q=N, а QuestionsEditor падает на книге без вопросов (QuestionsEditor.tsx:63 и 79-80: index=-1, q=undefined, q.id). Сертификат темы не хранит: /redeem ведёт на /books/new без темы. При этом тексты сертификата уже обещают «человек пишет свою книгу о жизни», а такой темы сейчас нет, и автобиография закрывает этот разрыв. Письма близких везде построены вокруг «книги-сюрприза, её получит {recipient}», в книге напечатан эпиграф «Слова тех, кто любит вас». AI в коде двух видов. Первый — помощник менеджера CRM: промпт описывает «вопросы о близком человеке», в досье нет типа книги. Второй — корректор ответов: промпт про «подарочную книгу, письмо близкому человеку». Клиентских AI-подсказок к ответам нет, подсказки берутся из банка (QuestionTuple[2]). Посадочные, sitemap, OG-картинки и футер собираются из массива landings, поэтому новые страницы подхватятся сами. Но тип Landing требует ThemeId и род получателя, а страница /kniga/[slug] строит блок примеров из ch.questions[0][0] и пишет «N вопросов». Тесты фиксируют допущения: в каждой теме больше 40 вопросов (content.test.ts:32), обложка и оформление темы составляют пару, ru и kk словари совпадают.

## places
- /Users/sanjuniperodee/MyBook/.claude/worktrees/funny-tesla-gsqj79/src/lib/content/types.ts [13-31]
  WHAT: ThemeId = "love"|"mom"|"dad"|"friend". В ThemeDef обязательны recipientLabel, recipientPlaceholder, defaultRecipientGender, titleSuggestions и chapters с вопросами.
  CHANGE: Добавить id автобиографии (например "memoir") и режима «вручную». Не называть его "custom" (это уже questionKey своих вопросов) и не "manual" (это source сделки и тег клиента «вручную»). Добавить поле, например recipient: "required"|"optional"|"none" или kind: "gift"|"memoir"|"blank", а recipientLabel и recipientPlaceholder сделать необязательными. Для «вручную» разрешить chapters: []. Тип остаётся лёгким модулем, его импортируют клиентские компоненты.
- /Users/sanjuniperodee/MyBook/.claude/worktrees/funny-tesla-gsqj79/src/lib/content/themes.ts [19-24, 26-109, 111-139]
  WHAT: Список base (id, обложка, оформление), тексты ru/kk, getTheme с откатом на love (115-121), countQuestions, chapterTitle → «Разное».
  CHANGE: Добавить base-записи. Автобиография: обложка leather или linen + оформление vintage (по tests/feedback.test.ts нужна пара из interiorsForCover). «Вручную»: linen + vintage или minimal + luna. Добавить тексты ru/kk и файлы банка autobiography.ts и kk/autobiography.ts (детство, семья, работа, уроки; от первого лица, обращение на «вы» к рассказчику). Хелпер вида bookKind(id) и hasQuestionBank вынести в лёгкий модуль, без импорта themes.ts (tests/client-weight.test.ts:33). Откат на love для неизвестного id заменить явной ошибкой или логом.
- /Users/sanjuniperodee/MyBook/.claude/worktrees/funny-tesla-gsqj79/src/lib/occasions.ts [33-38, 47-48]
  WHAT: themeOccasions: поводы по теме. Для неизвестной темы — все 9 поводов.
  CHANGE: autobiography: ["birthday","parents","newyear","other"] (юбилей идёт как birthday). Для «вручную» оставить откат на все поводы или задать явный список. Обновить tests/occasions.test.ts.
- /Users/sanjuniperodee/MyBook/.claude/worktrees/funny-tesla-gsqj79/src/app/page.tsx [58-61, 202-203, 245-276 (253, 255, 257, 260, 268)]
  WHAT: Главная. loveCount = countQuestions(themes[0]) подставляется в «До N вопросов». Карточки тем идут сеткой lg:grid-cols-4. Мета карточки — t.themes.meta(qn, chapters.length). Имена на обложке берутся из t.coverSamples[th.defaultCover]. Ссылки ведут на /books/new?theme=id или /register?theme=id.
  CHANGE: loveCount считать как max(countQuestions) по темам с банком, без опоры на themes[0]. Для 6 карточек взять lg:grid-cols-3 или вынести автобиографию и «вручную» в отдельный блок «Или — книга о себе / с чистого листа». Для «вручную» вывести свой текст вместо «0 вопросов · 0 глав». В coverSamples нужны names для новых defaultCover.
- /Users/sanjuniperodee/MyBook/.claude/worktrees/funny-tesla-gsqj79/src/i18n/messages/ru/landing.ts [5-8, 13-15, 33-34, 44-50, 54-59, 76, 94-100, 117-118, 152-172, 174-184 (зеркало: kk/landing.ts 4, 32, 53, 172, 183)]
  WHAT: Все тексты главной построены вокруг подарка. meta.title «…в подарок — о любимом, маме, папе». how.steps[0] «Выберите, кому — любимому, маме, папе или другу». themes.eyebrow «Кому подарить», themes.note «учитывают, кто пишет и кому». features «под род автора и адресата». faq «добавить вопрос в любую главу». seoPage.aboutTitle «N вопросов с подсказками». ideas.meta «Идеи подарков». Блок gift (94-100) уже про книгу «о себе».
  CHANGE: Расширить формулировки на «о своей жизни» и «с чистого листа». Добавить строки themes.metaBlank, faq «Можно ли написать книгу о своей жизни?» и «Можно ли без вопросов, своими главами?», варианты seoPage.aboutTitle/aboutNote/howSteps[0] для режима «вручную». Блок сертификата связать со страницей автобиографии. Ключи держать синхронно в kk (tests/i18n.test.ts:33-35).
- /Users/sanjuniperodee/MyBook/.claude/worktrees/funny-tesla-gsqj79/src/i18n/messages/ru/common.ts [9-12]
  WHAT: meta.tagline и description «Персональная книга-подарок…» идут в футер и organizationLd.
  CHANGE: Обобщить: книга в подарок или о своей жизни. Зеркально поправить kk.
- /Users/sanjuniperodee/MyBook/.claude/worktrees/funny-tesla-gsqj79/src/lib/content/landings/types.ts [18-26 (и landings/index.ts:25)]
  WHAT: В Landing обязательны theme: ThemeId, authorGender и recipientGender. Порядок массива задаёт футер: landings.slice(0, 8) в src/components/landing/Footer.tsx:26.
  CHANGE: Сделать recipientGender необязательным. Добавить страницы, например kniga-o-sebe или avtobiografiya, kniga-vospominanij (историю бабушки или дедушки записывает внук с их слов), svoya-kniga или napisat-knigu-s-nulya. Тексты нужны на ru и kk. Поставить их в первые 8 элементов, иначе их не будет в футере. Sitemap (src/app/sitemap.ts:13) и OG-картинка (src/app/api/og/route.tsx:22-27) подхватятся сами. В tests/seo.test.ts проверяется уникальность metaTitle и h1.
- /Users/sanjuniperodee/MyBook/.claude/worktrees/funny-tesla-gsqj79/src/app/kniga/[slug]/page.tsx [49, 53-59, 64, 71-72, 146, 158, 168]
  WHAT: Посадочная страница. siteReviews(3, l.theme). g() применяет род автора и получателя. Примеры берутся как ch.questions[0][0]: упадёт на главе без вопросов, а у «вручную» глав нет. aboutTitle(countQuestions) даст «0 вопросов». CTA с ?theme=. Ссылки «Ещё идеи подарков» и подбор статей по теме.
  CHANGE: Для «вручную» показать вместо примеров блок о редакторе: главы, разделы, свои подсказки. Проверять ch.questions.length. Для автобиографии вызывать g() без рода получателя. howSteps[0] сделать по режиму. Блок отзывов по новой теме будет пуст и скроется (Reviews.tsx:43) — это нормально.
- /Users/sanjuniperodee/MyBook/.claude/worktrees/funny-tesla-gsqj79/src/app/kniga/page.tsx [17-25, 32, 63-69]
  WHAT: Хаб /kniga группирует посадочные по getThemes и theme.name и пропускает пустые темы. Мета — «Идеи подарков».
  CHANGE: Новые секции появятся автоматически вместе с посадочными. theme.name автобиографии должен читаться как заголовок H2. Поменять meta, eyebrow и lead (landing.ideas, строки 174-184) или выделить отдельную секцию «Книга о себе».
- /Users/sanjuniperodee/MyBook/.claude/worktrees/funny-tesla-gsqj79/src/app/blog/[slug]/page.tsx [46-58, 146 (и src/lib/content/articles/types.ts:27-30)]
  WHAT: Тема статьи задаёт CTA ?theme= и подборку вопросов из банка (bank.author/recipient). Внизу — questionsCount(countQuestions(theme)).
  CHANGE: Можно добавить статью «Вопросы для автобиографии / как записать историю бабушки» с theme memoir: банк работает, род получателя не важен. Для «вручную» статья без bank. Проверка в tests/seo.test.ts:41 (isThemeId).
- /Users/sanjuniperodee/MyBook/.claude/worktrees/funny-tesla-gsqj79/src/app/(auth)/actions.ts [51-52 (и register/page.tsx:17-19, 50; register/RegisterForm.tsx:9-14)]
  WHAT: Тема из ?theme= переживает регистрацию только если её пропускает isThemeId.
  CHANGE: Отдельных правок не нужно, если новые id есть в base. Иначе ссылки посадочных молча уведут на голый /books/new.
- /Users/sanjuniperodee/MyBook/.claude/worktrees/funny-tesla-gsqj79/src/app/(app)/books/actions.ts [17-31, 39-50]
  WHAT: Zod-схема мастера: theme через isThemeId, recipientName.min(1) обязателен. Событие queueEvent("book_created") уходит без темы.
  CHANGE: Для memoir и «вручную» сделать recipientName необязательным. Если для автобиографии будет поле «кто записывает», добавить его. Событие разделить, например book_created_memoir и book_created_blank, или передавать value, чтобы мерить спрос (цели заводятся в Метрике, src/lib/analytics-client.ts:16-24).
- /Users/sanjuniperodee/MyBook/.claude/worktrees/funny-tesla-gsqj79/src/app/(app)/books/new/page.tsx [14-35 (и NewBookWizard.tsx:17-31, 81-90; ru/books.ts:25-50)]
  WHAT: WizardTheme требует recipientLabel и число вопросов. Карточка показывает t.questions(n). Заголовок «Кому будет книга?».
  CHANGE: Заголовок «Какую книгу вы пишете?». Карточки «Автобиография» и «С чистого листа» без счётчика вопросов. Поле получателя скрывать или сделать необязательным («для детей и внуков»).
- /Users/sanjuniperodee/MyBook/.claude/worktrees/funny-tesla-gsqj79/src/app/(app)/books/page.tsx [63-64, 74, 82, 100, 112-117 (тексты ru/books.ts:10, 16, 19; kk/books.ts:15)]
  WHAT: Список книг. Метка theme.name, прогресс «N из M ответов», newBookHint «Новая книга — маме, папе или другу», firstText «отвечать на вопросы».
  CHANGE: Метка по режиму. Для «вручную» вместо ответов показывать «N разделов · X слов»: в userBooks (src/modules/authoring/infrastructure/queries.ts:65-76) добавить слова. newBookHint: «Новая книга — близкому, о себе или с чистого листа» (ru и kk).
- /Users/sanjuniperodee/MyBook/.claude/worktrees/funny-tesla-gsqj79/src/app/(app)/books/[id]/page.tsx [51-71, 74, 137, 151 (и layout.tsx:20, 45-47; ru/books.ts hub 74-77)]
  WHAT: Хаб книги. Шапка «theme.name · recipientName». Прогресс «Отвечено на N% вопросов», шаг «Текст» готов при 10+ ответах. Кнопка «Первый/Следующий вопрос», главы через chapterTitle (для «вручную» будет «Разное»).
  CHANGE: Для «вручную» брать главы из своего хранилища, считать прогресс по словам или страницам, кнопку назвать «Новый раздел» или «Продолжить». Порог «готово» сделать зависимым от режима.
- /Users/sanjuniperodee/MyBook/.claude/worktrees/funny-tesla-gsqj79/src/modules/authoring/domain/events.ts [3-10 (и Book.ts:177-179)]
  WHAT: В BookRef события book_started нет темы, есть только title, recipientName и occasion.
  CHANGE: Добавить theme и authorName в BookRef и Book.ref(), чтобы CRM знала режим книги.
- /Users/sanjuniperodee/MyBook/.claude/worktrees/funny-tesla-gsqj79/src/server/subscriptions.ts [64-76]
  WHAT: book_started заполняет поля сделки occasion, event_date и recipient. book_progressed запускает funnel.bookProgressed.
  CHANGE: Добавить поле сделки book_type («Автобиография», «Своя книга», «Маме»…). recipient для memoir оставить пустым или писать «о себе».
- /Users/sanjuniperodee/MyBook/.claude/worktrees/funny-tesla-gsqj79/src/modules/sales/application/services.ts [344-366]
  WHAT: bookProgressed: book_half при answered*2>=total, book_ready при answered>=BOOK_READY_ANSWERS (25). bookStarted: название сделки «Книга для: {recipient}» или «Книга «title»».
  CHANGE: Пороги по режиму. Для «вручную» total — это разделы самого автора, и половина наступает после первого раздела (1 из 1). Мерить по словам или оценке страниц (например, половина от ~1500 слов, готовность от ~3000 или от print.minPages). Названия: «Автобиография: {authorName}», «Своя книга «title»».
- /Users/sanjuniperodee/MyBook/.claude/worktrees/funny-tesla-gsqj79/src/modules/sales/infrastructure/adapters.ts [84-91 (порт: sales/application/ports.ts:38)]
  WHAT: sqlBookProgress отдаёт только {answered, total} из book_questions.
  CHANGE: Отдавать ещё theme и число слов (сумму по ответам), чтобы воронка решала по режиму.
- /Users/sanjuniperodee/MyBook/.claude/worktrees/funny-tesla-gsqj79/src/modules/sales/domain/meta.ts [5-15 (и admin/settings/crm/CrmSettingsForm.tsx:57-64)]
  WHAT: Подписи вех «Ответил на половину вопросов» и «Книга почти готова (25+ ответов)», константа BOOK_READY_ANSWERS = 25. Те же подписи в настройке autoDealFrom.
  CHANGE: Нейтральные подписи («Написал половину книги», «Книга почти готова») с расшифровкой порогов по режимам.
- /Users/sanjuniperodee/MyBook/.claude/worktrees/funny-tesla-gsqj79/src/modules/notifications/domain/lifecycle.ts [6, 21-34, 46-65]
  WHAT: Правила автописем. ALMOST_READY_ANSWERS = 25. «start» при answered===0, «nudge» при 0<answered<25, «almost» при 25 и больше. В DraftProgress нет theme и слов.
  CHANGE: Добавить в DraftProgress theme, words и sections. Для «вручную» «almost» и «nudge» считать по словам или страницам, «start» — если нет разделов или слов. Ключи писем не менять.
- /Users/sanjuniperodee/MyBook/.claude/worktrees/funny-tesla-gsqj79/src/modules/notifications/infrastructure/persistence.ts [9-10, 13-32, 44-62, 64-72]
  WHAT: draftCandidates и latestDraft выбирают answered и firstEmpty без темы. reviewDue не соединяется с books.
  CHANGE: Выбирать books.theme, число слов и число разделов. В reviewDue сделать join books по orders.book_id, чтобы письмо об отзыве учитывало тип книги.
- /Users/sanjuniperodee/MyBook/.claude/worktrees/funny-tesla-gsqj79/src/modules/notifications/infrastructure/templates.ts [17, 22-75, 95-110, 114-129]
  WHAT: Ссылки ведут на /books/{id}/questions?q=firstEmpty+1. Кнопка «Ответить на первый вопрос». Счётчики «N ответов» и «из total». В письме об отзыве — абзац gift. Заметки в CRM-ленту на русском.
  CHANGE: Для пустой книги «вручную» ссылку вести на корень редактора или на страницу глав: QuestionsEditor падает на пустом списке. Тексты и заметки по режиму. В письме об отзыве абзац gift выбирать по режиму.
- /Users/sanjuniperodee/MyBook/.claude/worktrees/funny-tesla-gsqj79/src/i18n/messages/ru/mail.ts [28-29, 36, 40-50, 54, 66-70, 85, 125-133, 143-151 (зеркало: kk/mail.ts, в т.ч. 62)]
  WHAT: Тексты писем. deadline.short «15–20 коротких ответов». start.tips «Начните с вопроса…». nudge и reminder «N ответов из M». review.text «подарок… как прошло вручение». review.gift «маме, папе или другу». order.delivered «подарок получился особенным». gift.recipient.text.
  CHANGE: Добавить варианты по режиму. start для memoir: «начните с детства, можно надиктовать или записать за мамой». start для «вручную»: «начните с оглавления: 5–7 глав». В reminder и nudge для «вручную» — разделы и слова. review для memoir: «Что сказали близкие?», gift: «подарите сертификат родителям — пусть запишут свою историю». delivered сделать нейтральным. Ключи держать синхронно в ru и kk.
- /Users/sanjuniperodee/MyBook/.claude/worktrees/funny-tesla-gsqj79/src/modules/notifications/application/services.ts [61-84 (порт: ports.ts:26-33)]
  WHAT: Ручное напоминание из CRM (BookRemindersService, RemindAll в /admin/books) по LatestDraft {answered, total, firstEmpty}.
  CHANGE: Расширить LatestDraft полями theme и words, шаблон reminder сделать по режиму.
- /Users/sanjuniperodee/MyBook/.claude/worktrees/funny-tesla-gsqj79/src/modules/reporting/infrastructure/Books.ts [10-39 (17, 19)]
  WHAT: Список книг для CRM: фильтр «ready» = answered>=30 (а вехи и письма считают от 25), фильтр по теме через eq(books.theme).
  CHANGE: Добавить в выборку слова. Фильтр «ready» сделать по режиму и согласовать с порогом 25. Подумать о фильтре по группе: подарок, автобиография, своя книга.
- /Users/sanjuniperodee/MyBook/.claude/worktrees/funny-tesla-gsqj79/src/app/admin/books/page.tsx [13, 32, 56-63, 86, 100-109]
  WHAT: /admin/books: селект «Все темы» из getThemes("ru"), строка «{theme.short} · для {recipientName || "—"}», прогресс answered/total.
  CHANGE: Новые темы в селект попадут сами. Строку менять по режиму: «Автобиография · рассказчик {authorName}», «Своя книга». Прогресс для «вручную» — «N разделов · X слов».
- /Users/sanjuniperodee/MyBook/.claude/worktrees/funny-tesla-gsqj79/src/app/admin/clients/[id]/sections.tsx [190-210 (данные: reporting/infrastructure/ClientCard.ts:16-26)]
  WHAT: Карточка клиента: «{theme.name} · {author} → {recipient}», прогресс «answered/total ответов».
  CHANGE: Без получателя не выводить «→». Подпись по режиму, для «вручную» — слова и разделы.
- /Users/sanjuniperodee/MyBook/.claude/worktrees/funny-tesla-gsqj79/src/app/admin/orders/[id]/page.tsx [118-123]
  WHAT: Карточка заказа: «Тема», «Автор → адресат», «Наполнение: N ответов · слов · фото».
  CHANGE: Строки «Тип книги» и «Рассказчик/Автор». Адресат необязателен. Для «вручную» — «N разделов».
- /Users/sanjuniperodee/MyBook/.claude/worktrees/funny-tesla-gsqj79/src/app/admin/deals/[id]/sections.tsx [37-58 (запрос: reporting/infrastructure/DealCard.ts:22-38)]
  WHAT: DealBooks: если нет названия — «Для: {recipient}», дальше «N из M ответов». В запросе нет books.theme.
  CHANGE: Добавить в select books.theme и показывать метку типа. Для «вручную» — слова и разделы.
- /Users/sanjuniperodee/MyBook/.claude/worktrees/funny-tesla-gsqj79/src/modules/reporting/infrastructure/Dashboard.ts [35-43 (вывод: src/app/admin/page.tsx:83-84; см. также Deals.ts:63-67, Clients.ts:16 + admin/clients/page.tsx:142, admin/search/page.tsx:92)]
  WHAT: Воронка дашборда «Ответили на 10+ вопросов». На доске сделок прогресс answered/total. В списке клиентов «N отв.». В поиске «author → recipient».
  CHANGE: Книга «вручную» никогда не наберёт 10 ответов: перейти на «≥ N слов» для всех режимов или считать по режимам. В поиске без получателя не выводить «→».
- /Users/sanjuniperodee/MyBook/.claude/worktrees/funny-tesla-gsqj79/src/i18n/messages/ru/review.ts [14, 17, 33, 52 (kk/review.ts:33, 52; вывод: components/landing/Reviews.tsx:87, admin/reviews/page.tsx:14, 121)]
  WHAT: Подписи тем отзывов есть только для love, mom, dad, friend. Тексты «Как прошло вручение? Что сказал получатель», «книга маме, папе или другу».
  CHANGE: Добавить подписи memoir и «вручную» (иначе админка покажет сырой id, а витрина — пусто). Тексты формы отзыва выбирать по теме: forReview уже отдаёт theme (feedback/infrastructure/adapters.ts:28).
- /Users/sanjuniperodee/MyBook/.claude/worktrees/funny-tesla-gsqj79/src/app/redeem/actions.ts [23 (и redeem/page.tsx:33-46; ru/gift.ts:5-24, 40, 85-87, 119-124; ru/mail.ts:125-133)]
  WHAT: Активация сертификата ведёт на /books/new без темы, а гостя — на /register без темы. Тексты сертификата уже про «человек пишет свою книгу о жизни и семье».
  CHANGE: Вести на /books/new?theme=memoir (гостя — на /register?theme=memoir) или на выбор с предвыбранной автобиографией. Тексты redeem.text и gift.recipient.text дополнить: «о своей жизни».
- /Users/sanjuniperodee/MyBook/.claude/worktrees/funny-tesla-gsqj79/src/shared/infrastructure/db/schema/ordering.ts [142-176 (GiftCard.ts:23-24, 52; GiftsService.ts:13; gift/actions.ts:26-28; GiftForm.tsx шаг «Какую книгу дарите»)]
  WHAT: В gift_cards нет вида книги: есть только plan, recipientName и message.
  CHANGE: По желанию: колонка book_kind (nullable, миграция) и выбор в GiftForm: «книга о жизни получателя / книга близкому / решит сам». Тогда redeem сам направит в нужный режим.
- /Users/sanjuniperodee/MyBook/.claude/worktrees/funny-tesla-gsqj79/src/app/letters/[token]/page.tsx [21-49 (LetterForm.tsx:10, 20; ru/gift.ts:133-152)]
  WHAT: Публичная страница письма: «{author} готовит книгу-сюрприз», «Её получит {recipient}», «{recipient} прочитает его в книге».
  CHANGE: Для memoir: «Мы собираем книгу о жизни {author}. Напишите воспоминание о нём/ней или слова благодарности», без «сюрприза». Для «вручную»: «{author} пишет книгу «{title}»». Тема уже есть в строке book (bookByInviteToken возвращает всю книгу, queries.ts:32-34).
- /Users/sanjuniperodee/MyBook/.claude/worktrees/funny-tesla-gsqj79/src/app/(app)/books/[id]/letters/LettersManager.tsx [31-55, 122 (letters/page.tsx:26; ru/letter-share.ts:2 и kk/letter-share.ts:2; ru/books.ts:270-300 — 278, 287, 293)]
  WHAT: Текст для WhatsApp: «Я готовлю книгу-сюрприз — её получит {recipient}». Приватность: «видно… имя получателя». Глава «Письма близких».
  CHANGE: Передавать theme, authorName и authorGender. Для автобиографии свой share-текст: «Записываю историю жизни мамы/папы — напишите воспоминание». Строку приватности показывать по условию.
- /Users/sanjuniperodee/MyBook/.claude/worktrees/funny-tesla-gsqj79/src/i18n/messages/ru/book.ts [5-9 (kk/book.ts:9; используется в src/lib/book/book-content.ts:11-19)]
  WHAT: В книге печатаются «Письма близких» с эпиграфом «Слова тех, кто любит вас», галерея «Наши моменты» и «Разное».
  CHANGE: В автобиографии читатель — дети и внуки, поэтому «вас» не подходит. bookTexts() должен выбирать по режиму: например «Воспоминания близких» с эпиграфом «Слова тех, кто рядом» и галерею «Фотографии из жизни». Для «вручную» defaultTitle не брать из titleSuggestions[0].
- /Users/sanjuniperodee/MyBook/.claude/worktrees/funny-tesla-gsqj79/src/modules/assistant/domain/proofread.ts [38-54 (строка 40)]
  WHAT: Промпт корректора: «ответ автора для подарочной книги-воспоминания: его личная история, письмо близкому человеку». Правила в src/lib/proofread/* от темы не зависят.
  CHANGE: Передавать вид книги. memoir: «воспоминания рассказчика от первого лица, возможно записанные с его слов; сохраняй устную речь и диалектизмы». «вручную»: «авторский текст любого жанра, допускаются диалоги и художественная речь».
- /Users/sanjuniperodee/MyBook/.claude/worktrees/funny-tesla-gsqj79/src/modules/assistant/application/ProofreadService.ts [44-48 (route: src/app/api/books/[id]/proofread/ai/route.ts:20-26)]
  WHAT: check(text, language, ui) без вида книги. Ключ кэша — sha1(language|ui|text).
  CHANGE: Добавить параметр kind и включить его в ключ кэша, иначе отдастся ответ, полученный с другим промптом. Route передаёт book.theme.
- /Users/sanjuniperodee/MyBook/.claude/worktrees/funny-tesla-gsqj79/src/modules/assistant/domain/prompts.ts [63-76 (68), 89-96 (93)]
  WHAT: AI-помощник менеджера. Контекст продукта: «клиент отвечает на вопросы о близком человеке». Резюме: «для кого и к какому поводу книга».
  CHANGE: Описать три вида книг: подарок близкому, автобиография, своя книга с нуля. В резюме просить указывать тип книги.
- /Users/sanjuniperodee/MyBook/.claude/worktrees/funny-tesla-gsqj79/src/modules/assistant/domain/dossier.ts [14, 29 (данные: infrastructure/data.ts:35-48)]
  WHAT: Строка досье «Книга «title» для {recipient}: ответов N из M». В select нет theme.
  CHANGE: Добавить books.theme и слова. Строка вида «Автобиография «title»: N ответов» или «Своя книга: N разделов, X слов».
- /Users/sanjuniperodee/MyBook/.claude/worktrees/funny-tesla-gsqj79/src/modules/messaging/domain/botConfig.ts [19]
  WHAT: Вопрос бота-квалификатора по умолчанию: «Для кого будет книга? Например: для мамы, для мужа, для подруги.»
  CHANGE: Дописать «или книга о себе — автобиография». Это только значение по умолчанию: сохранённый в настройках конфиг правится в админке (BotForm).
- /Users/sanjuniperodee/MyBook/.claude/worktrees/funny-tesla-gsqj79/drizzle/0015_crm_pipelines.sql [84-89]
  WHAT: Поля сделки по умолчанию: occasion, event_date, recipient («Для кого»), format. Типа книги нет.
  CHANGE: Новая миграция: поле сделки book_type (select: Любимому, Маме, Папе, Другу, Автобиография, Своя книга). Заполнять в subscriptions.ts:71 и по желанию в clients/application/onboarding.ts:165-171.
- /Users/sanjuniperodee/MyBook/.claude/worktrees/funny-tesla-gsqj79/src/components/AgreementCard.tsx [10, 20-23, 36-40 (тексты ru/books.ts:163-167)]
  WHAT: При READY_ANSWERS = 10 шаг «Оформить заказ». Тексты «Ответьте на вопросы», «ответов: N».
  CHANGE: Порог и тексты по режиму. Для «вручную» — по словам.
- /Users/sanjuniperodee/MyBook/.claude/worktrees/funny-tesla-gsqj79/src/modules/authoring/domain/readiness.ts [22, 28-29]
  WHAT: Ошибка noAnswers и предупреждение «мало ответов», если answered < 10.
  CHANGE: Для «вручную» проверять слова или страницы, иначе 3 длинные главы всегда дадут предупреждение «мало ответов».
- /Users/sanjuniperodee/MyBook/.claude/worktrees/funny-tesla-gsqj79/src/app/(app)/books/[id]/cover/BackSection.tsx [96 (тексты ru/books.ts:234-239)]
  WHAT: Варианты текста для оборота обложки по теме — t.suggestions[theme]. Для новой темы список пуст.
  CHANGE: Добавить варианты для memoir («История моей жизни — для вас, мои дети и внуки») и для «вручную», на ru и kk.
- /Users/sanjuniperodee/MyBook/.claude/worktrees/funny-tesla-gsqj79/src/modules/authoring/application/services.ts [26-34, 58-61, 139-154]
  WHAT: start копирует вопросы темы. При смене языка replaceTemplates идёт по ключам банка. addCustom требует afterId, существующий вопрос. deleteCustom удаляет только questionKey="custom".
  CHANGE: В пустую книгу «вручную» нельзя добавить первый раздел: нужен метод вставки в главу или в конец. Разделы «вручную» должны удаляться и переставляться. Создание и удаление раздела должно записывать bookProgressed: сейчас событие только в Question.edit (Question.ts:53).
- /Users/sanjuniperodee/MyBook/.claude/worktrees/funny-tesla-gsqj79/tests/content.test.ts [30-37, 39-47, 49-53 (и tests/feedback.test.ts:265-275, tests/i18n.test.ts:33-35, tests/seo.test.ts:41, tests/occasions.test.ts:22-27, tests/client-weight.test.ts:33, tests/fixtures.test.ts:151)]
  WHAT: Тесты требуют: в каждой теме больше 40 вопросов, kk-банк повторяет ru, обложка и оформление темы составляют пару, словари ru и kk совпадают, у статей известная тема, themes.ts не попадает в браузер.
  CHANGE: Тема «вручную» с 0 вопросов провалит строку 32: исключить её из проверки (hasQuestionBank) или вынести режим из списка тем. Банку автобиографии нужен полный kk-перевод с теми же ключами, подсказками и эпиграфами.

## risks
- Если новый id есть в базе, но не добавлен в base в themes.ts, getTheme (themes.ts:115-121) молча вернёт тему love. Тогда CRM, список книг, PDF (главы «Разное») и письма покажут «Любимому человеку» без всякой ошибки.
- Коллизии имён. questionKey "custom" уже означает свой вопрос (schema/authoring.ts:80-81, Question.ts:37-38). source "manual", тег клиента «вручную» и ManualChannel заняты CRM (clients/application/onboarding.ts). Для режима «вручную» нужен другой id, например blank или free.
- Пустая книга «вручную» ломает редактор. Ссылки из писем (templates.ts:17, 105) и кнопка «Первый вопрос» ведут на /books/{id}/questions?q=1. В QuestionsEditor.tsx:63 получается index=-1, на строке 79 q=undefined, на строке 80 q.id падает с TypeError.
- Пороги по числу ответов разбросаны и уже расходятся: 10 (AgreementCard.tsx:10, readiness.ts:28, Dashboard.ts:41, templates.ts:34, хаб :74), 25 (sales/domain/meta.ts:15, notifications/domain/lifecycle.ts:6), 30 (reporting/Books.ts:17). Для «вручную» неверны все сразу. Без общей функции прогресса по режиму CRM, письма и дашборд будут противоречить друг другу.
- Воронка для «вручную»: book_half сработает после первого заполненного раздела (answered*2>=total при total=1), а book_ready (25 ответов) может не наступить никогда. Добавление и удаление раздела не шлют bookProgressed. При autoDealFrom=book_half сделки будут заводиться почти на каждую ручную книгу.
- Кэш #reached в FunnelService живёт в памяти процесса. После перезапуска вехи пересчитываются — это безопасно, но при смене логики порогов поведение старых книг не изменится, пока процесс не перезапустится.
- Для «вручную» негде хранить главы. Заголовок главы берётся из банка по ключу (layout.ts:168-172, editor-data.ts:27), иначе ставится «Разное». Без нового хранилища (таблица book_chapters или jsonb в books) книга напечатается одной главой «Разное». Это затрагивает PDF, оглавление, предпросмотр и хаб.
- Получатель обязателен только в мастере (books/actions.ts:23). Без него CRM выводит «Автор → » (clients/[id]/sections.tsx:201, orders/[id]/page.tsx:121, search/page.tsx:92), «для —» (admin/books/page.tsx:86) и название сделки «Книга «title»».
- Письма близких и печатный эпиграф «Слова тех, кто любит вас» (ru/book.ts:9) в автобиографии обращаются не к тому читателю. Тексты «книга-сюрприз, её получит…» тоже не подходят, если рассказчик пишет сам.
- Тест-ограничение веса бандла (tests/client-weight.test.ts:33): хелперы режима нельзя класть в themes.ts, если их будут импортировать клиентские компоненты (мастер, редактор).
- Тесты i18n требуют полной синхронности ru и kk, включая длины массивов. Каждый новый текст (письма, посадочные, отзывы, буклет обложки) нужен на двух языках, а у посадочных и статей должны быть уникальные metaTitle и h1.
- Главная опирается на порядок тем: loveCount = countQuestions(themes[0]) (page.tsx:61). Сетка на 4 колонки (page.tsx:253) с 6 карточками даст неровный ряд. Если новые темы встанут первыми, «До N вопросов» на главной изменится.
- Кэш корректора (ProofreadService.ts:45) не учитывает вид книги. Если промпт станет зависеть от режима, без правки ключа вернётся результат, полученный с другим промптом.
- Конфиг бота по умолчанию (botConfig.ts:19) применится только там, где конфиг не сохранён. У существующих установок вопрос «Для кого будет книга?» останется прежним.
- Отдельные цели аналитики (book_created_memoir и т. п.) нужно завести в Метрике, GA и Pixel, иначе события потеряются.

## open
- Какие id и названия у режимов: memoir/autobiography и blank/free? Подпись «С чистого листа», «Своя книга» или «Вручную»? Слово «вручную» уже занято в CRM: тег клиента и источник сделки.
- Кто в автобиографии хранится как authorName и authorGender: рассказчик или тот, кто записывает? Нужно ли отдельное поле «записывает: я сам / родственник с моих слов»? В каком лице вопросы, если записывает родственник: «вы» к рассказчику или «[он|она]»?
- Получатель в автобиографии: свободный текст «для детей и внуков», который печатается на обложке и в посвящении, или поле полностью скрыто? Нужен ли повод и дата (юбилей) с письмами о дедлайне?
- Как хранить главы режима «вручную»: новая таблица book_chapters (id, book_id, key, title, epigraph, position) или jsonb в books? Разделы оставлять в book_questions (prompt — своя подсказка, title — заголовок в книге)?
- По каким порогам режиму «вручную» достигать вех book_half и book_ready, писем «almost/nudge» и шага «готово» в AgreementCard: по словам (сколько?) или по оценке страниц (print.minPages)? Переводить ли на слова и существующие темы ради единой логики?
- Нужен ли в сертификате выбор вида книги (колонка gift_cards.book_kind)? Или достаточно, чтобы /redeem вёл в автобиографию по умолчанию?
- Письма близких в автобиографии: оставить с другими текстами («Воспоминания близких») или отключить? Включать ли их в режиме «вручную»?
- Какие посадочные и статьи под SEO делать (автобиография, книга о себе, книга воспоминаний бабушки, история семьи, написать книгу с нуля)? Оставлять ли хаб /kniga под названием «Идеи подарков» или переименовать в «Идеи книг»?
- Нужен ли в CRM (/admin/books, сделки) фильтр по группе «подарок / автобиография / своя книга» и новое поле сделки «Тип книги»?