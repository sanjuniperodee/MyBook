# Визуальные эталоны PDF и HTML

Страховочная сетка рефакторинга (`docs/refactor/plan.md`, фаза 3, шаги S2–S4): снимки того, как сейчас выглядят
PDF и HTML-страницы книги, и попиксельная сверка двух снимков. Данные — набор книг `tests/fixtures/books.ts`
(без БД, фото рисует sharp).

## Что снимается

**PDF** — `scripts/visual/pdf-snapshot.ts`. Каждая книга набора (23 оформления × A5 и квадрат × ru и kk = 92):
блок `renderInterior(…, "print")` и обложка-развёртка `renderCover(…, "print")`, растр `pdftoppm -r 150`.
Ключи `pdf:block:<книга>` и `pdf:cover:<книга>`, книга — `<оформление>-<формат>-<язык>`.

**HTML** — `scripts/visual/html-snapshot.ts`. `InteriorSpread` во всех видах разворота (`chapter`, `front`, `toc`,
`photos`) шириной 960 px и `PagePreview` редактора — каждая полоса отдельным PNG, ширина полосы 480 px.
Книги: на каждое оформление A5 ru и квадрат kk (у него фото в конце книги) — 46. Данные готовятся так же, как на
страницах сайта (`bookSpreadSample`, главы из `books/[id]/questions`). Chromium через Playwright: окно 1280×900,
deviceScaleFactor 1, анимации выключены. Ключи `html:<вид>:<книга>`, вид — `chapter`, `front`, `toc`, `photos`
или `preview`.

Стенд собирается из `src`: JS — esbuild (вход `scripts/visual/html-stand.tsx`, пути `@/` из tsconfig, `next/link` и
`next/navigation` — заглушка), CSS — `src/app/globals.css` через Tailwind (PostCSS, как в `postcss.config.mjs`),
шрифты — `@font-face` и переменные `--font-*` по `src/app/fonts.ts`, как их делает `next/font/local` (WOFF2 из
`assets/fonts/web`). Фото отдаются по `/api/photos/<id>` из набора.

Снимок — каталог: `manifest.json` вида `{ "<ключ>": { "pages": N, "sha256": ["…", …] } }` и PNG по страницам
`<ключ через />/001.png`, например `pdf/block/classic-a5-ru/001.png`. Хеш — по пикселям (размер и RGBA), а не по
байтам PNG. Если книга не собралась, в записи вместо страниц `error`, а снимок завершается с кодом 1.

## Сверка с коммитом

```sh
scripts/visual/check.sh                  # текущее дерево против HEAD: PDF и HTML, все книги
scripts/visual/check.sh HEAD --quick     # по книге на оформление (A5, ru)
scripts/visual/check.sh main --kind pdf --filter classic-a5
```

`check.sh [ref=HEAD] [--kind pdf|html|all] [--ref-tools] [флаги снимка]` создаёт временный git worktree на `ref` вне репозитория
(`node_modules` — симлинк на здешние), снимает там и в текущем дереве (с незакоммиченными изменениями) с одними
и теми же флагами и сверяет. Инструменты и набор книг (`scripts/visual`, `scripts/preload.mjs`, `tests/fixtures`)
копируются в `ref` из текущего дерева: обе стороны снимаются одинаково, отличаться может только код приложения
(с `--ref-tools` — нет: `ref` снимается своими инструментами).
Результаты — `tests/visual/out/{ref,cur}/<вид>` (в `.gitignore`), диффы — `tests/visual/out/cur/<вид>/diff/`.
Код выхода 1 — есть отличия.

## Эталон и сверка вручную

```sh
npx tsx --import ./scripts/preload.mjs scripts/visual/pdf-snapshot.ts --out tests/visual/out/before/pdf --quick
# …изменения…
npx tsx --import ./scripts/preload.mjs scripts/visual/pdf-snapshot.ts --out tests/visual/out/after/pdf --quick
npx tsx scripts/visual/compare.ts tests/visual/out/before/pdf tests/visual/out/after/pdf
```

Запуск — из корня репозитория. Флаги обоих снимков: `--out <каталог>`, `--filter <подстрока ключа>`
(например `cover`, `luna-square`, `html:preview`), `--quick`, `--jobs N` (по умолчанию ядра − 1; у PDF — дочерние
процессы, у HTML — вкладки Chromium). Путь к Chromium — `CHROMIUM_PATH`, по умолчанию
`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`.

## Что считается отличием

Порог — 0. Отличие — любое из:

- хотя бы один пиксель на любой странице;
- другое число страниц (полос блока, полос превью);
- ключ есть только в одном снимке (например, эталон снят с `--quick`, а текущий — без);
- другая ошибка сборки (или ошибка только с одной стороны).

Для различающихся страниц `compare.ts` пишет PNG-дифф: отличающиеся пиксели красные, совпавшие — бледная текущая
страница; если размер страницы изменился, всё, что выходит за меньшую, тоже красное. Сводка — в выводе, с путями
к диффам.

## Детерминизм

- Время заморожено (`scripts/visual/freeze.ts`): `Date` — 1 мая 2026, 09:00 UTC (год на титуле, обороте и
  концовке, даты в метаданных PDF), `TZ=UTC`. В браузере — `page.clock.setFixedTime`.
- Шум фактуры обложек (`crypto.randomBytes` в `renderCover`) и `Math.random` — генератор с постоянным зерном.
- Каждая книга PDF собирается в своём процессе: результат не зависит от `--jobs` и порядка книг.
- HTML: все начертания загружаются до первой раскладки, снимок — после того, как фото декодированы и разметка
  не меняется три кадра подряд. Любой запрос, который стенд не отдаёт, — ошибка снимка.

Проверено: два прогона текущего дерева (HTML — с `--jobs 3` и `--jobs 2`) — 0 отличий; `check.sh HEAD --quick` —
0 отличий.

Растр зависит от машины: версий poppler, Chromium, libvips (sharp) и системных шрифтов (эмодзи, знаки вне
WOFF2-подмножеств). Сравнивать можно только снимки с одной машины — `check.sh` так и делает.

## Длительность

Замерено на 4 ядрах (`--jobs 3`, разброс — от соседней нагрузки на машину):

| Прогон | PDF | HTML |
|---|---|---|
| полный | 92 книги, 184 ключа, 2828 PNG — 22–25 мин | 46 книг, 230 ключей, 782 PNG — 3–3,5 мин |
| `--quick` | 23 книги, 46 ключей, 667 PNG — 4–6 мин | 23 книги, 115 ключей, 368 PNG — 70 с |

`check.sh` — два снимка каждого вида и сверка (сама сверка — секунды): `--quick` — 12 мин, полный — около часа.
Узкое место PDF — обложка: фон 300 dpi с фактурой (~8 с на сборку) и его растр в pdftoppm (~9 с). Полный
снимок PDF занимает около 400 МБ.

## Ограничения

- `check.sh` берёт инструменты из текущего дерева. Если рефакторинг переносит модуль, который импортирует стенд
  (`pdf/render`, `components/interior/InteriorSpread`, `components/editor/PagePreview`, `server/spreadSample`,
  `app/fonts`), коммиты до переноса сверяются с `--ref-tools` (инструменты в них уже должны быть) — при условии,
  что набор книг между ними не менялся.
- В vitest долгих прогонов нет: `tests/visual-compare.test.ts` проверяет только сверку.
