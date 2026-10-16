# Критика спецификации режимов книги (17.10, ~01:00)

Состязательная проверка `docs/features/book-modes.md` по коду. Поправки — к реализации (решения владельца не оспариваются). Брифу `workflows/mybook-book-modes-*.js` они передавались по зонам (`area`); при перезапуске подставь их из этого файла.

Всего поправок: 30

## 1. Гонка операций оглавления: нужна блокировка строки книги — зона: foundation

**Проблема.** §2 обещает только uow.run + loadBook(editable). При READ COMMITTED два параллельных addSection/reorderSections (две вкладки, телефон и ноутбук, клиент и сотрудник) читают снимок до коммита соседа: row_number даёт дубли позиций, проверка «тот же набор id/ключей» и лимиты (≤50 глав, MAX_QUESTIONS=600) проходят обе. Кроме того, lockForOrder (persistence.ts) может закрыть книгу между loadBook и записью. В репозитории уже есть образец: for("update") в DrizzleOrderRepository.ts:100 и DrizzleDealInvoiceRepository.ts:58.

**Поправка.** В BookRepository.findById добавить параметр { lock?: boolean } (select … for update), а в loadBook — опцию lock. Все методы BookOutlineService, а также addCustom/deleteCustom и новый addSection сначала берут книгу с lock: true, и уже под блокировкой проверяют editable, лимиты и набор. Лимиты: chaptersLimit (≤50) и questionsLimit; addChapter при 600 разделах падает целиком, без «главы без раздела». Интеграционный тест: Promise.all из 5 addSection и 2 reorderSections, после него позиции 0..N-1 без дублей, а лимит не превышен.

## 2. Автосохранение зависает на удалённом разделе (404), и flush блокирует операции оглавления — зона: editor

**Проблема.** sendDraft (components/editor/questions/draft.ts) при первой ошибке возвращает в очередь упавшую правку и все следующие. Если раздел удалили в другой вкладке или на телефоне, PATCH отвечает 404 questionNotFound. Такая правка навсегда остаётся в очереди, индикатор показывает ошибку, правки после неё не уходят. По §2 перед удалением и перестановкой нужен flush, а он теперь бросает исключение, и в этой вкладке ломаются все операции оглавления. Отложенное переименование главы, удалённой в другом окне, попадёт в ту же ловушку.

**Поправка.** В sendDraft ApiError с code questionNotFound/chapterNotFound считать окончательной: правку выбросить, отправку продолжить, один раз показать toast «Раздел удалён в другом окне» и сделать router.refresh(). Переименование и эпиграф главы с задержкой держать во второй очереди того же useAutosave, чтобы flush(), уход со страницы и размонтирование отправляли обе. Тест в tests/editor-draft.test.ts: 404 посередине пачки не блокирует остальные правки и не возвращается в очередь.

## 3. Удаление раздела через существующий DELETE не перенумеровывает позиции и не шлёт событие — зона: foundation

**Проблема.** §2 говорит «удаление раздела — существующий DELETE», а §1.6 требует перенумерации после каждой операции. QuestionsService.deleteCustom работает без uow, не делает books.touch, не перенумеровывает (persistence.ts deleteCustom) и не отправляет book_progressed. После удаления позиции идут с дыркой, firstEmpty в письмах (notifications/persistence.ts:10, templates.ts:17,105) указывает не туда, вехи CRM по словам не пересчитываются. Тот же дефект уже есть у своих вопросов в книгах-подарках.

**Поправка.** Переписать deleteCustom: uow.run, loadBook с lock, удаление, перенумерация тем же SQL, что и для оглавления (для книг с банком по (position, created_at)), books.touch и событие bookProgressed, если у удалённого раздела был текст. Правило «удалять можно custom» оставить. Для blank все разделы custom, отдельного пути не нужно.

## 4. Фото удалённого раздела не уходят в галерею, а у вставленных остаётся inline — зона: print

**Проблема.** §2: «фото отвязываются по FK и уходят в общую галерею». На самом деле assembleBookContent (layout.ts, блок innerPhotos) при photoPlacement='chapters' равномерно раскладывает фото без вопроса по чужим главам и в галерею кладёт их только при 'end' или когда глав нет. Так что фото удалённой главы окажутся на фотостраницах соседних глав и сдвинут их вёрстку. FK SET NULL не сбрасывает photos.inline, и бывшее фото «в тексте» сохраняет оформление вставки.

**Поправка.** Решение владельца не трогаем: фото не удаляются. В deleteChapter/удалении раздела в той же транзакции до DELETE выполнить update photos set question_id = null, inline = null where question_id in (…). Текст диалога (ru/kk) исправить на «Фото раздела останутся в книге среди общих фото (вкладка «Фото»)». В confirmDialog показывать число разделов, слов и фото, которые затронет удаление, danger: true. Интеграционный тест: удаление главы с фото, у фото question_id и inline равны null, а книга собирается.

## 5. progressOf нельзя вызвать из SQL: CRM-фильтры, дашборд и письма разойдутся — зона: foundation

**Проблема.** По §3.1 progressOf используют фильтр «почти готовы» в /admin/books, дашборд, воронка и автописьма. Но это SQL: reporting/infrastructure/Books.ts:17 (answered>=30), Dashboard.ts:41 (>=10 внутри count), notifications/infrastructure/persistence.ts (answered, firstEmpty), sales/infrastructure/adapters.ts:84 (sqlBookProgress), queries.userBooks. Слова в SQL сейчас нигде не считаются, а в JS их считают двумя копиями: layout.countWords и stats.ts:21.

**Поправка.** Пороги вынести константами в kinds.ts (BANK_TEXT_STEP=10, BANK_READY=25, BLANK_TEXT_WORDS=1000, BLANK_HALF_WORDS=1500, BLANK_READY_WORDS=3000). В src/shared/infrastructure/db/bookProgress.ts сделать SQL-фрагменты: wordsSql(bookId) = sum(case when btrim(answer)='' then 0 else array_length(regexp_split_to_array(btrim(answer), '\s+'),1) end) и readySql/halfSql/textStepSql(theme, answered, words, total) через case when theme='blank'. Использовать их во всех перечисленных местах. stats.ts перевести на countWords. Интеграционный тест: на наборе книг (gift, autobiography, blank, с NBSP и переводами строк) SQL-фрагменты дают тот же результат, что progressOf.

## 6. book_progressed по «корзинам» по 150 слов запаздывает, а «готова» пропускает «половину» — зона: crm

**Проблема.** Пороги blank (1000/1500/3000) не кратны 150, а корзина считается по разделу, а не по книге. Книга может пересечь 1000 слов, пока ни один раздел не сменил корзину, и событие придёт только через сотню-другую слов. Question не знает тему, поэтому корзины начнут слать события и для книг-подарков. В FunnelService.bookProgressed (sales/application/services.ts:345) веха book_half проверяется до book_ready, после book_ready срабатывает return. У love (172 вопроса, половина = 86 ответов) и у автобиографии (≥60 вопросов, половина ≥30) готовность наступает при 25 ответах, раньше «половины», и book_half не наступает никогда.

**Поправка.** Событие для blank отправлять из QuestionsService.edit: после save одним запросом wordsSql получить сумму слов книги, «до» вычислить как after − new + old и отправить bookProgressed, если пересечён любой порог progressOf. Отправлять событие также из addSection/deleteChapter/удаления раздела с текстом. Корзины в Question не добавлять. В progressOf гарантировать монотонность: ready ⇒ half ⇒ started. Пороги не меняются, меняется только порядок вех в воронке. Подписи в sales/domain/meta.ts сделать нейтральными («Написал половину книги», «Книга почти готова»), BOOK_READY_ANSWERS и ALMOST_READY_ANSWERS заменить константами из kinds.ts.

## 7. Главы книги должны быть обязательным входом сборки, иначе одна из точек тихо напечатает «Без названия» — зона: foundation

**Проблема.** §3.2 говорит, что названия глав blank берутся из book_chapters, но не говорит, как они доходят до сборки. buildBookContent вызывают stats.ts:19, render.tsx contentFor и coverText, preview/page.tsx:34, server/spreadSample.ts:28. Достаточно одной точки без глав, и редактор, PDF, 3D и оценка объёма разойдутся. contentFingerprint считается по contentFor(bundle), поэтому главы должны попасть именно в BookBundle.

**Поправка.** Добавить queries.chapters(bookId) (order by position). Поле BookBundle.chapters сделать обязательным и заполнять в queries.bundle и queries.stats. Сигнатуру buildBookContent/bookTexts поменять на обязательный параметр chapters: { key, title, epigraph }[] (для книг с банком []), чтобы TS заставил поправить все вызовы. bookTexts.chapter(key) берёт главу из chapters, потом из темы, потом misc. Порядок глав blank задаётся порядком chapters, а не первым вопросом. editorModel тоже получает chapters, scripts/visual/html-data.ts:64 обновить.

## 8. Отказ от склонения своего текста не доходит до всех вызовов applyGender — зона: foundation

**Проблема.** §1.8 запрещает applyGender для custom, но QuestionLike (layout.ts) не содержит questionKey, и questionHeading не может отличить свой текст. Тот же текст склоняют ещё photos/page.tsx:18, хаб books/[id]/page.tsx:52,62,153 (g(next.prompt), названия глав) и spreadSample.ts:60,72. editor-estimate.ts строит QuestionLike из уже обработанного defaultTitle и полагается на то, что повторная подстановка ничего не меняет. Для своего текста с «[..|..]» это уже не так, и превью разойдётся с PDF.

**Поправка.** Добавить questionKey в QuestionLike и ModelQuestion. В lib/book/layout.ts сделать один помощник questionTexts(row, book) → { prompt, hint, heading }, который для questionKey==='custom' возвращает текст как есть, и вызывать его в layout.ts, editor-data.ts, photos/page.tsx и на хабе. editor-estimate передаёт questionKey из EditorQuestion.isCustom. Для названий глав из book_chapters applyGender не вызывать (layout.ts:172 обходить по источнику). Тест: свой вопрос «Мы [Аня|Анна]» печатается без изменений в PDF, в превью и в оценке.

## 9. Пустой prompt раздела blank даёт пустые подписи по всему редактору — зона: editor

**Проблема.** У разделов blank prompt — это подсказка, и чаще всего она ''. Сейчас подписи строятся из prompt: QuestionsEditor.tsx:256 (h1), 412 и 420 (PhotoPicker), QuestionPager.tsx:24,31 (назад и вперёд), ChapterNav.tsx:45 (поиск) и 73 (пункт), хаб page.tsx:153 (карточка «Следующий вопрос»), photos/page.tsx:18 (заголовок через ?? не ловит ''). Получатся пустые строки в оглавлении и в навигации.

**Поправка.** В lib/book/editor-model.ts (лёгкий модуль) добавить sectionLabel(q) = editorHeading(q) || q.prompt || t.untitledSection и использовать его во всех перечисленных местах. В ChapterNav искать по заголовку, подсказке и ответу. На хабе и в PhotosManager подписи брать через тот же помощник.

## 10. Ответы операций оглавления, порядок запросов на клиенте и коды ошибок — зона: editor

**Проблема.** При быстрых «выше/ниже» несколько PUT с полным порядком уходят параллельно, и поздний ответ может применить устаревший порядок. Что делает клиент при расхождении набора (409), не описано. Новые коды не зарегистрированы: src/server/errors.ts STATUS_BY_CODE отдаёт 400 всему, что не «…NotFound», а §2 обещает 409 outlineNotAllowed. Текстов ошибок нет в i18n/messages/{ru,kk}/api.ts.

**Поправка.** Каждый маршрут оглавления возвращает актуальное оглавление { chapters: [{key,title,epigraph,position}], sections: [{id,chapter,position}] }, клиент применяет его как истину. Мутации оглавления на клиенте выполнять последовательно (одна цепочка промисов, кнопки заблокированы на время запроса). Несовпадение набора → AuthoringError('outlineOutdated') 409 → toast и router.refresh(). Добавить коды в AuthoringErrorCode и STATUS_BY_CODE: outlineNotAllowed 409, outlineOutdated 409, chaptersLimit 400, chapterNotFound (404 по суффиксу), unknownTheme 400. Тексты добавить в api.ts ru и kk, проверка — tests/errors.test.ts.

## 11. Уточнить SQL перенумерации: потерянные разделы и позиции глав — зона: foundation

**Проблема.** У book_questions.chapter нет внешнего ключа на book_chapters (у книг-подарков глав в таблице нет). После сбоя или ручной правки раздел blank может ссылаться на несуществующую главу. При inner join он выпадет из перенумерации, при left join получит позицию null и будет отсортирован произвольно. Как пересчитывать позиции глав, в спецификации не сказано.

**Поправка.** Перенумерация разделов blank: update … from (select q.id, row_number() over (order by c.position nulls last, q.position, q.created_at) - 1 rn from book_questions q left join book_chapters c on c.book_id = q.book_id and c.key = q.chapter where q.book_id = $1). Позиции глав пересчитывать одним update … from unnest($keys::text[]) with ordinality. Сборка книги кладёт потерянные разделы в главу «Без названия» в конце, а не в «Разное». Интеграционный тест проверяет, что после каждой операции positions = 0..N-1 и разделы каждой главы идут подряд (то же, что ожидают groupByChapter и Map в layout.ts).

## 12. Входные схемы маршрутов: где можно title/prompt и как совместимы старая и новая формы — зона: foundation

**Проблема.** §2 разрешает PATCH title/prompt «для custom», то есть и для своих вопросов в книгах-подарках. Там title = prompt (persistence.ts insertAfter), а заголовок правят через displayText (HeadingField), так что правка prompt без title рассинхронизирует вопрос. Не сказано, что делать со старой формой POST {afterId, prompt} в blank (insertAfter запишет подсказку в title, и она напечатается), с afterId из чужой главы и с размером массивов в PUT. QuestionRepository.save сейчас пишет только answer/displayText/hideHeading.

**Поправка.** PATCH: title (trim, ≤200, может быть '') и prompt (trim, ≤300) принимать только для разделов blank, в остальных книгах ответ 409 outlineNotAllowed. displayText/hideHeading в blank не использовать: в UI их нет, сервер их игнорирует. Расширить Question.edit и QuestionRepository.save на prompt/title. POST: z.union из новой формы {chapterKey: uuid, afterId?: uuid, title, prompt} и старой. Старая форма в blank → 409, новая в книгах с банком → 409. afterId обязан принадлежать chapterKey. PUT order: keys.max(50), sections.max(600). Параметр [key] проверять через idParams (ключи — uuid).

## 13. recordedBy не проведён через домен, настройки и вёрстку — зона: foundation

**Проблема.** §1.4 добавляет колонку books.recorded_by, но не упоминает BookProps/BookSettings (Book.ts:17-70), вход Book.start, схему PATCH /api/books/[id] (route.ts:9-35, .strict() отвергнет поле), createBookAction, BookLike/BookContent и форму настроек. Без BookContent строка не попадёт в contentFingerprint, и кэш предпросмотра не обновится после правки. Имя записывающего проверка орфографии будет помечать как ошибку.

**Поправка.** recordedBy: string в BookProps, BookSettings и входе Book.start. zod: recordedBy z.string().trim().max(80) в мастере и PATCH, в домене только для autobiography (для остальных игнорировать). Поле в настройках и в редакторе обложки рядом с «Имя рассказчика». BookContent.recordedBy = printableText(...) только у autobiography. В questions/page.tsx добавить recordedBy в names (исключения орфографии). Миграция: books.recorded_by text not null default ''.

## 14. Смена языка у blank оставляет название первой главы на старом языке; текст подтверждения — зона: foundation

**Проблема.** Первая глава blank по умолчанию «Начало»/«Бастауы». switchLanguage (Book.ts) переводит только название книги и шаблоны вопросов, так что в казахской книге останется «Начало». Откуда сервис берёт название по умолчанию на языке книги, не сказано (домен не ходит в словари). Подтверждение смены языка в SettingsForm обещает перевод вопросов, а у blank переводятся только служебные надписи.

**Поправка.** В ThemeText/ThemeOnLanguage добавить firstChapterTitle (ru «Начало», kk «Бастау», в lib/content, на который не распространяется проверка кириллицы). Book.start/BooksService.start берёт его, если поле мастера пустое. В updateSettings для blank при смене языка переименовать главы, чьё название совпадает с firstChapterTitle исходного языка (так же, как titleSuggestions). Текст подтверждения в SettingsForm разный по виду книги (ru/kk): для blank «переведутся только служебные надписи книги», для autobiography «вопросы банка переведутся, ваши тексты останутся». Тест: blank ru→kk→ru возвращает «Начало», своё название главы не трогается.

## 15. Подписи по режиму во всех точках PDF/HTML/3D и известные расхождения превью — зона: print

**Проблема.** §3.2 требует одинаковых подписей, но перечисляет их в общем виде. Галерея сейчас берётся из словаря в четырёх местах: pdf/interior/index.tsx:37 (Opener), toc.tsx:14 (строка оглавления), preview/page.tsx:69 (gallery.title в 3D), book3d/pages.tsx:89. Колофон собирается отдельно в pdf colophon.tsx:17 и в components/interior/pages.tsx:178 (ColophonPage) из year/author без BookContent. Уже сейчас 3D-обложка берёт сырой book.title (preview/page.tsx:41), а PDF — content.title. В 3D-оглавлении нет строки галереи, а в PDF есть.

**Поправка.** Добавить в BookContent поля galleryTitle и recordedBy (их заполняет bookTexts по kind) и передавать их во все перечисленные места. ColophonPage и FaceView colophon получают recordedBy через FlipbookData. preview/page.tsx: cover.title = content.title, gallery.title = content.galleryTitle. Строку галереи добавить в 3D-оглавление, как в toc.tsx. Тест на фикстуре autobiography с фото в галерее: одинаковые подписи галереи и колофона в PDF (pdf-inspect), в HTML-полосах и в planFaces.

## 16. LAYOUT_VERSION + 1 ломает характеристику отпечатка; нужны фикстуры новых видов — зона: print

**Проблема.** tests/characterization/fingerprint.test.ts жёстко проверяет формулу с "v4" и снимок отпечатков. После повышения версии тест упадёт, и его поправят механически, не проверив, что старые книги-подарки по содержанию не изменились. Фикстур autobiography и blank в characterizationBooks нет, поэтому порядок глав blank и строка колофона не покрыты снимками.

**Поправка.** Обновить формулу на v5 и снимок отдельным коммитом. Перед этим прогнать characterization/content и pages на старой версии: снимки содержимого книг-подарков должны остаться прежними, меняется только отпечаток. В tests/fixtures/books.ts добавить фикстуры 'autobiography' (recordedBy, фото в галерее) и 'blank' (3 своих главы с эпиграфами, пустая глава, раздел без заголовка, эмодзи в названии) и включить их в characterizationBooks. В «от чего меняется» добавить случаи: название главы blank, порядок глав, recordedBy.

## 17. Название главы 120 знаков и эпиграф 300 могут не уместиться на начальной полосе — зона: print

**Проблема.** Лимиты §1.9 рассчитаны на поле ввода, а не на вёрстку. Opener (pdf/interior/opener.tsx) набирает название крупным кеглем с noHyphens. Своё название в 120 знаков вместе с эпиграфом в 300 на A5 в оформлениях с крупным ChapterMark или фото на начальной полосе (interior.opener.photo) может уйти на вторую полосу. Оценка (estimate.ts: начальная полоса — ровно 1), planFaces 3D и номера в оглавлении тогда разойдутся с PDF. Эпиграфы банков короткие, такого случая раньше не было.

**Поправка.** Добавить тест pdf-critical: начальная полоса с названием 120 знаков и эпиграфом 300 знаков во всех оформлениях и форматах занимает одну полосу (через pdf-inspect). Если не помещается, в Opener и OpenerPage (HTML) ограничить эпиграф числом строк (maxLines с многоточием) или уменьшать кегль названия по длине одинаково в PDF и HTML. Лимиты ввода не менять.

## 18. Нумерация глав в редакторе расходится с печатью; о пустых главах не предупреждают при заказе — зона: editor

**Проблема.** Пустые главы не печатаются, а номер главы в печати (layout.ts number: i+1) считается только среди печатаемых. В оглавлении редактора нумерация идёт по всем главам: «Глава 3» в редакторе станет «Главой 2» в PDF. По §3.2 о пропуске говорит только редактор, а при оформлении заказа readiness молчит. Пользователь blank создаёт главы осознанно и может не заметить, что одна из них исчезнет.

**Поправка.** В ChapterNav и EditorTopBar для blank номер считать только среди глав, где есть текст или фото. У пустой главы вместо номера показывать приглушённую подпись «Пусто — не попадёт в книгу». В checkReadiness для blank добавить предупреждение emptyChapters(n) со ссылкой на /questions (тексты в books.readiness ru/kk). Для автобиографии и подарков ничего не менять.

## 19. Сотрудник с правом только на просмотр увидит кнопки удаления глав — зона: editor

**Проблема.** questions/page.tsx передаёт editable={book.status === 'draft'} и не учитывает права сотрудника: viewerOf даёт staffEdits=false без clients.edit. Сервер вернёт 404 bookNotFound (loadBook editable), а интерфейс покажет удаление и перестановку глав и раздела. После любого действия сотрудник получит «книга не найдена».

**Поправка.** На страницах questions, хаба и обложки считать editable = book.status === 'draft' && isBookEditableBy(book.userId, await viewerOf(user)). Без права правки скрывать все действия оглавления, «+ Глава», «+ Раздел» и поля заголовка и подсказки. DOM-тест: при editable=false в оглавлении нет кнопок действий.

## 20. Мобильный редактор: Esc в Drawer, клавиатура, перенос раздела, нижняя панель — зона: editor

**Проблема.** §3.4 про телефон говорит только «то же в Drawer, кнопки ≥ 40 px». Drawer (questions/Drawer.tsx) закрывается по Escape через window keydown, поэтому Esc при переименовании главы прямо в строке закроет всё оглавление вместо отмены. Drawer высотой h-full без отступа под клавиатуру: поле переименования внизу списка окажется под ней. Перетаскивание в Drawer конфликтует с прокруткой. Что показывает MobileBar в пустом состоянии и вместо «Пропустить», не описано.

**Поправка.** Поле переименования обрабатывает Esc сам (preventDefault + stopPropagation), Drawer игнорирует события с defaultPrevented или из input. В Drawer учесть useKeyboardInset и при фокусе делать scrollIntoView. На телефоне без dnd: «Выше/Ниже» (size-10, max-sm:border, как в PhotosManager) и «Переместить в главу…» через нативный select. В EditorTopBar название главы — кнопка быстрого переименования. MobileBar для blank: в пустом состоянии одна кнопка «Новая глава» (h-11 rounded-full bg-ink), вместо «Пропустить» — «Следующий раздел», на последнем разделе — «+ Раздел». Добавить DOM-тест Esc.

## 21. Переход по id раздела: что пишет адресная строка, ссылки хаба и писем — зона: editor

**Проблема.** §3.4 вводит ?s=<id>, но QuestionsEditor (эффект на index) сам переписывает URL на ?q=index+1. После перестановки обновление страницы откроет чужой раздел. Хаб (page.tsx:148,180-183) и письма (notifications/templates.ts:17,105 через firstEmpty = min(position)) продолжат ссылаться по индексу.

**Поправка.** Состояние редактора хранить как currentId. replaceState пишет s=<id> и удаляет q. questions/page.tsx читает s, затем q (для совместимости со старыми письмами), иначе первый раздел или пустое состояние, если раздела нет. На хабе и в ChapterNav ссылки строить по id. В notifications/persistence.ts firstEmpty вернуть как id первого пустого раздела (order by position limit 1), а ссылку в шаблонах — ?s=<id> для всех видов книг.

## 22. Мастер: точные zod-правила и данные для трёх видов — зона: wizard

**Проблема.** §3.3 описывает поля, но не правила createBookAction (books/actions.ts:17-31): recipientName сейчас min(1); title необязательно, а для blank по §3.3 обязательно; полей firstChapterTitle, recordedBy, dedication нет. WizardTheme (new/page.tsx) требует recipientLabel, а у автобиографии его нет. queueEvent('book_created') уходит без вида книги. Переключатель рода получателя в мастере у обоих новых видов меняет бессмысленный recipientGender.

**Поправка.** schema.superRefine по recipientPolicy(theme): required → min(1). У autobiography recipientName принудительно ''. У blank — необязательно, ≤60. title: для blank min(1), ≤80. firstChapterTitle: trim ≤120, только blank. recordedBy: ≤80, только autobiography. dedication: ≤600. Род получателя не показывать и не принимать при recipientPolicy≠required (сохранять 'm'). WizardTheme.recipientLabel?: string. queueEvent('book_created', { kind }), цели в Метрике назвать в описании PR. Тест в tests/actions-zod.test.ts: три вида, пустой получатель, пустое название у blank.

## 23. CRM: в событии книги нет автора, в карточках сделки и в досье нет вида книги — зона: crm

**Проблема.** Название сделки «Автобиография: {author}» требует автора, но BookRef (authoring/domain/events.ts:3-10) содержит только title/recipientName/occasion. §3.5 добавляет в событие лишь theme. FunnelService.bookStarted (sales/application/services.ts:363) получает {title, recipientName}. DealCard.ts (DealBooks: «Для: {recipient}», «N из M ответов») и assistant/infrastructure/data.ts (досье «Книга «title» для {recipient}») не выбирают books.theme. Подписи вех в настройке воронки (sales/domain/meta.ts:8-9) говорят про «вопросы» и «25+ ответов».

**Поправка.** BookRef дополнить theme и authorName, Book.ref() их отдаёт, subscriptions.ts:64-76 передаёт их в funnel.bookStarted, а название сделки строится по bookKind. В DealCard.ts, ClientCard.ts, Books.ts и assistant data.ts выбирать books.theme и слова (wordsSql). Подписи «N разделов · X слов» для blank, «→ получатель» только при непустом получателе (clients/[id]/sections.tsx:201, admin/search, admin/books:86 «для —», orders/[id]:121). Подписи вех в meta.ts сделать нейтральными.

## 24. Бот-квалификатор и AI-подсказки ответов не знают о новых видах книг — зона: crm

**Проблема.** Пользователь просил улучшить автоответчик бота. В спецификации бот и подсказки ответов не упоминаются. Вопрос бота по умолчанию (messaging/domain/botConfig.ts:19) — только «Для кого будет книга? для мамы, для мужа, для подруги», следующий — «По какому поводу дарите?». Клиенту, который пишет о себе, отвечать нечего, а в поле сделки recipient попадёт «о себе». businessContext (assistant/domain/prompts.ts:68) описывает продукт как «отвечает на вопросы о близком человеке», поэтому подсказки ответов менеджеру будут отрицать, что можно написать автобиографию или книгу с нуля. summarySystemPrompt просит «для кого и к какому поводу» без вида книги.

**Поправка.** В defaultBotConfig дописать варианты: «Для кого будет книга? Например: для мамы, для мужа, для подруги — или книга о своей жизни». Вопрос о поводе сделать нейтральным: «Есть ли повод или дата?». В businessContext одним абзацем описать три вида: подарок близкому (вопросы по теме), автобиография (вопросы о жизни рассказчика, можно записывать со слов родителей или бабушки и дедушки, поле «кто записал» на обороте титула), своя книга с нуля (свои главы и разделы). В summarySystemPrompt просить указывать вид книги. Сохранённые конфиги бота не меняются: в BotForm показать подсказку «текст по умолчанию обновился» и кнопку «Взять новый текст». Тест в tests/messaging.test.ts и assistant.test.ts на новые строки контекста.

## 25. Письма после заказа и отзывы говорят о «подарке» и «вручении» — зона: crm

**Проблема.** §3.5 упоминает в отзывах только подписи тем. Письмо с просьбой об отзыве (mail.ts review.text «подарок… как прошло вручение», review.gift «маме, папе или другу»), order.delivered «подарок получился особенным», форма отзыва (review.ts:14,17,33 «Что сказал получатель») и письмо о дедлайне (templates.ts:34 ready = answered >= 10, deadline.short «15–20 коротких ответов») для автобиографии и своей книги звучат неверно. reviewDue (notifications/persistence.ts) вообще не соединяется с books и тему не знает.

**Поправка.** В reviewDue добавить join books по orders.book_id и выбирать theme. Варианты текстов review, delivered и формы отзыва по bookKind, в ru/kk mail.ts и review.ts: autobiography — «Что сказали близкие, когда прочитали?», blank — нейтрально. В письме о дедлайне ready брать из progressOf.textStepDone, текст short для blank — про слова. Ключи писем (deadline:/almost:/…) не менять.

## 26. Тексты: имя не склоняется в «о {author}», казахские формулировки — зона: content

**Проблема.** §3.5: «соберите воспоминания о {author}». Русское имя в предложном падеже подставить нельзя: получится «о Бакыт Ахметов», «о Гульнара». Призыв обращён к близким, поэтому «соберите» звучит не к тому адресату. kk: «Бастауы» — форма с притяжательным окончанием («его начало») и как отдельное название главы звучит неестественно. Строку «Автордың айтуымен жазып алған» лучше вычитать. Эпиграф главы писем «Слова тех, кто любит вас» и ключ book.untitled («Без названия», не используется, комментарий устарел) спецификация не учитывает и вводит дубль untitledChapter.

**Поправка.** ru: «Мы собираем книгу воспоминаний. Её герой — {author}. Напишите, что вы помните…»; share-текст: «Записываю историю жизни: {author}. Напишите воспоминание — оно войдёт в книгу: {link}». kk: «{author} туралы естеліктер кітабын жинап жатырмыз…». Первая глава в kk — «Бастау». Оборот титула в kk — «Автордың айтуы бойынша жазып алған — {recordedBy}», дать вычитать носителю. Для названия главы использовать существующий book.untitled и поправить его комментарий, новый ключ не заводить. letters.epigraph выбирать по виду книги (у автобиографии нейтральный, например «Слова тех, кто рядом»). Все ключи добавлять в ru и kk одновременно.

## 27. Посадочные и статьи: типы и страница /kniga/[slug] не готовы к blank — зона: site

**Проблема.** По §3.5 новые режимы выводятся на главной и /kniga с посадочными ru/kk. Тип Landing (landings/types.ts:18-26) требует ThemeId и recipientGender. Страница kniga/[slug]/page.tsx строит примеры из ch.questions[0][0] и заголовок aboutTitle(countQuestions), у blank это «0 вопросов» и пустой блок. Article.theme: ThemeId с bank позволит статье на blank показать пустую подборку. Футер берёт landings.slice(0, 8), поэтому новые посадочные в него не попадут.

**Поправка.** Landing.recipientGender сделать необязательным. Для автобиографии g() без рода получателя. На kniga/[slug] для blank вместо примеров вопросов и «N вопросов» показывать блок о редакторе (главы, разделы, подсказки для себя), тексты в landing.ts ru/kk. Article.theme сузить до BankThemeId = Exclude<ThemeId, 'blank'>, проверка — seo.test.ts. Новые посадочные поставить в первые 8 элементов массива или поднять лимит футера. Сертификат: тексты redeem уже обещают «книгу о своей жизни». Тему при активации не навязывать, но мастер после /redeem должен показывать ряд «Книга о себе» на первом экране телефона.

## 28. Проверка веса бандла не увидит новые банки вопросов — зона: content

**Проблема.** tests/client-weight.test.ts считает тяжёлыми только src/lib/content/themes*, book-content и editor-data. Новые src/lib/content/autobiography.ts и kk/autobiography.ts, а также существующие love/parent/friend, могут попасть в браузер через kinds.ts или мастер, и тест этого не поймает. Паритет titleSuggestions по длине между ru и kk (на нём держится switchLanguage) тестом не закреплён.

**Поправка.** В client-weight.test.ts расширить heavy до /^src\/lib\/content\/(themes|love|parent|friend|autobiography|kk\/)/ и добавить проверку: NewBookWizard.tsx и QuestionsEditor.tsx достигают kinds.ts, но не банков. kinds.ts без строк интерфейса (он под исключением кириллицы lib/content). В content.test.ts: длины titleSuggestions ru и kk совпадают у всех шести тем; у autobiography ≥60 вопросов и нет «[..|..]»; firstChapterTitle есть у blank на обоих языках.

## 29. Пропущенные места, где вид книги меняет поведение — зона: site

**Проблема.** В §3.5 нет нескольких экранов. Шапка студии books/[id]/layout.tsx:46-47 («theme.name · recipientName»). Публичная страница письма letters/[token]/page.tsx:22-49 («{recipient} прочитает его в книге») и строка приватности в LettersManager («видно… имя получателя»). Подсказки оборота обложки «Фраза о вас двоих» и minimalNote «ваши имена» (BackSection.tsx:221,228) во множественном числе. Подписи samplePhotos «Просто мы» в InteriorSpread. AgreementCard получает только answered. e2e-скрипты scripts/e2e-*.mjs проверяют только темы-подарки.

**Поправка.** Шапка студии: для autobiography «Автобиография · {authorName}», для blank — «Своя книга» и получатель, если указан. Страница письма и строку приватности выбирать по bookKind, не подставлять пустого получателя. В BackSection плейсхолдер и minimalNote — в единственном числе для autobiography/blank. samplePhotos по виду книги (ru/kk book.ts, длины массивов равны). В AgreementCard передавать kind и words и звать progressOf. Добавить scripts/e2e-modes.mjs: создать autobiography и blank, добавить главу и раздел, переставить, открыть предпросмотр и PDF.

## 30. Миграция и выкладка: номер, снимок схемы, откат — зона: foundation

**Проблема.** В спецификации не сказано, как выпускать одну миграцию на books.recorded_by и book_chapters, а в соседних ветках миграции тоже идут (последняя — 0034_deal_invoices), так что номер легко занять дважды. Есть и риск отката: если откатить релиз после появления книг autobiography/blank, getTheme тихо вернёт love (themes.ts:115). Такие книги получат любовные главы, название «Наша история» и любовные письма.

**Поправка.** Миграцию генерировать npm run db:generate после ребейза на основную ветку и номер в спецификации не фиксировать. Связи book_chapters добавить в schema/relations.ts, обновить снимок для tests/schema.test.ts. Для отката: в getTheme для неизвестного id писать предупреждение в лог (console.warn с id). Новые карточки мастера выпустить за флагом настроек (по умолчанию выключен), чтобы владелец включил их после проверки на проде. Тогда до включения таких книг нет, и откат безопасен.
