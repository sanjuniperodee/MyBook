// Сверка бэкенда на Nest с mybook-api (ADR 0014, шаг 2): одни и те же запросы к обоим процессам на сервере, сравниваются
// статус, тело и заголовки кэша. Трафика Nest не получает — сверка запускается руками на сервере:
//   node scripts/microservices/compare-backend.mjs
// С токеном сессии (своим, из приложения или cookie mb_session) — ещё и маршруты с входом по своим заказам, без изменений
// данных (только чтение и заведомо неверные тела):
//   MB_TOKEN=… node scripts/microservices/compare-backend.mjs <id заказа> [<id заказа>…]
// Токен в журнал и вывод не пишется. Выход 1 — есть расхождения.
const OLD = process.env.OLD_URL ?? `http://127.0.0.1:${process.env.MYBOOK_API_PORT ?? 3044}`;
const NEW = process.env.NEW_URL ?? `http://127.0.0.1:${process.env.MYBOOK_BACKEND_PORT ?? 3046}`;
const TOKEN = process.env.MB_TOKEN;
const ORDERS = process.argv.slice(2);
const ZERO = "00000000-0000-4000-8000-000000000000";
const review = (id) => `/api/v1/orders/${id}/review`;
const json = { "content-type": "application/json" };
const bad = { rating: 9, text: "", authorName: "", city: "", consent: false };

/** [название, метод, путь, заголовки, тело] */
const cases = [
  ["health", "GET", "/api/v1/health"],
  ["нет маршрута", "GET", "/api/v1/no-such-route"],
  ["не тот метод", "PATCH", review(ZERO)],
  ["без входа ru", "GET", review(ZERO)],
  ...["kk", "uz", "en"].map((l) => [`без входа ${l}`, "GET", review(ZERO), { cookie: `mb_locale=${l}` }]),
  ["язык заголовком", "GET", review(ZERO), { "x-mb-locale": "en" }],
  ["мусорный Bearer", "GET", review(ZERO), { authorization: "Bearer xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" }],
  ["чужой Origin", "PUT", review(ZERO), { ...json, origin: "https://evil.example" }, "{}"],
  ["PUT без входа", "PUT", review(ZERO), json, JSON.stringify(bad)],
  ["фото без входа", "POST", `${review(ZERO)}/photo`],
  ["удалить фото без входа", "DELETE", `${review(ZERO)}/photo`],
];
if (TOKEN) {
  const auth = { authorization: `Bearer ${TOKEN}` };
  cases.push(["чужой/нет заказа", "GET", review(ZERO), auth], ["кривой номер", "GET", review("not-a-uuid"), auth]);
  for (const id of ORDERS) {
    const s = id.slice(0, 8);
    cases.push(
      [`отзыв ${s}`, "GET", review(id), auth],
      [`отзыв ${s} en`, "GET", review(id), { ...auth, cookie: "mb_locale=en" }],
      [`отзыв ${s}: неверное тело`, "PUT", review(id), { ...auth, ...json }, JSON.stringify(bad)],
      [`отзыв ${s}: не JSON`, "PUT", review(id), { ...auth, ...json }, "{oops"],
      [`отзыв ${s}: фото не multipart`, "POST", `${review(id)}/photo`, { ...auth, ...json }, "{}"],
    );
  }
}

const HEADERS = ["etag", "cache-control", "allow"];

async function call(base, [, method, path, headers = {}, body]) {
  const res = await fetch(base + path, { method, headers: { host: "api.mybooks.kz", ...headers }, body, redirect: "manual" });
  const text = await res.text();
  let parsed = text;
  try {
    parsed = text ? JSON.parse(text) : "";
  } catch {}
  return { status: res.status, body: parsed, headers: Object.fromEntries(HEADERS.map((h) => [h, res.headers.get(h)])) };
}

const canon = (v) => JSON.stringify(v, (_, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x));
let diffs = 0;
for (const c of cases) {
  const [a, b] = await Promise.all([call(OLD, c), call(NEW, c)]);
  const same = a.status === b.status && canon(a.body) === canon(b.body) && canon(a.headers) === canon(b.headers);
  // С ETag — ещё повтор с If-None-Match: оба должны ответить пустым 304.
  let etag = "";
  if (same && a.headers.etag) {
    const again = { ...c[3], "if-none-match": a.headers.etag };
    const [a2, b2] = await Promise.all([call(OLD, [c[0], c[1], c[2], again]), call(NEW, [c[0], c[1], c[2], again])]);
    etag = a2.status === 304 && b2.status === 304 ? " (304 ✓)" : ` (304: ${a2.status}/${b2.status} ✗)`;
    if (!etag.includes("✓")) diffs++;
  }
  console.log(`${same ? "✓" : "✗"} ${c[0]}: ${a.status}${same ? "" : ` / ${b.status}`}${etag}`);
  if (!same) {
    diffs++;
    console.log(`   mybook-api: ${canon(a.headers)} ${canon(a.body).slice(0, 300)}`);
    console.log(`   nest:       ${canon(b.headers)} ${canon(b.body).slice(0, 300)}`);
  }
}
console.log(diffs ? `Расхождений: ${diffs}` : `Одинаково: ${cases.length} запросов`);
process.exit(diffs ? 1 : 0);
