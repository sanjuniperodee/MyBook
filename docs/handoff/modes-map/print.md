# print

Как книга становится макетом. BookBundle (книга, вопросы, фото, письма) через buildBookContent (src/lib/book/book-content.ts) превращается в BookContent: это assembleBookContent из layout.ts плюс BookTexts, которые bookTexts берёт из темы и словаря книги. Из одного BookContent получаются три вещи. (1) PDF: InteriorDocument (pdf/interior/index.tsx), его собирает renderInterior в render.tsx за несколько проходов доводки (flow.ts и flow-decisions.ts). (2) HTML-полосы components/interior/pages.tsx. Их используют 3D-книга (book3d/pages.tsx, данные FlipbookData собирает preview/page.tsx), превью редактора (editor/preview/ChapterPages) и развороты InteriorSpread (данные из server/spreadSample.ts). (3) Оценка объёма: estimate.ts, editor-estimate.ts и authoring/domain/stats.ts.
Порядок полос везде одинаковый: титул, оборот титула (колофон), посвящение (если заполнено), оглавление (если включено и есть главы), главы (начальная полоса, текст, фотостраницы), галерея, финал. Затем PDF добивается пустыми полосами в конце до минимума 24 и кратности 4 (formats.ts:28-31, render.tsx:202-205).
Глава — это просто строковый ключ q.chapter. Порядок глав задаёт позиция первого вопроса. Название и эпиграф главы берутся только из темы через BookTexts.chapter(key), а если ключа в теме нет — из словаря («Разное»). Глава, в которой нет ни ответа, ни фото, в книгу не попадает совсем: ни начальной полосы, ни строки в оглавлении.
Раздел — это ContentItem {heading, answer}. heading = displayText ?? applyGender(title). Поля prompt и hint в QuestionLike не входят и не печатаются нигде (PDF, HTML, plainText). Значит, раздел «заголовок плюс текст, без вопроса» вёрстка уже поддерживает. Если заголовка нет, после первого раздела ставится разделитель.
Блок книги про получателя не знает. BookContent.recipientName нигде не печатается, на титуле и в колофоне стоит только authorName. Получатель есть только на обложке: coverNamesLine склеивает «A & B» для лица, корешка (spineParts) и оборота «Лаконично». Вызывается она в 10 местах.
Тема влияет незаметно в нескольких местах. getTheme при неизвестном id молча берёт тему love: её главы и название по умолчанию titleSuggestions[0] («Наша история»). Пустая книга показывает на разворотах любовный пример. На обороте готовые фразы зависят от темы, а подсказка в поле — «о вас двоих». Словарь книги зависит только от языка: «Наши моменты», колофон «написана с любовью», подписи к образцам фото вроде «Просто мы».
Автобиографии вёрстка почти подходит. Нужно зарегистрировать тему с главами и эпиграфами и оставить recipientName пустым, тогда в именах будет только автор. «Для детей и внуков» стоит писать в посвящение, а для пометки «записано со слов» нужно новое поле в колофоне.
Для ручного режима главное — хранить главы отдельно: название, эпиграф, порядок, пустые главы. Сейчас название главы — это текст темы или копия в каждом EditorQuestion, а порядок выводится из позиций вопросов. Нужно расширить BookTexts (название главы и её порядок) и BookBundle.
Объём. Пустая книга: в редакторе 0; в estimatePages 3 полосы (титул, оборот, финал), в печати 24. Глава = 1 + ceil(высота текста / (полоса − 18pt)) + число фотостраниц. Ручная книга из одной главы с коротким разделом: 2 + оглавление 1 + 2 + финал 1 = 6 полос, в печати 24, корешок около 5,6 мм, надпись на нём помещается.
Готовность к заказу: при answered = 0 выдаётся ошибка, при числе ответов меньше 10 — предупреждение «книга короткая». Для ручного режима это нужно переформулировать.

## places
- /Users/sanjuniperodee/MyBook/.claude/worktrees/funny-tesla-gsqj79/src/lib/book/book-content.ts [11-24]
  WHAT: bookTexts: chapter(key) ищет главу в theme.chapters, misc и letters берутся из словаря, defaultTitle = theme.titleSuggestions[0]. buildBookContent — единственная серверная точка сборки: PDF, stats, preview, spreadSample, coverText.
  CHANGE: Принимать хранилище глав книги (название, эпиграф, позиция) и спрашивать его раньше темы. Для ручного режима defaultTitle = book.untitled («Без названия», ключ в словаре уже есть и не используется), а не undefined. Отдавать в BookTexts подписи, зависящие от режима: заголовок галереи, строку колофона и т. п.
- /Users/sanjuniperodee/MyBook/.claude/worktrees/funny-tesla-gsqj79/src/lib/content/themes.ts [19-24, 105-106, 112-118, 124-126, 132-134]
  WHAT: base (4 темы с defaultCover и defaultInterior), miscTitle «Разное». getTheme при неизвестном id молча берёт base[0], то есть love. isThemeId. chapterTitle падает на «Разное».
  CHANGE: Зарегистрировать 'autobiography' (главы «Детство», «Семья», «Работа», «Уроки» с эпиграфами, свои defaultCover и defaultInterior без сердечек, titleSuggestions вроде «История моей жизни») и 'manual' (chapters: [], titleSuggestions непустые или отдельный fallback), иначе новые id получат главы и название love. Убрать молчаливый fallback или логировать его.
- /Users/sanjuniperodee/MyBook/.claude/worktrees/funny-tesla-gsqj79/src/lib/content/types.ts [13-31]
  WHAT: ThemeId = love|mom|dad|friend. ThemeDef требует recipientLabel, recipientPlaceholder, defaultRecipientGender и titleSuggestions.
  CHANGE: Расширить ThemeId. recipientLabel и recipientPlaceholder сделать необязательными либо добавить флаг recipient: 'required'|'optional'|'none'. Для автобиографии — 'optional' или 'none', recipientGender зафиксировать (род получателя не нужен).
- /Users/sanjuniperodee/MyBook/.claude/worktrees/funny-tesla-gsqj79/src/lib/book/layout.ts [43-59, 61-78]
  WHAT: BookContent: title, subtitle, authorName, recipientName (в блоке не печатается), dedication, showToc, chapters, galleryPhotos, year. QuestionLike не содержит prompt и hint, поэтому вопрос не печатается в принципе. BookLike — Pick из Book.
  CHANGE: Добавить в BookContent поля, зависящие от режима: заголовок галереи, строку «записано со слов …» для колофона, при необходимости признак нумерации глав. В BookLike добавить режим и поле «кем записано».
- /Users/sanjuniperodee/MyBook/.claude/worktrees/funny-tesla-gsqj79/src/lib/book/layout.ts [80-82, 152-165]
  WHAT: questionHeading = displayText ?? applyGender(title). Вопрос без ответа и без фото пропускается (154). heading = null при hideHeading, иначе printableText(heading); пустая строка тоже значит «без заголовка».
  CHANGE: Заголовок раздела в ручном режиме хранить в displayText: он обходит applyGender, и фигурные или квадратные скобки пользователя не испортятся. Пустой заголовок или hideHeading уже дают разделитель — менять ничего не нужно.
- /Users/sanjuniperodee/MyBook/.claude/worktrees/funny-tesla-gsqj79/src/lib/book/layout.ts [143-177]
  WHAT: Порядок глав (chapterOrder) — по позиции первого вопроса. Вопросы одной главы, идущие не подряд, сливаются в одну главу. Название главы: applyGender(def?.title ?? texts.misc), без printableText. Пустая строка "" через ?? проходит. Номер главы — i+1 среди печатаемых.
  CHANGE: Для ручного режима сортировать chapterOrder по позиции главы из хранилища. Название главы пропускать через printableText (эмодзи в PDF превращаются в мусор) и без applyGender для пользовательского текста. Пустое название заменять на t.chapter(n) или «Без названия». Решить, печатать ли пустую главу (сейчас она исчезает).
- /Users/sanjuniperodee/MyBook/.claude/worktrees/funny-tesla-gsqj79/src/lib/book/layout.ts [179-207, 213]
  WHAT: Фото без вопроса раскладываются по главам равномерно по индексу или уходят в галерею (end или нет глав). Письма — последняя глава с ключом LETTERS_CHAPTER='__letters', заголовок раздела «Имя, кем приходится». title = printableText(book.title) || texts.defaultTitle.
  CHANGE: Ключи глав ручного режима не должны совпадать с '__letters' и '__gallery'. Если defaultTitle для темы manual окажется undefined, content.title станет undefined: нужен гарантированный fallback.
- /Users/sanjuniperodee/MyBook/.claude/worktrees/funny-tesla-gsqj79/src/lib/book/estimate.ts [82-94, 118-122, 125-134]
  WHAT: headingHeight: без заголовка — разделитель, у первого раздела главы 0. estimateChapterPages = 1 (начальная полоса) + ceil(высота / (полоса − 18pt)) + фотостраницы. estimatePages = 2 (титул + оборот) + посвящение + ceil(глав/18) на оглавление + главы + галерея (1 + стр.) + 1 (финал).
  CHANGE: Логику менять не нужно: раздел без вопроса считается как ответ с заголовком или без. Если пустые главы ручного режима будут печататься (только начальная полоса), добавлять для них 1 полосу и в PDF, и здесь, и в planFaces синхронно. Пустая книга: 3 полосы, в печати 24.
- /Users/sanjuniperodee/MyBook/.claude/worktrees/funny-tesla-gsqj79/src/lib/book/editor-estimate.ts [14-24, 26-40]
  WHAT: editorTexts берёт названия глав из q.chapterTitle; misc, letters и defaultTitle пустые (на объём не влияют). Пока печатать нечего, счётчик = 0 (38).
  CHANGE: Если для ручного режима понадобится глава без разделов, пропускать её через assembleBookContent отдельно: сейчас она не попадёт в счёт. В остальном оценка от темы не зависит.
- /Users/sanjuniperodee/MyBook/.claude/worktrees/funny-tesla-gsqj79/src/lib/book/editor-model.ts [10-21, 35-52, 86-89, 95-120]
  WHAT: EditorQuestion хранит chapterTitle в каждом вопросе. EditorBook.theme, authorGender и recipientGender. editorHeading = hideHeading ? null : displayText ?? defaultTitle. groupByChapter группирует подряд идущие вопросы. previewChapters показывает только главы с ответами плюс текущий вопрос; эпиграф берётся по ключу.
  CHANGE: Для ручного режима добавить отдельный список глав (key, title, epigraph, position) в модель редактора: без него не показать пустую главу и не переименовать главу разом. Следить, чтобы разделы одной главы шли подряд по position, иначе groupByChapter покажет две группы, а PDF сольёт их в одну.
- /Users/sanjuniperodee/MyBook/.claude/worktrees/funny-tesla-gsqj79/src/lib/book/editor-data.ts [21-42]
  WHAT: editorModel: getTheme(book.theme); chapterTitle(theme, key) пропускается через applyGender; эпиграфы только из theme.chapters; isCustom = questionKey === 'custom'.
  CHANGE: Названия и эпиграфы глав брать из хранилища глав книги, если оно есть, а тему использовать как запасной вариант. Для ручного режима ввести свой questionKey ('section'), чтобы аналитика не путала разделы с собственными вопросами.
- /Users/sanjuniperodee/MyBook/.claude/worktrees/funny-tesla-gsqj79/src/lib/book/flipbook.ts [42-61]
  WHAT: planFaces: title, colophon, [dedication], [toc, если есть главы], у каждой главы начальная полоса + текст + фото, галерея, end, blank до чётности. Глава с textPages = 0 всё равно получает начальную полосу.
  CHANGE: Если пустые главы ручного режима будут печататься, здесь это уже работает (opener без текста). Синхронизировать с PDF index.tsx:30-34 и estimate.
- /Users/sanjuniperodee/MyBook/.claude/worktrees/funny-tesla-gsqj79/src/lib/book/formats.ts [28-31, 55-63]
  WHAT: minPages = 24, pageMultiple = 4. printablePageCount = max(raw, 24) с округлением вверх до кратного 4. Корешок = страниц/2 × 0,13 + 4 мм (на 24 страницах 5,56 мм, надпись есть: spineFontMm ≥ 5 мм).
  CHANGE: Без изменений. Ручная или пустая книга печатается минимум на 24 полосы, хвост пустых страниц стоит после «Продолжение следует…».
- /Users/sanjuniperodee/MyBook/.claude/worktrees/funny-tesla-gsqj79/src/lib/book/covers/index.ts [120-126]
  WHAT: coverNamesLine(author, recipient, hide): «A & B»; если получатель пустой или скрыт — только автор. Вызывается в 10 местах: render.tsx:310, cover-back.ts:317, preview/page.tsx:37, CoverEditor.tsx:149, books/page.tsx:74, [id]/layout.tsx:37, [id]/page.tsx:108, checkout/page.tsx:61, orders/[id]/sections.tsx:173, review/[orderId]/page.tsx:50.
  CHANGE: Заменить на coverNames(book), который учитывает режим: для автобиографии всегда только автор, даже если recipientName заполнен («для детей и внуков»), иначе выйдет «Иван Петров & Детям и внукам». Для ручного режима — как сейчас (необязательный второй человек).
- /Users/sanjuniperodee/MyBook/.claude/worktrees/funny-tesla-gsqj79/src/lib/book/book-model.ts [120-134]
  WHAT: spineParts(title, names): на корешке название и имена делят место поровну; без имён название стоит по центру.
  CHANGE: Не трогать: для автобиографии и ручного режима names = автор либо пусто.
- /Users/sanjuniperodee/MyBook/.claude/worktrees/funny-tesla-gsqj79/src/lib/book/cover-back.ts [22-32, 185-204, 307-321]
  WHAT: BackContent: signature = authorName («— Имя» под цитатой и письмом), names = coverNamesLine (комментарий «Асель и Гульнара»), год повода или текущий. namesItems печатает имена и год в варианте «Лаконично» и в фото без текста.
  CHANGE: backContent должен брать имена через coverNames(book) с учётом режима. Подпись автором для автобиографии корректна (рассказчик). Если запись ведёт родственник, подписью всё равно остаётся рассказчик, отдельное поле не нужно.
- /Users/sanjuniperodee/MyBook/.claude/worktrees/funny-tesla-gsqj79/src/modules/production/infrastructure/pdf/render.tsx [40-46, 114-129, 132-148, 197-211, 305-312]
  WHAT: BookBundle {book, questions, photos, letters}. contentFor → buildBookContent. contentFingerprint (sha1 JSON содержимого + LAYOUT_VERSION = 4). plainText (рукопись): название, подзаголовок, автор, посвящение, «ГЛАВА N. НАЗВАНИЕ», заголовок и ответ, вопросов нет. Добивка до printablePageCount, setTitle и setAuthor. coverText: title из buildBookContent(book, [], []), то есть фолбэк темы, и names из coverNamesLine.
  CHANGE: Добавить в BookBundle главы книги (и в authoring.queries.bundle), передавать их в buildBookContent. coverText перевести на coverNames(book). Если меняются правила печати (пустые главы, подписи), поднять LAYOUT_VERSION. plainText в остальном подходит обоим режимам.
- /Users/sanjuniperodee/MyBook/.claude/worktrees/funny-tesla-gsqj79/src/modules/production/infrastructure/pdf/cover.tsx [77-91, 113-140]
  WHAT: Лицо: [имена], орнамент (только если есть names), название, подзаголовок, [имена] — порядок по template.namesFirst. Корешок: spineParts(title, names), повёрнут на 90°, кегль от ширины корешка. Сердечко в орнаменте задаётся шаблоном (например, tenderness).
  CHANGE: Код не менять: всё определяется text.names. Для автобиографии подбирать defaultCover темы без орнамента heart.
- /Users/sanjuniperodee/MyBook/.claude/worktrees/funny-tesla-gsqj79/src/modules/production/infrastructure/pdf/interior/index.tsx [23-41]
  WHAT: Порядок полос PDF. Посвящение — если content.dedication; Toc — если showToc и есть главы. Для каждой главы: Opener, ChapterBody (только при items.length), PhotoPage. Галерея: Opener с ключом '__gallery' и названием t.gallery («Наши моменты»). EndPage.
  CHANGE: Заголовок галереи брать из BookContent (режим), а не t.gallery: для автобиографии «Из семейного альбома», для ручного «Фотографии». Если печатать пустые главы ручного режима, Opener без ChapterBody уже работает.
- /Users/sanjuniperodee/MyBook/.claude/worktrees/funny-tesla-gsqj79/src/modules/production/infrastructure/pdf/interior/title-page.tsx [15-23]
  WHAT: Титул: название, подзаголовок, виньетка, authorName прописными, год. Получателя нет.
  CHANGE: Для автобиографии подходит как есть: рассказчик — автор. При желании добавить строку «Записано со слов … / записал(а) …» под автором — новое поле в BookContent.
- /Users/sanjuniperodee/MyBook/.claude/worktrees/funny-tesla-gsqj79/src/modules/production/infrastructure/pdf/interior/colophon.tsx [16-19]
  WHAT: Оборот титула: t.copyright(year, authorName) («© 2026 Имя. Все права защищены.») и t.colophon(brand) («написана с любовью и напечатана в единственном экземпляре»).
  CHANGE: Сюда логичнее всего поставить «Воспоминания записаны со слов автора. Записал(а): …» для автобиографии. То же нужно в HTML ColophonPage (components/interior/pages.tsx:170-183) и в FlipbookData.
- /Users/sanjuniperodee/MyBook/.claude/worktrees/funny-tesla-gsqj79/src/modules/production/infrastructure/pdf/interior/dedication.tsx [8-18]
  WHAT: Посвящение — произвольный текст курсивом по центру на отдельной полосе.
  CHANGE: Без изменений. Для автобиографии это место для «Моим детям и внукам» вместо recipientName; плейсхолдер в PagesEditor (ru/books.ts:141 «Моему самому близкому человеку») сделать зависящим от режима.
- /Users/sanjuniperodee/MyBook/.claude/worktrees/funny-tesla-gsqj79/src/modules/production/infrastructure/pdf/interior/toc.tsx [13-14, 30-38]
  WHAT: Оглавление: «N. Название главы …… стр.», плюс строка галереи без номера (t.gallery). Номера страниц приходят из onChapterPage первого прохода.
  CHANGE: Заголовок галереи — из BookContent. Длинные названия пользовательских глав ограничены maxWidth, но ограничение длины при вводе всё равно нужно.
- /Users/sanjuniperodee/MyBook/.claude/worktrees/funny-tesla-gsqj79/src/modules/production/infrastructure/pdf/interior/opener.tsx [44-65, 71-98]
  WHAT: Начальная полоса главы: ChapterMark («Глава N» или крупная цифра по дизайну), название (noHyphens, maxWidth), виньетка, эпиграф. Невидимый Text сообщает onChapterPage(chapterKey, pageNumber) для оглавления.
  CHANGE: Если в ручном режиме нужна глава без номера, number = null уже поддержан (так рисуется галерея). Очень длинное название может вытолкнуть содержимое на вторую полосу и сдвинуть оглавление и оценку: ограничить длину (около 60–80 знаков).
- /Users/sanjuniperodee/MyBook/.claude/worktrees/funny-tesla-gsqj79/src/modules/production/infrastructure/pdf/interior/entry.tsx [16-62, 95-105]
  WHAT: Entry: если есть item.heading — Heading (с акцентной линейкой по дизайну); иначе у второго и следующих разделов Divider («* * *», глиф или линейка). Капитель у первого раздела главы.
  CHANGE: Ручной режим ложится без изменений: заголовок раздела печатается как heading, раздел без заголовка — разделителем, вопрос-подсказка не печатается.
- /Users/sanjuniperodee/MyBook/.claude/worktrees/funny-tesla-gsqj79/src/modules/production/infrastructure/pdf/interior/chapter-body.tsx [23-35]
  WHAT: Текст главы: колонтитул, колонцифра, разделы, концовка (если её не сняла доводка).
  CHANGE: Без изменений.
- /Users/sanjuniperodee/MyBook/.claude/worktrees/funny-tesla-gsqj79/src/modules/production/infrastructure/pdf/interior/running-head.tsx [18-19]
  WHAT: На чётных полосах колонтитул — название книги, на нечётных — название главы (одна строка с многоточием).
  CHANGE: Без изменений, но при пустом названии книги ручного режима на чётных полосах будет пусто или fallback: нужен гарантированный content.title.
- /Users/sanjuniperodee/MyBook/.claude/worktrees/funny-tesla-gsqj79/src/modules/production/infrastructure/pdf/interior/end-page.tsx [15-19]
  WHAT: Финальная полоса: виньетка, t.theEnd («Продолжение следует…»), год.
  CHANGE: Решить текст для автобиографии (оставить или заменить, например на «Спасибо, что прочитали»). Если меняется — брать из BookContent, а не из словаря.
- /Users/sanjuniperodee/MyBook/.claude/worktrees/funny-tesla-gsqj79/src/modules/production/infrastructure/pdf/flow.ts [20, 46-50]
  WHAT: Метка доводки `<вид>:<id>`, у концовки `t:<ключ главы>`. parseMark делает split(':') и берёт [1].
  CHANGE: Ключи пользовательских глав генерировать без ':' (uuid). Иначе решение noTail привяжется к обрезанному ключу. ChapterPages.tsx:183 тоже собирает pageId как `${ch.key}:${k}`.
- /Users/sanjuniperodee/MyBook/.claude/worktrees/funny-tesla-gsqj79/src/i18n/messages/ru/book.ts [3-16]
  WHAT: Подписи, которые печатаются в книге (зависят только от языка): «Глава N», «Содержание», gallery «Наши моменты», samplePhotos «Наше первое лето / Тот самый день / Просто мы», misc «Разное», letters «Письма близких» / «Слова тех, кто любит вас», copyright, colophon «написана с любовью», theEnd, untitled «Без названия» (не используется, комментарий устарел). Казахская версия — kk/book.ts:4-15.
  CHANGE: Добавить варианты для режимов (galleryByMode, colophon для записи со слов, samplePhotos для автобиографии) на обоих языках, сохраняя тип typeof ru. untitled использовать как название по умолчанию в ручном режиме.
- /Users/sanjuniperodee/MyBook/.claude/worktrees/funny-tesla-gsqj79/src/components/interior/pages.tsx [69-107, 149-240, 246-292]
  WHAT: HTML-двойники PDF-полос: ChapterMark, OpenerPage, TitlePage (author), ColophonPage (copyright и colophon из bookMessagesFor(language)), DedicationPage (плейсхолдер), TocPage, EndPage (theEnd из словаря), TextPage (heading, иначе Divider, строки 278-283).
  CHANGE: Те же правки, что в PDF: строка «записано со слов» в ColophonPage и TitlePage, подписи по режиму вместо bookMessagesFor, где это нужно. Иначе 3D-книга и PDF разойдутся.
- /Users/sanjuniperodee/MyBook/.claude/worktrees/funny-tesla-gsqj79/src/components/interior/InteriorSpread.tsx [15-46, 70-93]
  WHAT: SpreadSample (title, author, dedication, chapter, entries, toc, photos). samplePhotos: заглушки с романтическими подписями из словаря.
  CHANGE: Передавать подписи примеров по режиму. Для автобиографии и ручного режима подписи «Просто мы» и «Наше первое лето» не подходят.
- /Users/sanjuniperodee/MyBook/.claude/worktrees/funny-tesla-gsqj79/src/server/spreadSample.ts [28-32, 47-49, 54-60, 70-72]
  WHAT: Развороты «Страницы» и «Обложка». Пока ответов нет, показывается пример из landing.sample — любовная история («Как мы познакомились», Кок-Тобе; ru/landing.ts:252-288). Оглавление — главы темы, первая глава — theme.chapters[0] или sample.chapterTitle.
  CHANGE: Для автобиографии нужен свой пример (детство, первый от лица рассказчика). Для ручного — главы и разделы из хранилища, а при пустой книге нейтральный пример («Глава 1» и заглушка текста), без любовного сюжета.
- /Users/sanjuniperodee/MyBook/.claude/worktrees/funny-tesla-gsqj79/src/components/book3d/pages.tsx [31-47, 62-93, 131-142]
  WHAT: FlipbookData: cover.names, author, dedication, главы с entries, gallery.title. FaceView: титул и колофон с data.author; TOC только по главам, без галереи (в PDF галерея в оглавлении есть). Галерея с number = null. usePagedBook → planFaces.
  CHANGE: Добавить в FlipbookData поле «записано со слов» и подписи по режиму. Гонять через FaceView так же, как PDF. Попутно добавить галерею в оглавление 3D, чтобы совпадало с PDF.
- /Users/sanjuniperodee/MyBook/.claude/worktrees/funny-tesla-gsqj79/src/app/(app)/books/[id]/preview/page.tsx [35-70]
  WHAT: Собирает FlipbookData из buildBookContent: names = coverNamesLine (37); cover.title = book.title без фолбэка (41), в 3D при пустом названии стоит «…», а в PDF — название темы по умолчанию; gallery.title = messagesFor(...).book.gallery (69).
  CHANGE: names — через coverNames(book). Галерею — из content. cover.title привести к content.title, иначе в ручном режиме с пустым названием 3D и PDF разойдутся.
- /Users/sanjuniperodee/MyBook/.claude/worktrees/funny-tesla-gsqj79/src/components/book3d/BookViewer3D.tsx [526, 543]
  WHAT: Лицо 3D-обложки — CoverText с data.cover.title и names; корешок — CoverSpineText(title || data.title, names). То же в BookViewerGL.tsx:242-246 и webgl/cover-faces.tsx.
  CHANGE: Отдельных правок не нужно, если names и title приходят уже с учётом режима.
- /Users/sanjuniperodee/MyBook/.claude/worktrees/funny-tesla-gsqj79/src/app/(app)/books/[id]/cover/CoverEditor.tsx [59-60, 149, 155-162, 331-347]
  WHAT: names = coverNamesLine(state…). backContent подписывается автором. Поля: название, подзаголовок, «Ваше полное имя», поле получателя с меткой theme.recipientLabel и чекбоксом «Не отображать на обложке». BackSection получает theme.
  CHANGE: Автобиография: скрыть поле получателя и чекбокс; подпись поля автора — «Имя рассказчика (героя книги)»; при необходимости поле «Кто записывал». Ручной режим: получатель необязателен, нейтральная метка («Для кого — необязательно»). cover/page.tsx:26,34 берёт recipientLabel из getTheme — учесть отсутствие метки.
- /Users/sanjuniperodee/MyBook/.claude/worktrees/funny-tesla-gsqj79/src/app/(app)/books/[id]/cover/BackSection.tsx [96]
  WHAT: Готовые фразы оборота: t.suggestions[theme] ?? [] (ru/books.ts:234-238, только love, mom, dad, friend). Плейсхолдеры «Фраза, которая о вас двоих» (221), minimalNote «ваши имена» (228).
  CHANGE: Добавить suggestions.autobiography («Жизнь, рассказанная для тех, кого я люблю» и т. п.) и, возможно, manual. Плейсхолдеры и minimalNote сделать зависящими от режима (единственное число).
- /Users/sanjuniperodee/MyBook/.claude/worktrees/funny-tesla-gsqj79/src/modules/authoring/domain/stats.ts [18-24]
  WHAT: answered = вопросы с текстом, total = все вопросы, estimatedPages, printedPages.
  CHANGE: В ручном режиме total — это созданные пользователем разделы, и прогресс «x из y» теряет смысл. Показывать число разделов или слов.
- /Users/sanjuniperodee/MyBook/.claude/worktrees/funny-tesla-gsqj79/src/modules/authoring/domain/readiness.ts [22, 27-31]
  WHAT: answered === 0 — ошибка «нет ни одного ответа», заказ заблокирован. Пустой authorName — предупреждение «Не указано ваше имя». Меньше 10 ответов — «книга короткая». Меньше 24 полос — предупреждение о пустых страницах.
  CHANGE: Тексты по режиму: «нет ни одного раздела», «не указано имя рассказчика». Порог «<10 ответов» для ручного режима заменить на порог по полосам или словам.
- /Users/sanjuniperodee/MyBook/.claude/worktrees/funny-tesla-gsqj79/src/modules/authoring/infrastructure/persistence.ts [29-36, 76-90]
  WHAT: add копирует вопросы темы с position и chapter. insertAfter создаёт собственный вопрос в главе соседа с title = prompt (заголовком в книге становится текст вопроса) и перенумеровывает позиции.
  CHANGE: Для ручного режима нужны операции: создать, переименовать, переставить и удалить главу (новое хранилище); создать раздел в пустой главе (сейчас раздел можно вставить только «после» существующего); переносить разделы между главами с сохранением непрерывности позиций.
- /Users/sanjuniperodee/MyBook/.claude/worktrees/funny-tesla-gsqj79/src/shared/infrastructure/db/schema/authoring.ts [29, 33-37, 71-96]
  WHAT: books.theme — текст (комментарий: love|mom|dad|friend), recipientName и recipientGender NOT NULL с default. book_questions: chapter text, questionKey, prompt NOT NULL, title NOT NULL, hint, displayText, hideHeading. Таблицы глав нет.
  CHANGE: Нужна таблица book_chapters (id, book_id, key, position, title, epigraph) или jsonb books.chapters, иначе пустые главы, порядок глав и их переименование не хранятся. Для автобиографии — поле «кем записано» (например, books.recorded_by). Для раздела ручного режима: prompt = подсказка или '', заголовок — в display_text.
- /Users/sanjuniperodee/MyBook/.claude/worktrees/funny-tesla-gsqj79/src/components/editor/preview/ChapterPages.tsx [117-131, 182]
  WHAT: Превью главы в редакторе: QuestionHeading или Divider, как в PDF; OpenerPage с epigraph из epigraphs[key].
  CHANGE: Без изменений, кроме источника названий и эпиграфов для ручного режима.

## risks
- getTheme (themes.ts:112-118) при неизвестном id молча берёт тему love. Если добавить 'autobiography' или 'manual' в books.theme, не зарегистрировав их в base и text, то bookTexts, editorModel, spreadSample и contentThemes возьмут главы, эпиграфы и название «Наша история» от love. Совпадающие ключи глав ('intro', 'you', 'childhood' в parent) получат чужие названия.
- Тема manual с titleSuggestions: [] даёт defaultTitle = undefined (book-content.ts:18), и content.title станет undefined (layout.ts:213). Пострадают doc.setTitle (render.tsx:210), титул, колонтитул и coverText; Book.start (Book.ts:113) запишет пустое название.
- Названия пользовательских глав не проходят printableText (layout.ts:172): эмодзи печатаются в PDF мусором. Они проходят applyGender, поэтому конструкции {a|b} и [a|b] в тексте пользователя заменятся. Пустое название "" не ловится оператором ??, и получится начальная полоса без названия и пустая строка в оглавлении.
- Пустая глава (без ответов и фото) исчезает из книги и превью без предупреждения (layout.ts:154-158, editor-model.ts:117). Пользователь ручного режима может этого не ожидать. При удалении главы из хранилища её разделы напечатаются под «Разное».
- Если разделы одной главы стоят по position не подряд, PDF сольёт их в одну главу на месте первого появления (layout.ts:155-158), а редактор (groupByChapter) покажет две группы. Перестановка глав и разделов должна перенумеровывать позиции целиком.
- Ключ главы с символом ':' ломает разбор меток доводки (flow.ts:48) и pageId превью. Ключи '__letters' и '__gallery' зарезервированы.
- Очень длинное название пользовательской главы переполнит начальную полосу. react-pdf перенесёт часть на следующую полосу, и разъедутся номера в оглавлении, оценка estimate и planFaces 3D. Нужен лимит длины.
- coverNamesLine вызывается в 10 местах. Если в автобиографии хранить «для детей и внуков» в recipientName, на лице, корешке и обороте появится «Иван Петров & Детям и внукам». Вызовы нужно централизовать в coverNames(book).
- Подписи книги зависят только от языка: bookMessagesFor(locale) и messagesFor(lang).book в pdf/interior/kit.ts:80 и components/interior/*. «Наши моменты», колофон и теми же словами примеры фото нельзя поменять по режиму, не протащив режим или подписи через BookContent. Если поменять только в PDF, 3D-книга и PDF разойдутся.
- Тесты: tests/content.test.ts:30-36 требует больше 40 вопросов в каждой теме и проверяет шаблоны рода. Тема manual без вопросов этот тест уронит. Характеристические снимки (tests/characterization/content, pages, editor-estimate) должны остаться прежними для старых книг. При изменении печати нужно поднять LAYOUT_VERSION (render.tsx:119).
- Вне вёрстки, но с влиянием на неё. Создание книги требует isThemeId и recipientName.min(1) (books/actions.ts:19-23), и автобиография без получателя не создастся. Приглашение к письмам говорит «книга-сюрприз — её получит …» (letter-share.ts:2, letters/[token]/page.tsx:21-49) — для автобиографии это неверно. Подписи писем в книге при этом корректны.
- Уже существующее расхождение станет заметнее в ручном режиме. 3D-обложка показывает сырое book.title с «…» (preview/page.tsx:41), а PDF — content.title с фолбэком темы. Оглавление в 3D не содержит галерею (book3d/pages.tsx:74), а в PDF содержит (toc.tsx:14).

## open
- Как хранить режим: новыми значениями books.theme ('autobiography', 'manual') — это меньше всего правок, потому что всё завязано на getTheme, — или отдельной колонкой mode с сохранением theme?
- Автобиография: куда идёт «для детей и внуков» — только в посвящение, отдельной строкой на обложке («Для моих внуков») или в recipientName со скрытием из имён?
- Нужно ли печатать, кто записывал воспоминания («Записано со слов автора: внук Алихан»), и где: на титуле, в колофоне или нигде? Нужно новое поле в books.
- Чей род подставлять в автобиографии: authorGender = рассказчика (текст от первого лица героя), recipientGender зафиксировать — так? Запрещать ли в банке вопросов автобиографии синтаксис [он|она]?
- Ручной режим: печатать ли главу без разделов как отдельную начальную полосу (шмуцтитул или «часть»), или она не попадает в книгу, как сейчас? Нужны ли опция «без номеров глав» и эпиграф у пользовательской главы?
- Ручной режим: название книги обязательно, или по умолчанию «Без названия» (book.untitled)?
- Подписи служебных полос для новых режимов: заголовок галереи вместо «Наши моменты», финал «Продолжение следует…», колофон «написана с любовью» — оставить или заменить по режиму?
- Доступны ли «Письма близких» (приглашение по ссылке) в автобиографии и в ручном режиме, и каким текстом приглашать?