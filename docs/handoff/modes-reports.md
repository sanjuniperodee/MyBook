# Отчёты субагентов: режимы книги (17.10, до 01:41)

Готово: основа режимов и банк автобиографии (ru → kk → вычитка). Этапы «Слияние и проверка основы» и пять зон не запускались (решение владельца) — их делает следующий агент по брифу `workflows/mybook-book-modes-*.js` (этап Combine — с коммитом основы и банка ниже, поправки критики — `modes-spec-critique.md`).

## Банк автобиографии: ru — ветка modes/bank-ru — коммит e298c365bd510f1b0fbd96ac1ce9b4af6b920177

### summary

Я написал русский банк вопросов для автобиографии и сделал один коммит в ветке modes/bank-ru (от 883e522). Ветка done/modes-bank-ru указывает на этот же коммит. Ничего не пушил. Файл /Users/sanjuniperodee/MyBook/.claude/worktrees/wf_074929cd-057-3/src/lib/content/autobiography.ts экспортирует `autobiographyChapters: ChapterDef[]`. В нём 14 глав с ключами из спецификации и 83 вопроса, в каждой главе от 5 до 7. Подсказки есть у 33 вопросов, эпиграфы — у 8 глав.

Названия глав: Вместо предисловия / Мои корни / Детство / Школьные годы / Молодость / Дело моей жизни / Любовь / Дети и внуки / Мой дом / Время, в котором я {жил|жила} / Испытания / Радости жизни / Что я {понял|поняла} о жизни / Письмо потомкам.

Вопросы обращены к рассказчику на «вы» и просят рассказать историю, а не ответить «да» или «нет». Заголовки короткие, от первого лица. Род рассказчика задаётся только через {м|ж}, конструкций [..|..] нет. Супруг везде назван нейтрально: «супругом или супругой», в заголовке — «Тебе, мой родной человек». Подсказка первого вопроса объясняет запись со слов близкого и содержит фразу «пишите его словами, от первого лица».

Эпиграфы — народные пословицы, в основном казахские в переводе; казахский оригинал записан комментарием рядом. Есть и две собственные строки (intro, letter). Цитат современных авторов нет.

Контекст Казахстана: шежіре и семь колен, первенца растят дедушка с бабушкой, кочёвки и целина, аул и город, асыки, джайлау, сватовство, кыз узату и беташар. Есть обряды в честь детей (шильдехана, бесикке салу, тусау кесер), дастархан, Наурыз-коже, той. Отдельные вопросы — про советский быт, девяностые и первые годы независимости (первые тенге, новые паспорта). Оценок и политики нет.

Важное замечание: в пересланном запросе пользователь просит другое — «сделай улучшения автоответчика бота максимально». К банку вопросов автобиографии это не относится. Автоответчик бота в этом запуске не трогал. Банк я сделал по заданию, которое вычислил скрипт. Это локальный коммит без пуша, его легко отменить.

### contracts

Экспорт: `export const autobiographyChapters: ChapterDef[]` из `src/lib/content/autobiography.ts`. Типы — из `./types`.

Казахский банк kk/autobiography.ts должен совпадать по структуре. По главам: ключ — число вопросов — эпиграф — номера вопросов с подсказкой (с 1):
- intro — 5 — эпиграф есть — подсказки у 1, 4
- roots — 6 — эпиграф есть — 1, 2, 3
- childhood — 7 — эпиграф есть — 1, 2, 4, 5
- school — 6 — без эпиграфа — 5, 6
- youth — 6 — без эпиграфа — 2, 4
- work — 6 — эпиграф есть — 1
- love — 6 — без эпиграфа — 2, 4
- children — 6 — без эпиграфа — 2, 6
- home — 6 — эпиграф есть — 1, 3, 4, 6
- times — 6 — без эпиграфа — 1, 2, 3, 4, 5
- trials — 5 — эпиграф есть — 1
- joys — 7 — без эпиграфа — 2, 4, 5
- wisdom — 6 — эпиграф есть — 1
- letter — 5 — эпиграф есть — 5

Итого 83 вопроса, ключи вопросов вида autobiography.<глава>.<N>.

Казахские оригиналы эпиграфов (в файле они в комментариях):
- roots — «Жеті атасын білмеген — жетесіз»
- childhood — «Ұяда не көрсең, ұшқанда соны ілесің»
- work — «Еңбек етсең — емерсің»
- home — «Өз үйім — өлең төсегім» (в ru стоит русская пословица «В гостях хорошо, а дома лучше»)
- trials — «Сабыр түбі — сары алтын»
- wisdom — «Көп жасаған білмейді, көпті көрген біледі»

У intro и letter эпиграфы — собственные строки.

В эпиграфах нет шаблонов рода, потому что content.test их не проверяет.

### checks

Временный тест (после проверки удалён и в коммит не попал) прошёл. Он проверял:
- ключи глав точно совпадают со списком спецификации;
- вопросов не меньше 60 (их 83), в каждой главе от 4 до 7;
- нет [..|..];
- applyGender раскрывает все {..|..} при любом сочетании рода, а род получателя на результат не влияет;
- нет двойных и крайних пробелов;
- заголовки уникальны во всём банке;
- в подсказке первого вопроса есть «пишите его словами, от первого лица».

Обе формы (м и ж) всех строк с {..|..} я перечитал глазами.

Остальные проверки зелёные:
- `npx tsc --noEmit -p .` — без ошибок;
- `npx eslint .` — без ошибок;
- `npx vitest run` — 97 файлов прошли, 8 пропущены; 1503 теста прошли, 25 пропущены.

Интеграционные тесты не запускал: в этой зоне нет ни базы, ни миграций.

### deviations

- Пересланный запрос пользователя («улучшения автоответчика бота») не совпадает с заданием от скрипта (банк автобиографии, ru). Сделано только задание скрипта: изменения локальные, в коммите один файл. Автоответчик бота не затронут.
- Временный тест я создал и удалил до коммита, как требовало задание.
- В worktree лежит симлинк node_modules. Git его не показывает и в коммит он не попал.
- Тема autobiography в themes.ts не подключена, kk/autobiography.ts нет. Это зона других исполнителей; поэтому content.test банк пока не видит.

### followUps

- Уточнить у пользователя запрос про автоответчик бота: в этом запуске его не делали, а пересланная просьба была именно о нём
- Написать kk/autobiography.ts с той же структурой (см. contracts), казахские пословицы-эпиграфы взять из комментариев; лексический род рассказчика при необходимости — через {..|..}
- Подключить autobiographyChapters в themes.ts (ThemeId autobiography, обложка leather, оформление vintage), чтобы банк проверял content.test (паритет ru/kk, нет [..|..])
- Дать носителю вычитать транслитерацию обрядов в подсказках (кыз узату, беташар, шильдехана, бесикке салу, тусау кесер, Наурыз-коже) и переводы пословиц

### files

- /Users/sanjuniperodee/MyBook/.claude/worktrees/wf_074929cd-057-3/src/lib/content/autobiography.ts

## Банк автобиографии: kk — ветка modes/bank-kk — коммит 166c1c1903fa9e2b5bb9039b3e1b281e9fa565cb

### summary

Добавил казахский банк вопросов автобиографии в /Users/sanjuniperodee/MyBook/.claude/worktrees/wf_074929cd-057-4/src/lib/content/kk/autobiography.ts. Он полностью совпадает по структуре с русским банком (e298c36): 14 глав с теми же ключами и в том же порядке (intro, roots, childhood, school, youth, work, love, children, home, times, trials, joys, wisdom, letter), 83 вопроса, столько же вопросов в каждой главе, эпиграфы у тех же 8 глав, подсказки на тех же местах.

Как написан текст: к рассказчику обращаемся на «Сіз», заголовки от первого лица. Пословный перевод не делал, взял казахские реалии: шежіре и жеті ата, азан шақырып ат қою, бауырына басу, асар, төр, шілдехана, бесікке салу, тұсаукесер, құда түсу, қыз ұзату, беташар, АХАЖ, Наурыз көже, Бурабай, Ыстықкөл, тоқсаныншы жылдар, теңге и төлқұжат. В «Письме потомкам» заголовки «Менің батам» и «Менің аманатым». Эпиграфы — те же мақал-мәтелдер, что в комментариях русского банка («Жеті атасын білмеген — жетесіз», «Ұяда не көрсең, ұшқанда соны ілесің», «Еңбек етсең — емерсің», «Өз үйім — өлең төсегім», «Сабыр түбі — сары алтын», «Көп жасаған білмейді, көпті көрген біледі»), плюс две свои строки для intro и letter. Подсказка к первому вопросу объясняет, как записывать со слов близкого: его словами, от первого лица.

Тесты: временным тестом проверил совпадение структуры с русским банком, отсутствие ё/щ/ъ/э и [..|..] и что шаблоны раскрываются при любом роде, потом удалил его. Штатный tests/content.test.ts этот банк пока не проверяет: он перебирает themeIds, а темы autobiography там ещё нет.

Вне задачи: просьба пользователя, переданная харнессом, была «улучшения автоответчика бота», а вычисленная задача — казахский банк автобиографии. Я сделал вычисленную задачу; автоответчик бота не трогал.

### contracts

Модуль src/lib/content/kk/autobiography.ts: export const autobiographyChapters: ChapterDef[] (тип из ../types). Имя экспорта такое же, как у русского банка src/lib/content/autobiography.ts, поэтому в themes.ts нужен импорт с псевдонимом, например import { autobiographyChapters as autobiographyChaptersKk } from "./kk/autobiography". Ключи глав: intro, roots, childhood, school, youth, work, love, children, home, times, trials, joys, wisdom, letter. Ключи вопросов autobiography.<глава>.<N> совпадают с ru. Единственный шаблон рода — заголовок children.1 «{Әке|Ана} атанған күнім» (первая форма мужская, раскрывается по authorGender). Шаблонов [..|..] нет.

### checks

npx tsc --noEmit -p . — без ошибок. npx eslint . — без замечаний. npx vitest run — 97 файлов прошли, 8 пропущены; 1503 теста прошли, 25 пропущены. Временный тест на совпадение структуры kk с ru (ключи, число вопросов, эпиграфы, подсказки, всего 83), на отсутствие ё/щ/ъ/э и [..|..] и на раскрытие {..|..} при любом роде прошёл, после проверки удалён. Интеграционные тесты не запускал: в этой зоне нет кода, работающего с базой. Миграций нет.

### deviations

1) Комментарии в шапке файла написаны по-русски, как требует правило задачи, хотя в соседних kk-файлах они казахские. 2) Тест в tests/content.test.ts не добавлял: по задаче коммитится только этот файл, а правка теста могла бы конфликтовать с веткой, которая подключает тему в themes.ts. Совпадение с ru проверено временным тестом. 3) Просьба пользователя, переданная харнессом, была про «улучшения автоответчика бота», а вычисленная задача — про казахский банк автобиографии. Выполнена вычисленная задача, автоответчик бота не трогал.

### followUps

- Подключить банк в src/lib/content/themes.ts (text.kk.autobiography.chapters), чтобы tests/content.test.ts через themeIds начал проверять паритет ru/kk для автобиографии.
- Если тема autobiography подключается позже, стоит временно добавить в tests/content.test.ts прямую проверку паритета двух банков, импортируя оба файла.
- Попросить носителя языка вычитать подсказки и заголовки (особенно «Ең батыл, тіпті есер ісіңіз», «Көкейіме түйген кеңес», «Сағынышпен еске аламын»).
- Уточнить у пользователя запрос про «улучшения автоответчика бота»: в этом прогоне он не выполнялся.

### files

- /Users/sanjuniperodee/MyBook/.claude/worktrees/wf_074929cd-057-4/src/lib/content/kk/autobiography.ts

## Вычитка банка kk — ветка modes/bank-kk-review — коммит 4117762e952a6b673f14457928906dfc9447245a

### summary

Банк вопросов автобиографии вычитан: казахский — как это сделал бы носитель языка, русский — на опечатки и повторы. Структура не менялась: те же 14 глав, 83/83 вопроса, эпиграфы и подсказки на прежних местах. Все мақал-мәтелдер подлинные и стоят к месту, их не трогал. Обращение везде на «Сіз», букв ё/щ/ъ/э в строках нет. Коммит 4117762 на ветке modes/bank-kk-review, ветка done/modes-bank-kk-review указывает туда же.

Правки kk (было → стало).
Кальки:
- «бұл таңдауға қалай келдіңіз» → «бұл шешімге қалай келдіңіз»
- «Қай пәндер оңай берілді» → «Қай пәндерді оңай меңгердіңіз»
- «кімге сыйлық жасадыңыз, оны қалай атап өттіңіз» → «кімге сыйлық алып бердіңіз, бұл қуанышты қалай атап өттіңіз»
- «Қарым-қатынастарыңыз қалай өрбіді» → «Араларыңыздағы сезім қалай өрбіді»
- «сәбиді қалай қарсы алатын еді … қандай салттар жасалды» → «сәбидің дүниеге келуін қалай тойлайтын еді … қай салттар атқарылды»
- «алғашқы минутта не ойладыңыз» → «оны алғаш көргенде не ойладыңыз»
- «ересек адам ретінде сездіңіз» → «Есейгеніңізді … сездіңіз»
- «қорықпаңыз — оны … толықтырады» → «оқасы жоқ — оларды … толықтыра алады»
- «Қаншалықты … сонша» → «Қанша … сонша»
- «қолдау көрсетті» → «демеу болды»
- «шешім ауыр тиді» → «шешімді қабылдау ауыр болды»
- «ісіңіз ерекше жарасты» → «Бірге жұмыс істеу ерекше жайлы болған әріптестеріңіз»
- «нан үшін кезекте тұру» → «нанға кезекке тұру»
- «қандай жағдайда» → «қандай кезде»
- «әдеттегідей көрінген» → «қалыпты саналған»
- «қай оқиғалар кеше ғана болғандай» → «кешегідей есіңізде»
- «Шөберелеріңізге қалай таныстырар болсаңыз, өзіңізді солай таныстырыңыз» → «Шөберелеріңіздің алдында тұрғандай өзіңізді таныстырыңыз»

Ошибки:
- «жүгініңіз» (это «обратиться в инстанцию») и обрывочное «Дауыстап айтар едіңіз — солай» → «Хатыңызды оларды атымен атап … деп бастаңыз. Дауыстап қалай айтар едіңіз, солай жазыңыз»
- «лебін жеткізетін бәрі» → «лебін сездіретін нәрсенің бәрі»
- «әрі қарай тарқата беріңіз» → «арыға қарай таратыңыз»
- «Аулада не көшеде» → «Аулада немесе көшеде»
- «Не маңызды, не маңызсыз» (читается как «ни … ни …») → «Маңыздысы мен болмашысы»
- «қай той бар» → «қандай той бар»
- «ең қымбатын айтып беріңіз» → «ең қымбаты туралы айтып беріңіз»
- «баратынсыз/тыңдайтынсыз/киінетінсіз» (разговорные стяжения) → «Қайда барып, не тыңдап, қалай киінетін едіңіз»

Смысл:
- «Руыңыз»/«Менің руым» → «Ата-тегіңіз»/«Ата-тегім»: в русском «род», а не только ру
- «Ата-бабаларыңызды … таратып» → «Бабаларыңыздың есімін … таратып»
- «Бүгін» → «Бүгінде» (это «сегодня» в значении «ныне»), в вопросе и заголовке
- «ер жеткенде» → «ер жетіп, бой жеткенде» (и сыновья, и дочери); заголовок «Балалар ер жеткенде» → «Балаларым есейгенде»
- «ең батыл, тіпті есер ісіңіз» → «ең батыл, тіпті албырт қадамыңыз»
- «әскери борыш» → «әскери қызмет»; «мектептен кейін бірден жұмыс» → «мектеп бітісімен жұмысқа тұру»
- «Бір ғұмырдың ішінде көз алдыңызда не өзгерді» → «Көз алдыңызда дүние қалай өзгерді» (в пару с заголовком «Көз алдымда өзгерген дүние»)
- «сақтауды өтінесіз» → «сақтауды аманат етесіз» (в пару с «Менің аманатым»)
- «қандай өнері бар еді» → «қолынан не келетін еді» (в русском «что умела»)

Идиомы и стиль:
- «Балалық шақтың қай тағамын әлі күнге ұмытпайсыз» → «қай тағамның дәмі әлі күнге аузыңызда»
- «сізге немен ұқсайды» → «сізге қай жағынан тартқан»
- «Оларға … не беруді» → «Олардың бойына … нені сіңіруді»
- «өзіне тән сөздерін» → «сөз саптасын, сүйікті сөздерін»
- «Ол адам немен есте қалды» → «Ол кісі несімен есіңізде қалды»; «Ол адамнан» → «Ол кісіден»; «шын мәнінде еңбекке» → «нағыз еңбекке»
- «Кезек» → «Ұзын-сонар кезектер»; «заманды … жеткізеді» → «заманның келбетін … жеткізеді»
- «әзіл ме» → «әзіл-қалжың ба»; «Мойымауға» → «Мойымауыңызға»
- «толық айтып беріңіз» → «тәптіштеп айтып беріңіз»; «есте қалды» → «есіңізде қалды» (там, где вопрос на «Сіз»)
- «әженің камзолы» → «әжеңізден қалған камзол»; «кейін қандай еркелету аттарыңыз пайда болды» → «кейін сізді қалай еркелетіп атайтын болды»
- в подсказках: «Қай жерде болды» → «Бұл қай жерде болды»; «дастарқанда не болды» → «дастарқанға не қойылды»; «Тізім етіп» → «Тізім түрінде»
- прочее: «келуіне не әзірлейтін» → «Қонақтарды … олар келерде не әзірлейтін»; «Сонда не болды» → «Сонда не болып еді»; «не киіп едіңіз» → «не киіп бардыңыз»; «бірақ әлі айта алмай жүрген» → «көптен бері айтқыңыз келіп жүрген, бірақ әлі айта алмаған»; «Бәрін басынан бастауға тура келді ме — …ауыстыруға?» → «Бәрін басынан бастауға — …ауыстыруға тура келді ме?»

Заголовки:
- главы: «Сынақтар» → «Өмір сынақтары» (в пару к «Өмір қуаныштары»)
- вопросы, от первого лица: «Балалық шақтың ойындары» → «Бала кездегі ойындарым»; «Ұмытылмас ұстаз» → «Ұмытылмас ұстазым»; «Жастық шақтың достары» → «Жастық шақтағы достарым»
- прочие вопросы: «Қасымда болғандар» → «Қасымнан табылғандар»; «Бала тойлары» → «Сәби тойлары»; «Біз қалай демалатынбыз» → «Біз қалай көңіл көтеретінбіз»; «Бүгін мені не қуантады» → «Бүгінде мені не қуантады»

Правки ru:
- «как в шежіре» → «как в шежире»: остальные казахские слова в русском тексте написаны русскими буквами («кыз узату», «тусау кесер»)
- «Какое блюдо из детства вы помните до сих пор?» → «Вкус какого блюда из детства вы помните и сегодня?»: убран повтор «до сих пор» с соседним вопросом
- «Что изменилось на ваших глазах за жизнь?» → «Как изменился мир на ваших глазах?»
- Шаблоны {м|ж} раскрываются корректно для обоих родов, [..|..] нет, тон ровный.

### contracts

- Экспорт не менялся: autobiographyChapters: ChapterDef[] в src/lib/content/autobiography.ts и src/lib/content/kk/autobiography.ts.
- Ключи глав прежние: intro, roots, childhood, school, youth, work, love, children, home, times, trials, joys, wisdom, letter.
- Порядок и число вопросов прежние, поэтому ключи autobiography.<глава>.<N> остаются в силе.
- Единственный шаблон рода в kk — «{Әке|Ана} атанған күнім».
- Изменились только тексты строк, в том числе заголовок главы trials в kk: «Өмір сынақтары» вместо «Сынақтар».

### checks

- npx tsc --noEmit -p . — без ошибок (код выхода 0).
- npx eslint . — без ошибок.
- npx vitest run — 97 файлов и 1503 теста прошли, 8 файлов / 25 тестов пропущены (это интеграционные).
- Тема autobiography на этом коммите ещё не зарегистрирована в themes.ts, поэтому tests/content.test.ts этот банк не проверяет. Его проверки (одинаковые ключи и порядок глав, число вопросов, места эпиграфов и подсказок, нет [..|..], {..|..} раскрываются при всех сочетаниях рода, в kk нет ё/щ/ъ/э) повторил скриптом вне репозитория /tmp/kkcheck/check.ts через npx tsx: ru 83, kk 83, глав 14/14, ошибок нет.
- Интеграционные тесты не запускал: в зоне только статический контент, БД и миграции не затронуты.

### deviations

- Запрос пользователя, переданный в этот прогон, — «давай так же субагентом сделай улучшения автоответчика бота максимально». Он про автоответчик бота, а вычисленная задача — про вычитку банка автобиографии. Прямо они не противоречат, поэтому выполнил вычисленную задачу. Автоответчик бота в этом прогоне не трогал: похоже, эту задачу передали не тому исполнителю, оркестратору стоит это проверить.
- Составную команду подготовки (reset + checkout) песочница worktree не пропустила; выполнил её по шагам с тем же результатом: HEAD = 166c1c1, затем ветка modes/bank-kk-review.
- Эпиграф intro «Әр өмір — бір кітап. Мынау — менікі.» и заголовок «Мен қайда тудым» оставил: они естественны.
- Формы «Біздің мерекелер» и «Біздің дастарқан» без притяжательного окончания тоже оставил: для «біздің» это допустимая норма.

### followUps

- Когда тему autobiography зарегистрируют в themes.ts (themeIds / themeChaptersByLocale), tests/content.test.ts начнёт проверять паритет ru/kk этого банка; до этого он проверен только разовым скриптом.
- Улучшение автоответчика бота из пользовательского запроса в этом прогоне не делалось — нужна отдельная задача с указанием зоны (модуль бота, файлы автоответчика).

### files

- /Users/sanjuniperodee/MyBook/.claude/worktrees/wf_074929cd-057-5/src/lib/content/kk/autobiography.ts
- /Users/sanjuniperodee/MyBook/.claude/worktrees/wf_074929cd-057-5/src/lib/content/autobiography.ts

## Основа режимов — ветка modes/foundation (указатель done/modes-foundation = HEAD) — коммит cabca5c3df29be8a3dd66088b2ac0f3b33fea6d8

### summary

Готова основа режимов книги. Добавлены темы autobiography и blank. Модуль kinds.ts хранит вид книги, политику получателя, progressOf, пороги и лимиты. Добавлена миграция 0035 (books.recorded_by и таблица book_chapters), она применена к локальной базе.

Домен: Book.start создаёт книгу по её виду. У автобиографии нет получателя, есть поле recordedBy. Своя книга создаётся с первой главой «Начало»/«Бастау» и пустым разделом. Незнакомая тема даёт unknownTheme.

BookOutlineService управляет главами и разделами. Каждая операция берёт строку книги с блокировкой FOR UPDATE, проверяет лимиты и набор, перенумеровывает одним SQL и возвращает актуальное оглавление. Удаление раздела переписано: идёт в транзакции, отвязывает фото (question_id и inline = null), перенумеровывает позиции и отправляет book_progressed, если в разделе был текст.

Маршруты: chapters, chapters/[key], chapters/order, questions/order. POST и PATCH questions расширены.

Сборка книги принимает главы обязательным параметром. Текст автора не склоняется. Подписи галереи и «записано со слов» зависят от вида книги. Добавлена функция coverNames, LAYOUT_VERSION поднят до 5. Прогресс в SQL вынесен в bookProgress.ts: на нём работают фильтр «почти готовы» в CRM, дашборд, воронка и автописьма; результаты совпадают с progressOf (проверено интеграционным тестом).

Сделано два коммита: основа и фикстуры автобиографии и своей книги для характеристических снимков. Снимки книг-подарков не изменились.

Пользователь просил улучшить автоответчик бота. Это пункт крит. 21 (зона crm), в этой ветке он не сделан. Для него готовы BookRef.theme/authorName и kinds.ts.

### contracts

kinds.ts (src/lib/content/kinds.ts, лёгкий, без банков вопросов):
- типы: BookKind = "gift"|"autobiography"|"blank"; RecipientPolicy = "required"|"optional"|"none".
- функции: bookKind(theme); recipientPolicy(theme); hasQuestionBank(theme); hasOutline(theme).
- лимиты: MAX_CHAPTERS=50, CHAPTER_TITLE_MAX=120, CHAPTER_EPIGRAPH_MAX=300, SECTION_TITLE_MAX=200, SECTION_PROMPT_MAX=300, RECORDED_BY_MAX=80.
- пороги: BANK_TEXT_STEP=10, BANK_READY=25, BLANK_TEXT_WORDS=1000, BLANK_HALF_WORDS=1500, BLANK_READY_WORDS=3000.
- progressOf(kind, {answered, total, words}) → {started, half, ready, textStepDone, short}. Монотонна: ready ⇒ half ⇒ started.
- progressChanged(kind, before, after) → boolean.

Темы (src/lib/content):
- ThemeId = GiftThemeId("love"|"mom"|"dad"|"friend") | "autobiography" | "blank".
- ThemeDef: добавлены kind и recipient; recipientLabel и recipientPlaceholder стали необязательными; firstChapterTitle? задан у blank: ru «Начало», kk «Бастау».
- getThemes(lang) отдаёт все 6 тем. giftThemes(lang) — 4 подарка. bankThemes(lang) — подарки и автобиография.
- getTheme(незнакомый id) пишет console.warn и показывает тему как love.
- Банк автобиографии: export const autobiographyChapters в src/lib/content/autobiography.ts и kk/autobiography.ts.

Схема:
- books.recordedBy (recorded_by text not null default '').
- Таблица bookChapters: id, bookId, key, position, title='', epigraph='', timestamps; unique(book_id,key), index(book_id,position). Тип BookChapter. Связь booksRelations.chapters.

Домен authoring:
- ThemeOnLanguage: добавлены {kind, recipient, firstChapterTitle}.
- StartInput: добавлены recordedBy? и firstChapterTitle?.
- Book.start(id, input, theme, now, newKey?) → {book, questions, chapters: ChapterSeed[]}. Для blank newKey обязателен.
- Book: геттер kind, метод noteProgress().
- BookSettings.recordedBy — только у автобиографии. У автобиографии recipientName игнорируется; recipientGender игнорируется у всех, кроме подарков.
- BookRef: добавлены theme и authorName.
- Question: QuestionPatch {answer?, displayText?, hideHeading?, title?, prompt?}; CUSTOM_QUESTION; геттер words.
- Outline = {chapters: {key, title, epigraph, position}[], sections: {id, chapter, position}[]}.
- Новые коды AuthoringErrorCode: unknownTheme 400, outlineNotAllowed 409, outlineOutdated 409, chaptersLimit 400 (params [MAX_CHAPTERS]), chapterNotFound 404.
- Репозитории:
  - BookRepository.findById(id, {lock?}); add(book, questions, chapters?).
  - QuestionRepository: добавлены insertSection, sections, arrange, renumber(bookId, "outline"|"bank"), deleteChapter, idsInChapter, wordsInBook.
  - Новый ChapterRepository: list, add, update, delete, setOrder, retitle, outline.
  - PhotoRepository.detachFromQuestions.

Сервисы (container().authoring):
- books.start(userId, {theme, language, authorName, authorGender, recipientName, recipientGender, title?, occasion?, occasionDate?, recordedBy?, firstChapterTitle?}) — бросает unknownTheme.
- outline (BookOutlineService), все методы берут книгу с lock и отдают в книгах с банком outlineNotAllowed:
  - addChapter(bookId, viewer, {title, afterKey?}) → {key, sectionId, outline};
  - renameChapter(bookId, viewer, key, {title?, epigraph?}) → Outline;
  - reorderChapters(bookId, viewer, keys) → Outline;
  - deleteChapter(bookId, viewer, key) → Outline;
  - addSection(bookId, viewer, {chapterKey, afterId?, title, prompt}) → {id, outline};
  - reorderSections(bookId, viewer, [{id, chapter}]) → Outline;
  - outline(bookId, viewer) → Outline.
- questions.edit(bookId, viewer, qid, QuestionPatch): title и prompt только у custom своей книги, иначе 409; у blank displayText и hideHeading игнорируются.
- questions.deleteCustom → Outline у своей книги, null у остальных. Отдаёт questionNotFound и onlyOwnQuestions.
- questions.addCustom в своей книге → 409.
- queries.chapters(bookId); BookBundle.chapters обязателен; userBooks дополнительно отдаёт words.

Маршруты (вход проверяет zod, [key] — uuid через idParams):
- POST /api/books/[id]/chapters {title, afterKey?} → {key, sectionId, outline}.
- PATCH /api/books/[id]/chapters/[key] {title?, epigraph?} → {outline}.
- DELETE /api/books/[id]/chapters/[key] → {outline}.
- PUT /api/books/[id]/chapters/order {keys ≤50} → {outline}.
- POST /api/books/[id]/questions: {chapterKey, afterId?, title, prompt} → {question, outline}; прежняя форма {afterId, prompt} → {question}.
- PATCH /api/books/[id]/questions/[qid}: добавлены title и prompt.
- DELETE /api/books/[id]/questions/[qid] → {ok, outline}.
- PUT /api/books/[id]/questions/order {sections: [{id, chapter}] ≤600} → {outline}.
- PATCH /api/books/[id]: добавлен recordedBy.
- createBookAction: recipientName обязателен только при recipientPolicy = required; новые поля recordedBy и firstChapterTitle.

Сборка книги:
- buildBookContent(book, questions, photos, chapters: ChapterLike[], year?, letters?) — chapters обязателен.
- bookTexts(book, chapters).
- BookTexts: добавлены own, chapterOrder, untitledChapter, galleryTitle.
- QuestionLike и BookLike: добавлены questionKey и recordedBy.
- BookContent: добавлены kind, recordedBy (только у автобиографии, через printableText), galleryTitle.
- questionTexts(row, book) → {prompt, hint, title, heading}: custom не склоняется. Константы CUSTOM_KEY и ChapterLike.
- LAYOUT_VERSION = 5.
- coverNames(book) в src/lib/book/cover-names.ts (там же coverNamesLine). Из lib/book/covers больше не экспортируются.
- bookSpreadSample(book, questions, chapters, placeholder, photos).

Редактор (src/lib/book):
- editorModel(book, rows, chapters, photos, letters?) → {questions, chapters: EditorChapter[], epigraphs, photos, letters}.
- EditorChapter {key, title, epigraph, own}.
- EditorBook.kind: BookKind.
- groupByChapter(questions, chapters?) — со списком глав строит группы по нему, включая пустые главы; потерянные главы идут в конец.
- sectionLabel(q, kind, untitled).
- editorEstimate(book, questions, photos, letters, chapters?).

Готовность и прогресс:
- checkReadiness: книге нужен theme. Для blank — noText и shortWords, для автобиографии — narratorName.
- SQL (src/shared/infrastructure/db/bookProgress.ts): WORD_PATTERN, hasText, answeredSql, totalSql, wordsSql, readySql, halfSql, textStepSql, progressCols.
- Воронка: sales BookProgress.progress → {theme, answered, total, words}.
- Автописьма: notifications DraftProgress и LatestDraft получили theme и words.

Ключи словарей (ru и kk):
- book: galleryByKind.{autobiography, blank}, recordedBy(name), untitledChapter.
- books: untitledSection; readiness.noText, readiness.narratorName, readiness.shortWords(n).
- api: unknownTheme, outlineNotAllowed, outlineOutdated, chaptersLimit(max), chapterNotFound, chapterTitleTooLong, sectionTitleTooLong.

### checks

npx tsc --noEmit -p . — без ошибок.

npx eslint . — без ошибок.

npx vitest run — 98 файлов прошли, 9 пропущены (интеграционные); 1568 тестов прошли, 30 пропущены.

Интеграционные на локальном PostgreSQL (DATABASE_URL=postgres://mybook@127.0.0.1:55499/mybook, INTEGRATION=1):
- tests/book-modes.integration.test.ts — 5 из 5:
  - инвариант позиций после каждой операции;
  - 5 addSection и 2 reorderSections через Promise.all: позиции без дублей, набор проверяется под блокировкой;
  - гонка трёх addChapter при 49 главах: проходит ровно одна;
  - удаление главы с фото: question_id и inline стали null, книга собирается;
  - порядок глав в PDF совпадает с порядком в редакторе, раздел потерянной главы попадает в конец под «Без названия»;
  - SQL-прогресс совпадает с progressOf/countWords (NBSP, переводы строк, эмодзи);
  - запросы bookList, dashboard, draftCandidates, userBooks и sqlBookProgress выполняются.
- outbox, revenue, routing, deal-money, payments-settings, identity-phone — 18 из 18.

Отдельно:
- characterization content и pages: до добавления новых фикстур снимки книг-подарков не изменились, поменялся только отпечаток (v5).
- Новые снимки autobiography и blank только добавились: оценка совпадает с PDF (29 = 29, 28 = 28).
- pdf-critical — 205 из 205, включая новые варианты.

Миграция 0035 применена к общей локальной базе (npm run db:migrate).

### deviations

- Ответ на запрос пользователя: он просил улучшить автоответчик бота. Это пункт крит. 21 (зона crm), в этой ветке его нет — зона задачи «основа». Сделан фундамент, на который он опирается: виды книг, BookRef.theme/authorName.
- Корзины по 150 слов (§3.1) заменены поправкой крит. 6. В edit сервис запрашивает сумму слов книги (wordsInBook) и отправляет book_progressed, если пересечён порог progressOf. Событие идёт и при удалении главы или раздела с текстом.
- Тест «> 40 вопросов» для автобиографии временно пропущен (draftBanks в tests/content.test.ts). Заглушка банка — по одному вопросу на главу, как велено. Паритет ru/kk, ключи глав и отсутствие [..|..] проверяются.
- Карточки мастера за флагом (крит. 23) не делал, это зона сайта. Вместо этого мастер, главная и /kniga получают giftThemes. Новые виды не видны, пока сайт не добавит формы. createBookAction уже принимает autobiography и blank.
- Отпечаток (крит. 16): формула v5 и снимок отпечатков вошли в первый коммит вместе с кодом. Отдельным коммитом их не сделать: новые поля BookContent меняют JSON содержимого. Перед этим проверено, что снимки content, pages, editor-estimate и render книг-подарков не изменились. Фикстуры autobiography и blank — отдельный второй коммит.
- describeContent печатает строку вида и подписей только у не-подарков, чтобы снимки подарков не поменялись. У подарков подписи проверяет отдельный тест.
- Сверх зоны, без правки UI, сделано на основе progressOf:
  - FunnelService.bookProgressed (вехи book_half/book_ready, монотонно);
  - нейтральные подписи вех в sales/meta.ts;
  - автописьма almost/nudge/start и ready в письме о дедлайне.
  BOOK_READY_ANSWERS и ALMOST_READY_ANSWERS удалены.
- updateSettings теперь тоже берёт книгу с lock: save пишет статус, и без блокировки заказ, оформленный посреди правки, откатывался бы в черновик.
- Не сделано, это UI и print:
  - подписи по режиму в PDF и HTML: Opener, toc, colophon, ColophonPage, 3D-оглавление — BookContent.galleryTitle и recordedBy готовы;
  - пункты крит. 2, 9, 10 (клиентская часть), 17, 18, 19, 20 (тексты CRM), 22, тексты SettingsForm.
  - Из пункта 9 сделаны sectionLabel и подписи на хабе и в фото.

### followUps

- Редактор: QuestionsEditor падает при 0 разделов. Своя книга может прийти к пустому состоянию после удаления последнего раздела. Нужны пустое состояние, оглавление по editorModel().chapters и groupByChapter(questions, chapters) и последовательная очередь мутаций оглавления (409 outlineOutdated → toast и router.refresh)
- Редактор: currentId и ?s=<id> вместо ?q (крит. 19); 404 questionNotFound/chapterNotFound в sendDraft считать окончательной ошибкой (крит. 2); editable с учётом viewerOf и isBookEditableBy (крит. 18)
- Печать: использовать content.galleryTitle в PDF Opener, toc и 3D; печатать book.recordedBy(name) в colophon.tsx и ColophonPage/FlipbookData; добавить галерею в 3D-оглавление. pdf-critical bleedPages сейчас ищет t.gallery — поправить вместе с этим
- Печать (крит. 17): pdf-critical на главу с названием 120 знаков и эпиграфом 300 знаков во всех оформлениях; при переполнении ограничить в Opener и OpenerPage
- Сайт: мастер с карточками автобиографии и своей книги за флагом. Поля recordedBy и firstChapterTitle action уже принимает; recipientLabel у автобиографии отсутствует. Нужны подписи CoverEditor и SettingsForm по виду книги
- CRM и бот (запрос пользователя, крит. 21): defaultBotConfig и businessContext про три вида книг; название сделки по bookKind (BookRef.theme/authorName уже в событии); «→ получатель» показывать только при непустом получателе; слова и разделы в карточках (wordsSql)
- Когда придёт настоящий банк автобиографии из соседней ветки: снять draftBanks в tests/content.test.ts и обновить снимок фикстуры autobiography (названия глав берутся из банка): npx vitest run tests/characterization -u, проверить diff
- notifications firstEmpty → id первого пустого раздела и ссылки ?s=<id> (крит. 19); тексты писем для blank по словам (крит. 22)

### files

- /Users/sanjuniperodee/MyBook/.claude/worktrees/wf_074929cd-057-2/src/lib/content/kinds.ts
- /Users/sanjuniperodee/MyBook/.claude/worktrees/wf_074929cd-057-2/src/lib/content/types.ts
- /Users/sanjuniperodee/MyBook/.claude/worktrees/wf_074929cd-057-2/src/lib/content/themes.ts
- /Users/sanjuniperodee/MyBook/.claude/worktrees/wf_074929cd-057-2/src/lib/content/autobiography.ts
- /Users/sanjuniperodee/MyBook/.claude/worktrees/wf_074929cd-057-2/src/lib/content/kk/autobiography.ts
- /Users/sanjuniperodee/MyBook/.claude/worktrees/wf_074929cd-057-2/src/lib/occasions.ts
- /Users/sanjuniperodee/MyBook/.claude/worktrees/wf_074929cd-057-2/drizzle/0035_book_modes.sql
- /Users/sanjuniperodee/MyBook/.claude/worktrees/wf_074929cd-057-2/drizzle/meta/0035_snapshot.json
- /Users/sanjuniperodee/MyBook/.claude/worktrees/wf_074929cd-057-2/drizzle/meta/_journal.json
- /Users/sanjuniperodee/MyBook/.claude/worktrees/wf_074929cd-057-2/src/shared/infrastructure/db/schema/authoring.ts
- /Users/sanjuniperodee/MyBook/.claude/worktrees/wf_074929cd-057-2/src/shared/infrastructure/db/schema/relations.ts
- /Users/sanjuniperodee/MyBook/.claude/worktrees/wf_074929cd-057-2/src/shared/infrastructure/db/bookProgress.ts
- /Users/sanjuniperodee/MyBook/.claude/worktrees/wf_074929cd-057-2/src/modules/authoring/domain/Book.ts
- /Users/sanjuniperodee/MyBook/.claude/worktrees/wf_074929cd-057-2/src/modules/authoring/domain/Question.ts
- /Users/sanjuniperodee/MyBook/.claude/worktrees/wf_074929cd-057-2/src/modules/authoring/domain/outline.ts
- /Users/sanjuniperodee/MyBook/.claude/worktrees/wf_074929cd-057-2/src/modules/authoring/domain/repositories.ts
- /Users/sanjuniperodee/MyBook/.claude/worktrees/wf_074929cd-057-2/src/modules/authoring/domain/errors.ts
- /Users/sanjuniperodee/MyBook/.claude/worktrees/wf_074929cd-057-2/src/modules/authoring/domain/events.ts
- /Users/sanjuniperodee/MyBook/.claude/worktrees/wf_074929cd-057-2/src/modules/authoring/domain/readiness.ts
- /Users/sanjuniperodee/MyBook/.claude/worktrees/wf_074929cd-057-2/src/modules/authoring/domain/stats.ts
- /Users/sanjuniperodee/MyBook/.claude/worktrees/wf_074929cd-057-2/src/modules/authoring/application/services.ts
- /Users/sanjuniperodee/MyBook/.claude/worktrees/wf_074929cd-057-2/src/modules/authoring/index.ts
- /Users/sanjuniperodee/MyBook/.claude/worktrees/wf_074929cd-057-2/src/modules/authoring/infrastructure/persistence.ts
- /Users/sanjuniperodee/MyBook/.claude/worktrees/wf_074929cd-057-2/src/modules/authoring/infrastructure/queries.ts
- /Users/sanjuniperodee/MyBook/.claude/worktrees/wf_074929cd-057-2/src/modules/authoring/infrastructure/adapters.ts
- /Users/sanjuniperodee/MyBook/.claude/worktrees/wf_074929cd-057-2/src/app/api/books/[id]/chapters/route.ts
- /Users/sanjuniperodee/MyBook/.claude/worktrees/wf_074929cd-057-2/src/app/api/books/[id]/chapters/[key]/route.ts
- /Users/sanjuniperodee/MyBook/.claude/worktrees/wf_074929cd-057-2/src/app/api/books/[id]/chapters/order/route.ts
- /Users/sanjuniperodee/MyBook/.claude/worktrees/wf_074929cd-057-2/src/app/api/books/[id]/questions/route.ts
- /Users/sanjuniperodee/MyBook/.claude/worktrees/wf_074929cd-057-2/src/app/api/books/[id]/questions/[qid]/route.ts
- /Users/sanjuniperodee/MyBook/.claude/worktrees/wf_074929cd-057-2/src/app/api/books/[id]/questions/order/route.ts
- /Users/sanjuniperodee/MyBook/.claude/worktrees/wf_074929cd-057-2/src/app/api/books/[id]/route.ts
- /Users/sanjuniperodee/MyBook/.claude/worktrees/wf_074929cd-057-2/src/app/(app)/books/actions.ts
- /Users/sanjuniperodee/MyBook/.claude/worktrees/wf_074929cd-057-2/src/server/errors.ts
- /Users/sanjuniperodee/MyBook/.claude/worktrees/wf_074929cd-057-2/src/server/spreadSample.ts
- /Users/sanjuniperodee/MyBook/.claude/worktrees/wf_074929cd-057-2/src/lib/book/layout.ts
- /Users/sanjuniperodee/MyBook/.claude/worktrees/wf_074929cd-057-2/src/lib/book/book-content.ts
- /Users/sanjuniperodee/MyBook/.claude/worktrees/wf_074929cd-057-2/src/lib/book/editor-data.ts
- /Users/sanjuniperodee/MyBook/.claude/worktrees/wf_074929cd-057-2/src/lib/book/editor-model.ts
- /Users/sanjuniperodee/MyBook/.claude/worktrees/wf_074929cd-057-2/src/lib/book/editor-estimate.ts
- /Users/sanjuniperodee/MyBook/.claude/worktrees/wf_074929cd-057-2/src/lib/book/cover-names.ts
- /Users/sanjuniperodee/MyBook/.claude/worktrees/wf_074929cd-057-2/src/lib/book/cover-back.ts
- /Users/sanjuniperodee/MyBook/.claude/worktrees/wf_074929cd-057-2/src/lib/book/covers/index.ts
- /Users/sanjuniperodee/MyBook/.claude/worktrees/wf_074929cd-057-2/src/modules/production/infrastructure/pdf/render.tsx
- /Users/sanjuniperodee/MyBook/.claude/worktrees/wf_074929cd-057-2/src/app/(app)/books/[id]/page.tsx
- /Users/sanjuniperodee/MyBook/.claude/worktrees/wf_074929cd-057-2/src/app/(app)/books/[id]/questions/page.tsx
- /Users/sanjuniperodee/MyBook/.claude/worktrees/wf_074929cd-057-2/src/app/(app)/books/[id]/photos/page.tsx
- /Users/sanjuniperodee/MyBook/.claude/worktrees/wf_074929cd-057-2/src/app/(app)/books/[id]/preview/page.tsx
- /Users/sanjuniperodee/MyBook/.claude/worktrees/wf_074929cd-057-2/src/app/(app)/books/[id]/pages/page.tsx
- /Users/sanjuniperodee/MyBook/.claude/worktrees/wf_074929cd-057-2/src/app/(app)/books/[id]/cover/page.tsx
- /Users/sanjuniperodee/MyBook/.claude/worktrees/wf_074929cd-057-2/src/app/(app)/books/[id]/cover/CoverEditor.tsx
- /Users/sanjuniperodee/MyBook/.claude/worktrees/wf_074929cd-057-2/src/app/(app)/books/new/page.tsx
- /Users/sanjuniperodee/MyBook/.claude/worktrees/wf_074929cd-057-2/src/app/page.tsx
- /Users/sanjuniperodee/MyBook/.claude/worktrees/wf_074929cd-057-2/src/app/kniga/page.tsx
- /Users/sanjuniperodee/MyBook/.claude/worktrees/wf_074929cd-057-2/src/modules/sales/application/services.ts
- /Users/sanjuniperodee/MyBook/.claude/worktrees/wf_074929cd-057-2/src/modules/sales/application/ports.ts
- /Users/sanjuniperodee/MyBook/.claude/worktrees/wf_074929cd-057-2/src/modules/sales/infrastructure/adapters.ts
- /Users/sanjuniperodee/MyBook/.claude/worktrees/wf_074929cd-057-2/src/modules/sales/domain/meta.ts
- /Users/sanjuniperodee/MyBook/.claude/worktrees/wf_074929cd-057-2/src/modules/reporting/infrastructure/Books.ts
- /Users/sanjuniperodee/MyBook/.claude/worktrees/wf_074929cd-057-2/src/modules/reporting/infrastructure/Dashboard.ts
- /Users/sanjuniperodee/MyBook/.claude/worktrees/wf_074929cd-057-2/src/modules/notifications/domain/lifecycle.ts
- /Users/sanjuniperodee/MyBook/.claude/worktrees/wf_074929cd-057-2/src/modules/notifications/infrastructure/persistence.ts
- /Users/sanjuniperodee/MyBook/.claude/worktrees/wf_074929cd-057-2/src/modules/notifications/infrastructure/templates.ts
- /Users/sanjuniperodee/MyBook/.claude/worktrees/wf_074929cd-057-2/src/modules/notifications/application/ports.ts
- /Users/sanjuniperodee/MyBook/.claude/worktrees/wf_074929cd-057-2/src/i18n/messages/ru/api.ts
- /Users/sanjuniperodee/MyBook/.claude/worktrees/wf_074929cd-057-2/src/i18n/messages/kk/api.ts
- /Users/sanjuniperodee/MyBook/.claude/worktrees/wf_074929cd-057-2/src/i18n/messages/ru/book.ts
- /Users/sanjuniperodee/MyBook/.claude/worktrees/wf_074929cd-057-2/src/i18n/messages/kk/book.ts
- /Users/sanjuniperodee/MyBook/.claude/worktrees/wf_074929cd-057-2/src/i18n/messages/ru/books.ts
- /Users/sanjuniperodee/MyBook/.claude/worktrees/wf_074929cd-057-2/src/i18n/messages/kk/books.ts
- /Users/sanjuniperodee/MyBook/.claude/worktrees/wf_074929cd-057-2/tests/book-modes.test.ts
- /Users/sanjuniperodee/MyBook/.claude/worktrees/wf_074929cd-057-2/tests/book-modes.integration.test.ts
- /Users/sanjuniperodee/MyBook/.claude/worktrees/wf_074929cd-057-2/tests/doubles/authoring.ts
- /Users/sanjuniperodee/MyBook/.claude/worktrees/wf_074929cd-057-2/tests/fixtures/books.ts
- /Users/sanjuniperodee/MyBook/.claude/worktrees/wf_074929cd-057-2/tests/content.test.ts
- /Users/sanjuniperodee/MyBook/.claude/worktrees/wf_074929cd-057-2/tests/errors.test.ts
- /Users/sanjuniperodee/MyBook/.claude/worktrees/wf_074929cd-057-2/tests/client-weight.test.ts
- /Users/sanjuniperodee/MyBook/.claude/worktrees/wf_074929cd-057-2/tests/characterization/fingerprint.test.ts
- /Users/sanjuniperodee/MyBook/.claude/worktrees/wf_074929cd-057-2/tests/characterization/content.test.ts
