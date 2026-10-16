# content

Темы описаны в двух местах. Первое — src/lib/content/types.ts. Там объявлены QuestionTuple = [prompt, title, hint?] (вопрос автору, заголовок в книге, подсказка), ChapterDef {key, title, epigraph?, questions}, закрытое объединение ThemeId = "love"|"mom"|"dad"|"friend" и ThemeDef. Второе — src/lib/content/themes.ts. Там лежат массив base (id, emoji, род адресата, обложка и оформление по умолчанию) и объект text: Record<Locale, Record<ThemeId, ThemeText>> с текстами ru/kk (название, описание, подпись и плейсхолдер для получателя, titleSuggestions, chapters). Темы mom и dad используют один банк parentChapters. Род подставляет applyGender (src/lib/content/gender.ts:9-13): {м|ж} — род автора, [м|ж] — род адресата, первая форма мужская. Шаблоны есть и в заголовках глав, например parent.ts:58 «[Папа|Мама] глазами меня», поэтому все потребители прогоняют через applyGender и chapter.title. В kk-банках грамматического рода нет. Формы {..} там не встречаются нигде (только в комментарии kk/love.ts:3). Формы [..] выбирают лексику: [әкеңізге|анаңызға], [досыңызға|құрбыңызға], [әке|ана]. Первая форма в них мужская (kk/parent.ts:3). При создании книги вопросы копируются в book_questions (persistence.ts:29-36) с ключом `${themeId}.${chapterKey}.${N}` (adapters.ts:21). Своим вопросам ставится ключ "custom", а их title = prompt. Главы книги в базе хранятся только ключом (book_questions.chapter). Названия и эпиграфы глав нигде не сохраняются: их всегда достают из банка темы через chapterTitle()/bookTexts().chapter(). Если ключа нет в банке, глава получает заглушку «Разное». Для режима «Вручную» это главный пробел: пользовательским главам негде хранить заголовок, нужна миграция (jsonb books.chapters или таблица book_chapters). Есть и другая опасность: getTheme() на неизвестный id молча возвращает love (themes.ts:113). Ошибку компиляции при добавлении нового ThemeId даст только объект text (Record<Locale, Record<ThemeId,…>>). Остальные словари тем имеют тип Record<string,…> и молча вернут пустоту: поводы (occasions.ts:33), варианты текста оборота (books.ts:235), названия тем в отзывах (review.ts:52). Тесты банков (tests/content.test.ts) требуют >40 вопросов в каждой теме из getThemes, полного совпадения ru/kk по ключам глав, числу вопросов, наличию эпиграфов и подсказок, и чтобы в kk не было букв ё/щ/ъ/э. tests/feedback.test.ts:264-273 требует, чтобы defaultInterior сочеталось с defaultCover. Для «Автобиографии» достаточно новой темы с банком (autobiography.ts и kk/autobiography.ts). В ней {..} относится к роду рассказчика, а [..] запрещены, потому что получателя может не быть. Получатель становится необязательным в мастере (books/actions.ts:23 сейчас требует min(1)). Для «Вручную» нужна тема с пустым банком и вид kind:"manual". Кроме того, нужно хранилище глав, CRUD глав и разделов (сейчас addCustom требует afterId, deleteCustom удаляет только key="custom"), защита от падения редактора на пустом списке (QuestionsEditor.tsx:79-80) и обход applyGender для пользовательского текста.

## places
- src/lib/content/types.ts [3-31]
  WHAT: QuestionTuple [prompt,title,hint?]; ChapterDef; ThemeId — закрытое объединение из 4 id; ThemeDef с обязательными recipientLabel/recipientPlaceholder/defaultRecipientGender/titleSuggestions/chapters.
  CHANGE: Расширить ThemeId: "autobiography" | "manual" (или ввести отдельный BankThemeId для банков). Добавить в ThemeDef вид kind: "bank"|"manual" и политику получателя recipient: "required"|"optional"|"none". Для автобиографии добавить подписи автора (authorLabel «Чья это история / имя рассказчика», authorAs «Рассказчик»). recipientLabel/placeholder сделать необязательными или дать им смысл «для кого — необязательно».
- src/lib/content/themes.ts [16-24]
  WHAT: base: id, emoji, recipientGender, defaultRecipientGender, defaultCover, defaultInterior. Порядок важен: src/app/page.tsx:61 считает themes[0] темой love.
  CHANGE: Добавить в конец (love остаётся первой): { id:"autobiography", defaultCover:"leather", defaultInterior:"vintage" } (vintage.ts:26 сочетается с leather) и { id:"manual", defaultCover:"linen", defaultInterior:"classic" } (legacy.ts:34-39: classic сочетается с linen). Иначе упадёт feedback.test.ts:264-273.
- src/lib/content/themes.ts [26-103]
  WHAT: text: Record<Locale, Record<ThemeId, ThemeText>> — тексты ru/kk и ссылки на банки глав. Единственное место, где TS заставит дописать новые id.
  CHANGE: Добавить ru и kk записи для autobiography (chapters: autobiographyChapters / autobiographyChaptersKk, titleSuggestions вроде «История моей жизни», «Моя жизнь», «Для моих внуков» — одинаковой длины в ru и kk, иначе сломается switchLanguage) и для manual (chapters: [], titleSuggestions вроде «Моя книга»).
- src/lib/content/themes.ts [105-139]
  WHAT: miscTitle «Разное»/«Әртүрлі» (дублирует messages book.misc: ru/book.ts:8, kk/book.ts:8); themeIds; getTheme с молчаливым откатом на base[0]=love (113); getThemes; isThemeId; countQuestions; chapterTitle(theme,key,lang) ищет только в банке темы; themeChaptersByLocale (для тестов).
  CHANGE: chapterTitle и связанные функции должны сначала искать название в главах самой книги (хранилище глав для ручного режима), а потом в банке. Решить, оставлять ли откат на love в getTheme: для manual он даст titleSuggestions[0]=«Наша история» как название по умолчанию в PDF. Добавить фильтр getThemes(lang, {kind}), чтобы маркетинговые страницы и тест «>40 вопросов» не захватывали manual.
- src/lib/content/gender.ts [3-13]
  WHAT: applyGender: {м|ж} — автор, [м|ж] — адресат, первая форма мужская, пустая форма допустима. Регулярки трогают любой текст с [..|..] и {..|..}.
  CHANGE: Автобиография: {..} — род рассказчика (authorGender = рассказчик, даже если записывает родственник), [..] не использовать: получателя может не быть, а recipientGender по умолчанию 'm' (schema/authoring.ts:36). Ручной режим: весь текст пишет пользователь, поэтому applyGender нельзя применять к его заголовкам глав и разделов. Либо хранить заголовок раздела в displayText (layout.ts:81 его не склоняет), либо добавить флаг или экранирование.
- src/lib/content/love.ts, parent.ts, friend.ts, kk/love.ts, kk/parent.ts, kk/friend.ts [love 19 глав, parent 11, friend 8]
  WHAT: Банки ChapterDef[]. ru-формулировки: вопрос автору на «вы», заголовок в книге — обращение к адресату на «ты» плюс шаблоны рода. kk: «Сіз» к автору, «сен» к адресату, рода нет, только лексические [..] (kk/parent.ts:3 «бірінші — әке, екінші — ана»).
  CHANGE: Создать src/lib/content/autobiography.ts и src/lib/content/kk/autobiography.ts с одинаковыми ключами глав, тем же числом вопросов в каждой главе и теми же местами эпиграфов и подсказок. Пример набора: intro, roots (род/шежіре), childhood, school, youth, love/family, children, work, home/places, hard, joys, lessons, letter (обращение к потомкам). Вопрос — к рассказчику на «вы», чтобы его мог задать и родственник. Заголовок — от первого лица с {м|ж}: «Где я {родился|родилась}». Супруга называть нейтрально («с супругом или супругой», kk «жұбайыңызбен»). Всего больше 40 вопросов. В kk нет ё/щ/ъ/э, лексический род — через {..}, например {ұлым|қызым}.
- src/lib/content/landings/types.ts, src/lib/content/articles/types.ts [landings 20; articles 28-30]
  WHAT: Landing.theme: ThemeId; Article.theme: ThemeId и bank {author, recipient, perChapter, skip} — подборка вопросов из банка в блоге.
  CHANGE: Если ThemeId станет шире, статья с bank на manual покажет пустую подборку. Сузить тип до темы с банком. Для автобиографии посадочные и статьи можно добавить позже: kniga/page.tsx:64-65 пропускает темы без посадочных.
- src/modules/authoring/infrastructure/adapters.ts [10-24]
  WHAT: contentThemes: ThemeCatalog — get() превращает главы в QuestionTemplate с ключом `${t.id}.${ch.key}.${i+1}`. isTheme в продакшене не вызывается (только tests/doubles/authoring.ts:94).
  CHANGE: Передавать в ThemeOnLanguage kind и политику получателя. Для manual questions=[]. Ключи автобиографии будут вида autobiography.childhood.3, и на них держатся аналитика и CRM (комментарий в content.test.ts:38).
- src/modules/authoring/domain/Book.ts [17-50, 72-90, 102-141, 272-279]
  WHAT: BookProps.theme: string; QuestionTemplate/ThemeOnLanguage; Book.start: title = input.title || theme.titleSuggestions[0], recipientGender = theme.recipientGender ?? input, coverTemplate/interior из темы; switchLanguage сопоставляет titleSuggestions по индексу и возвращает тексты по ключам.
  CHANGE: ThemeOnLanguage дополнить kind и получателем. Book.start должен принимать пустой recipientName для autobiography и manual. Для manual решить, создавать ли стартовую главу и пустой раздел (иначе редактор пустой, см. QuestionsEditor). Если главы хранятся на книге, добавить в BookProps поле chapters и методы addChapter/renameChapter/moveChapter/removeChapter.
- src/modules/authoring/application/services.ts [26-34, 57-61, 139-154]
  WHAT: start(); смена языка через themes.get(book.theme, …); addCustom(bookId, viewer, afterId, prompt) — свой вопрос только после существующего, в ту же главу; deleteCustom удаляет только key='custom'.
  CHANGE: Для ручного режима нужны новые сценарии: добавить, переименовать, переставить и удалить главу; добавить раздел в конкретную главу без afterId (в т.ч. в пустую); задать заголовок в книге отдельно от вопроса-подсказки; переставить раздел. При удалении главы удалять или переносить её разделы. Решить, разрешать ли в автобиографии удалять вопросы банка.
- src/modules/authoring/infrastructure/persistence.ts [29-36, 75-90, 95-101, 103-109]
  WHAT: add: вставляет вопросы только при questions.length>0. insertAfter: сдвиг позиций, chapter = after.chapter, questionKey 'custom', title = prompt, затем перенумерация row_number. deleteCustom. replaceTemplates по ключу.
  CHANGE: Добавить репозиторные методы для разделов ручного режима: вставка в главу по позиции, массовая перестановка (чтобы разделы одной главы шли подряд), удаление главы целиком. Если у раздела нет вопроса-подсказки, prompt NOT NULL нужно чем-то заполнить.
- src/shared/infrastructure/db/schema/authoring.ts [29, 35-36, 71-96]
  WHAT: books.theme text NOT NULL без ограничений (комментарий перечисляет 4 темы); recipient_name по умолчанию '', recipient_gender — 'm'; book_questions.chapter — только ключ, названий глав нет; question_key 'custom' для своих вопросов.
  CHANGE: Миграция drizzle/0035_*: books.chapters jsonb [{key,title,epigraph?}] (сам попадёт в BookLike/BookBundle.book и в contentFingerprint) или таблица book_chapters(book_id,key,title,position). Поправить комментарий к theme. Для theme ограничения нет, значения добавляются без миграции.
- src/lib/book/book-content.ts [11-24]
  WHAT: bookTexts: chapter(key) берётся из theme.chapters, defaultTitle = theme.titleSuggestions[0]. Используется в preview/page.tsx:35, server/spreadSample.ts:28, authoring/domain/stats.ts:19, production/pdf/render.tsx:115 (contentFor → contentFingerprint 122-129) и render.tsx:306 (coverText).
  CHANGE: chapter(key) должен сначала смотреть главы книги (book.chapters), потом банк. Это единая точка для PDF, превью, статистики и отпечатка кэша.
- src/lib/book/layout.ts [80-82, 127-133, 152-176, 213]
  WHAT: questionHeading = displayText ?? applyGender(title). BookTexts. assembleBookContent: порядок глав — по первому вопросу; разделы с одним ключом, идущие не подряд, сливаются в одну главу (Map byChapter); заголовок главы — applyGender(def?.title ?? texts.misc); пустые главы не печатаются.
  CHANGE: Пользовательские названия глав не склонять. При перестановке в ручном режиме держать разделы главы подряд. Порядок глав брать из позиций разделов или из book.chapters.
- src/lib/book/editor-data.ts [12-41]
  WHAT: editorModel: chapterTitle(theme, r.chapter) + g(); g(prompt), g(title); эпиграфы только из theme.chapters.
  CHANGE: Передавать главы книги (название и эпиграф) и не склонять текст пользователя. Пустые главы ручного режима тоже должны попасть в модель, иначе их не показать в редакторе.
- src/lib/book/editor-model.ts, src/lib/book/editor-estimate.ts [editor-model 49, 96-103; editor-estimate 14-24]
  WHAT: EditorBook.theme; groupByChapter группирует только подряд идущие вопросы; editorTexts берёт названия глав из первых вопросов.
  CHANGE: Глава без разделов в этих моделях не существует. Для ручного режима нужен явный список глав в модели редактора.
- src/components/editor/QuestionsEditor.tsx [63, 79-80]
  WHAT: index = min(max(initialIndex,0), length-1); q = questions[index]; useProofread({docId: q.id …}). При пустом списке index=-1, q=undefined, и обращение к q.id роняет страницу.
  CHANGE: Для книги без разделов (manual) показать пустое состояние «Добавьте первую главу/раздел» и не рендерить блок ответа.
- src/app/(app)/books/new/page.tsx [14-37]
  WHAT: Мастер получает getThemes(locale) → WizardTheme (вопросы через countQuestions, подписи получателя, titleSuggestions по языкам, обложка); ?theme= проверяется isThemeId.
  CHANGE: Передавать kind, политику получателя и подписи рассказчика. Для manual вместо числа вопросов показывать другую подпись.
- src/app/(app)/books/new/NewBookWizard.tsx [17-30, 50-97, 114-135, 178]
  WHAT: Экран «Кому будет книга?» — сетка карточек 2×N с «N вопросов». Форма: authorName, authorGender («Я пишу как»), обязательный recipientName (required) и переключатель рода получателя; OccasionPicker по теме.
  CHANGE: Добавить карточки «Автобиография» и «Вручную» (возможно, отдельный блок «Книга о себе / С чистого листа»). Автобиография: «Имя рассказчика», «Рассказчик — мужчина/женщина», переключатель «Пишу сам / записываю за близким» (влияет только на подсказки), необязательное «Для кого», без рода получателя. Manual: получатель необязателен, без выбора рода получателя.
- src/app/(app)/books/actions.ts [17-31, 39-49]
  WHAT: zod: theme refine(isThemeId); recipientName min(1) обязателен; recipientGender по умолчанию 'm'.
  CHANGE: Сделать recipientName условным (superRefine по теме): для autobiography и manual разрешить пустой.
- src/lib/occasions.ts [32-38, 47-48]
  WHAT: themeOccasions: Record<string, OccasionId[]>; на неизвестную тему отдаются все 9 поводов.
  CHANGE: Добавить autobiography: [birthday (юбилей), parents, newyear, other] и manual. Решить, нужен ли повод «юбилей». Тест occasions.test.ts:22-27 проверяет, что на unknown приходят 9 поводов.
- src/i18n/messages/ru/books.ts, src/i18n/messages/kk/books.ts [ru 16, 23-49, 235-238; kk 44, 234-237]
  WHAT: newBookHint «маме, папе или другу»; wizard.whoTitle «Кому будет книга?», recipientFor, genders, errors.recipientName; cover.back.suggestions по теме (Record<string,string[]>, в BackSection.tsx:96 через `?? []`).
  CHANGE: Новые подписи мастера для рассказчика и необязательного получателя, варианты текста оборота для autobiography и manual. Ключи ru и kk должны совпадать (i18n.test.ts:31-35).
- src/i18n/messages/ru/review.ts, kk/review.ts; src/app/admin/reviews/page.tsx; src/components/landing/Reviews.tsx [review 52; admin/reviews 14,121; Reviews 87]
  WHAT: showcase.theme: подписи тем для отзывов (Record<string,string>). Отзыв хранит theme из книги (feedback/infrastructure/adapters.ts:28).
  CHANGE: Добавить «Автобиография» и «Книга с нуля» на ru и kk. Без этого в админке будет виден сырой id, а на лендинге — пустое место.
- src/app/page.tsx [60-61, 203, 253-274]
  WHAT: getThemes; loveCount = countQuestions(themes[0]) для шагов «как это работает»; сетка тем lg:grid-cols-4; meta(вопросы, главы).
  CHANGE: Оставить love первой. 6 карточек не лягут в 4 колонки, а у manual будет «0 вопросов · 0 глав». Нужен фильтр getThemes по kind или отдельная карточка.
- src/app/kniga/page.tsx, src/app/kniga/[slug]/page.tsx, src/app/blog/[slug]/page.tsx [kniga 32, 63-66; kniga/[slug] 53-59, 146; blog 46-57, 146]
  WHAT: Хабы и посадочные: getThemes и theme.chapters для примеров вопросов, countQuestions в заголовках.
  CHANGE: Работают, пока для autobiography и manual нет посадочных. Для посадочной автобиографии примеры возьмутся из банка автоматически.
- src/app/(app)/books/[id]/page.tsx [51-68, 74]
  WHAT: Обзор: прогресс по главам через chapterTitle(theme…) + applyGender; шаг «текст» засчитан при answered>=10.
  CHANGE: Для manual брать названия глав из книги. Порог в 10 ответов под ручной режим не подходит (там несколько длинных разделов).
- src/server/spreadSample.ts [28-32, 60, 72]
  WHAT: Пример разворота: если ответов нет, оглавление и первая глава берутся из theme.chapters.
  CHANGE: Для manual — главы книги, иначе примерный текст из landing.sample.
- src/app/(app)/books/[id]/settings/page.tsx + SettingsForm.tsx; cover/page.tsx + CoverEditor.tsx [settings/page 19, 35-37; SettingsForm 111-120; cover/page 26, 34; CoverEditor 333]
  WHAT: fixedRecipientGender = !!theme.recipientGender; переключатели рода автора и получателя; поле получателя на обложке подписано theme.recipientLabel.
  CHANGE: Для автобиографии подписать «Рассказчик» и скрыть род получателя, поле получателя сделать «Для кого (необязательно)». coverNamesLine (covers/index.ts:120-126) пустого получателя уже обрабатывает.
- src/app/(app)/books/page.tsx, src/app/(app)/books/[id]/layout.tsx, src/app/admin/books/page.tsx, src/app/admin/orders/[id]/page.tsx, src/app/admin/clients/[id]/sections.tsx, src/modules/reporting/infrastructure/Books.ts [books/page 63, 82; [id]/layout 20, 46; admin/books 13, 32, 56-62, 86; admin/orders 120; admin/clients 201; reporting 17, 19]
  WHAT: Показ theme.name/short, фильтр по теме в админке, «автор → получатель», фильтр «ready» = answered>=30.
  CHANGE: Подхватятся через getThemes/getTheme. Проверить строку «Имя → » при пустом получателе и порог 30 ответов для manual.
- src/app/(auth)/actions.ts, src/app/redeem/actions.ts [auth 51-52; redeem 23]
  WHAT: После регистрации — /books/new?theme=… если isThemeId; после активации сертификата — /books/new без темы.
  CHANGE: Новые id пройдут автоматически. Сертификат («подарите маме, папе или бабушке», ru/landing.ts:98) логично вести на ?theme=autobiography.
- src/modules/authoring/domain/readiness.ts [22, 28-29]
  WHAT: Ошибка, если ответов 0; предупреждение «мало», если ответов меньше 10.
  CHANGE: Для manual считать не ответы, а объём (слова или полосы).
- tests/content.test.ts [5, 22-54]
  WHAT: Все темы ru и kk: шаблоны рода раскрываются; >40 вопросов и уникальные ключи глав; паритет ru/kk по ключам, количеству вопросов, эпиграфам и подсказкам; в kk нет ё/щ/ъ/э.
  CHANGE: Исключить manual из проверки «>40» (фильтр по kind). Добавить тест: в банке автобиографии нет [..|..], а {..|..} раскрываются. Для manual проверить chapters=[].
- tests/feedback.test.ts, tests/seo.test.ts, tests/fixtures.test.ts, tests/doubles/authoring.ts, tests/occasions.test.ts, tests/editor-model.test.ts, tests/authoring.test.ts, tests/client-weight.test.ts [feedback 264-273; seo 41; fixtures 151-156; doubles 94; occasions 22-27; editor-model 29-33; authoring 109-133; client-weight 33]
  WHAT: Сочетание обложки и оформления у каждой темы; темы статей известны; fixture «gender» на теме friend; фейковый ThemeCatalog знает только love; поводы; заголовки без шаблонов рода; BooksService.start; каталог тем не должен попасть в клиентский бандл.
  CHANGE: Новые тесты: старт книги autobiography без получателя; старт manual без вопросов; CRUD глав и разделов и их порядок в assembleBookContent; пользовательские [..|..] не меняются; редактор с пустым списком. Хранилище глав держать на сервере, вне клиентского бандла.
- scripts/e2e-*.mjs, scripts/sample-book.ts [e2e-smoke 14; e2e-invite 38-50; e2e-kk 34; e2e-crm 19 и др.]
  WHAT: e2e открывают /register?theme=love|mom|friend и ищут кнопку темы по имени (/Маме/).
  CHANGE: Добавить e2e для двух новых режимов: создание, добавление главы и раздела, предпросмотр, PDF.

## risks
- getTheme (themes.ts:112-118) на неизвестный id молча возвращает love. Если тему не добавить в base, или откатить релиз, когда в базе уже есть книги autobiography/manual, в них появятся главы, эпиграфы и название по умолчанию из love («Наша история» в PDF через book-content.ts:18 и render.tsx:306).
- Названий глав в базе нет: book_questions.chapter хранит только ключ, а chapterTitle/bookTexts ищут по банку. В ручном режиме все главы пользователя станут «Разное» (themes.ts:106 и дубликат messages book.misc), пока не появится хранилище глав и пока его не начнут читать все потребители: editor-data.ts:27, books/[id]/page.tsx:62, layout.ts:172, spreadSample.ts:60/72, превью, PDF, статистика.
- applyGender прогоняет и пользовательский текст: свой вопрос сохраняется с title=prompt (persistence.ts:82), затем editor-data.ts:28-30 и layout.ts:81 подставляют род. Пользователь пишет «Мы [я|брат] …» или «{…|…}» — текст молча искажается. В ручном режиме так будет со всем текстом, включая названия глав (layout.ts:172).
- QuestionsEditor.tsx:63,79-80 падает (q.id у undefined), если в книге 0 вопросов. Книга manual без стартового раздела откроет сломанную страницу «Текст».
- addCustom (services.ts:139-148, API questions/route.ts:7-10) требует afterId существующего вопроса и кладёт новый в ту же главу. Создать раздел в пустой книге или в новой главе нельзя. deleteCustom удаляет только key='custom'.
- assembleBookContent (layout.ts:152-166) сливает разделы с одним ключом главы, даже если они идут не подряд, а groupByChapter в редакторе (editor-model.ts:96-103) их разделяет. Перестановка в ручном режиме, нарушившая непрерывность главы, даст разную структуру в редакторе и в PDF.
- Типобезопасность частичная: только text в themes.ts:26 требует все ThemeId. themeOccasions (occasions.ts:33), cover.back.suggestions (books.ts:235, BackSection.tsx:96 `?? []`) и review.showcase.theme (review.ts:52) имеют тип Record<string,…> и молча вернут пустое или сырой id.
- content.test.ts:30-36 (>40 вопросов) упадёт, если manual с chapters=[] вернётся из getThemes. feedback.test.ts:264-273 упадёт, если defaultInterior не сочетается с defaultCover.
- books/actions.ts:23 требует recipientName min(1), NewBookWizard.tsx:125 — required. Без изменений автобиографию «без получателя» не создать. PATCH /api/books/[id] (route.ts:15) пустой получатель уже разрешает.
- В автобиографии автор книги (authorName/authorGender, видны на обложке) — рассказчик, а владелец аккаунта может быть родственником. Если в банк попадут [..|..], они раскроются по recipientGender='m' по умолчанию (schema/authoring.ts:36) без ошибок.
- В kk-банках род до сих пор передавался только через [..] (адресат). Для автобиографии лексический род рассказчика ({ұлым|қызым}, {әке|ана}) придётся впервые писать через {..}. Паритетный тест этого не проверит, нужна вычитка.
- Ключи вопросов `${theme}.${chapter}.${N}` используются аналитикой и CRM. Менять ключи глав или порядок вопросов автобиографии после запуска нельзя без миграции: replaceTemplates при смене языка работает по ключу.
- switchLanguage (Book.ts:272-279) сопоставляет titleSuggestions по индексу: массивы ru и kk новых тем должны быть одной длины. Названия глав, которые ввёл пользователь, при смене языка не переводятся.
- На лендинге (page.tsx:61) themes[0] считается love: новую тему нельзя ставить первой. Сетка lg:grid-cols-4 (page.tsx:253) под 6 карточек не рассчитана. У manual будет «0 вопросов · 0 глав» и в мастере «0 вопросов».
- Пороги рассчитаны на формат «вопрос-ответ»: readiness.ts:28 (меньше 10 ответов — предупреждение), хаб books/[id]/page.tsx:74 (≥10), reporting Books.ts:17 «ready» (≥30). В ручном режиме с несколькими длинными разделами книга будет выглядеть «недописанной».

## open
- Где хранить главы ручного режима: jsonb books.chapters [{key,title,epigraph?}] (проще, сам попадает в BookBundle.book, BookLike и contentFingerprint) или отдельная таблица book_chapters с позициями?
- Нужен ли в ручном режиме эпиграф главы, который задаёт пользователь, и можно ли скрывать заголовок главы?
- Открывать ли управление главами (переименовать, переставить, удалить, добавить свою главу) и в режимах с банком (автобиография, love/mom/dad/friend) или только в «Вручную»? Можно ли в автобиографии удалять вопросы банка?
- Книга manual создаётся пустой или со стартовой главой и пустым разделом (что заодно снимает падение QuestionsEditor на пустом списке)?
- Автобиография «записывает родственник»: хватит ли вопросов на «вы» к рассказчику и подсказки «запишите от первого лица», или нужен второй набор формулировок в третьем лице (третья ось шаблонов) и поле «кто записывает» в книге?
- Если в автобиографии указан получатель («для детей и внуков»), нужен ли его род? Или получатель — только строка для обложки и посвящения, без [..|..] в банке?
- Нужен ли повод «Юбилей» в occasions (сейчас его нет) для автобиографии? Какие поводы показывать для manual?
- Показывать ли новые режимы на лендинге, в /kniga и в блоге, и вести ли активацию сертификата (redeem/actions.ts:23) сразу в автобиографию?
- Какие обложки и оформление по умолчанию: предложены leather+vintage для автобиографии и linen+classic для ручного режима (обе пары проходят feedback.test)?