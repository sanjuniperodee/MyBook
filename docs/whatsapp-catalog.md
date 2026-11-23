# Каталог WhatsApp Business из CRM

Менеджеры ведут каталог товаров WhatsApp номера магазина (+7 777 593 21 24) прямо из CRM и отправляют товары клиентам
карточкой WhatsApp. Источник правды — каталог в WhatsApp; у нас копия (`wa_catalog_products`) для списка и выбора в чате.

## Что умеет WhatsApp Business с каталогом

- Товары: название, описание, цена и валюта (в протоколе — в тысячных долях: 25 000 ₸ → `25000000`), цена со скидкой,
  до 10 фото, видео, ссылка, артикул (`retailer_id`), «скрыт/виден», страна происхождения. Каждый товар проходит
  проверку WhatsApp (`APPROVED`, `PENDING`, `REJECTED`, `OUTDATED` — повторная проверка после правки; до одобрения
  клиент товар не видит). Отклонённый можно обжаловать.
- Коллекции (группы товаров), корзина (клиент собирает заказ и присылает его в чат — сообщение `OrderMessage`).
- В чат: карточка товара (`ProductMessage` — фото, цена, «Написать продавцу», «В корзину»), ссылка на весь каталог
  `https://wa.me/c/<номер>` (WhatsApp показывает превью каталога).
- Каталог есть только у бизнес-аккаунта. Наш номер — бизнес: `commerce_experience=catalog`, `cart_enabled=true`
  (`GET /user/business-profile`), каталог «WhatsApp Product Catalog», тип `NATIVE`, id `1136419102328140`.

## Протокол (проверено на нашем номере 23.11.2026)

Старые IQ `w:biz:catalog` (`product_catalog`, `product_catalog_add/edit/delete`, `collections` — так делает Baileys
`getCatalog/productCreate/…`) WhatsApp больше не обслуживает: запрос уходит, ответа нет (Baileys #2717, сентябрь 2026).
WhatsApp Web теперь работает так (модули сборки WhatsApp Web — репозиторий `vinikjkkj/wa-diff`; та же схема — в Go-форке
whatsmeow `wppconnect-team/hypermeow`):

1. **Чтение, как видит клиент** — публичный GraphQL без сессии: `POST https://graph.whatsapp.com/graphql/catalog`,
   `access_token = WA|787118555984857|7bb1544a3599aa180ac9a3f7688ba243` (токен приложения из WhatsApp Web), `doc_id
   30445081048424116`, `variables.request.product_catalog = {jid: "<номер>@s.whatsapp.net", limit, after, width, height, …}`.
   Скрытых и непроверенных товаров здесь нет.
2. **Токен для правок** — по сокету WhatsApp (умеет только привязанное устройство, поэтому это делает шлюз):
   - `<iq xmlns="fb:thrift_iq" type="get" smax_id="118"/>` (RequestSilentNonce) → `<result status="Success"/>`
     (или `RecoveryRequired email=…` — тогда нужно подтвердить почту бизнеса в приложении);
   - сервер присылает уведомление `<notification type="business"><wa_ad_account_nonce>КОД</…>`. whatsmeow такие
     уведомления молча глотает — наша правка `deploy/gowa-beta/whatsmeow-01-business-notification.patch` отдаёт их
     шлюзу событием;
   - `<iq xmlns="fb:thrift_iq" type="get" smax_id="104"><parameters><code>КОД</code></parameters></iq>`
     (GetAccessTokenAndSessionCookies) → `<access_token>`, `<business_person id=…>`, `<token_type>Strong</…>`.
3. **Правки и чтение глазами владельца** — сохранённые GraphQL-операции на `https://graph.facebook.com/graphql` с этим
   токеном, `{access_token, doc_id, variables, locale}`, заголовок `X-WA-Device-ID: <номер устройства>`:

   | Операция | doc_id | variables |
   |---|---|---|
   | каталог владельца (со скрытыми) | 9957894520961099 | `{request: {product_catalog: {jid: <LID>, width, height, limit, after}}}` |
   | добавить товар | 24249359867999500 | `{input: {product: {biz_jid: <LID>, width, height, product_info}, actor_id}}` |
   | изменить товар | 9889773371084956 | то же + `product.product_id` |
   | удалить товары | 9376108569185474 | `{input: {biz_jid: <LID>, product_ids: […], actor_id}}` |
   | видимость | 9665162096898581 | `{input: {jid: <LID>, products: [{product_id, is_hidden}], actor_id}}` |

   `product_info = {name, description?, url?, retailer_id?, currency, price: "<×1000>", is_hidden, media: {image: [{url}], video: [{url}]}}`.
   Подводные камни (на каждом получали «Bad Request Error while getting catalog»):
   - бизнес адресуется **LID** номера (`94687587229775@lid`), не `77775932124@s.whatsapp.net`;
   - `actor_id` — id бизнес-персоны из ответа токена;
   - фото: загрузка без шифрования на `https://<media-host>/product/image/<sha256>` (как Baileys
     `product-catalog-image`), в `product_info` — `https://mmg.whatsapp.net` + `direct_path` ответа (не его `url`);
   - правка заменяет товар целиком: фото и **видео** надо передать заново, иначе пропадут; правка товара с видео
     перезаливает видео и отправляет товар на повторную проверку (`OUTDATED`) — до одобрения клиент его не видит.
4. **Карточка товара в чат** — обычное сообщение `ProductMessage` (whatsmeow отправляет как есть, `mediatype=product`):
   снимок товара (id, название, цена `priceAmount1000`, фото — зашифрованная загрузка как у обычного фото),
   `businessOwnerJID` — наш номер. Клиент открывает карточку и видит товар из каталога.
5. **Ссылка на каталог** — текст с `https://wa.me/c/<номер>` (`ExtendedTextMessage` с `matchedText`, заголовком и
   миниатюрой — подсказка из whatsmeow #118).
6. **Корзина клиента** — `OrderMessage` (шлюз отдаёт его в вебхуке полем `order`); состав — IQ `fb:thrift_iq`
   `order op=get` (`whatsmeow.GetOrderDetails`, нужен токен из сообщения).

Коллекции (создание/правка: doc 29361942130088470 / 24486970300891371 / 29970196299234260) протокол позволяет, в CRM
пока не выведены — у магазина 2 товара.

## Что в шлюзе (deploy/gowa-beta/gowa-03-catalog.patch)

| Метод | Что делает |
|---|---|
| `GET /catalog/token` | получить/проверить токен правок; отдаёт `business_person_id`, `jid`, `lid` (сам токен остаётся в шлюзе) |
| `POST /catalog/graphql` | `{doc_id, variables, locale}` → GraphQL Facebook с токеном (при отказе токена — новый токен и повтор) |
| `POST /catalog/upload-image` | файлы `image` → адреса фото для `product_info.media` |
| `POST /catalog/send-product` | `{phone, product: {product_id, title, description, currency, price_amount_1000, image_url, …}}` → карточка товара |
| `POST /catalog/send-link` | `{phone, text, title, description, image_url}` → ссылка на каталог с превью |
| `GET /catalog/order` | `order_id`, `token` → состав корзины |
| `GET /catalog/image` | фото из WhatsApp (только хосты whatsapp.net / fbcdn) — для копии в CRM |

Форматы операций (doc_id, поля) живут в CRM (`src/modules/messaging/infrastructure/waCatalog.ts`): если WhatsApp сменит
doc_id, правится сайт, а не шлюз. Сборка шлюза — `deploy/gowa-beta-build.sh` (правка whatsmeow подключается `replace`).

## Что в CRM

- **Выпуск → «Каталог WhatsApp»** (`/admin/catalog`, право «Вести каталог товаров WhatsApp» — у руководителя и в роли
  «Менеджер продаж» по умолчанию; у уже созданных ролей включается в «Команде»): список с фото, ценой, статусом проверки,
  «скрыт»; добавить, изменить, скрыть/показать, удалить; «Обновить из WhatsApp» (товары, заведённые в приложении, тоже
  попадают сюда).
- **Чат**: кнопка «Товар из каталога» → выбор → карточка уходит клиенту; там же «Весь каталог» — ссылка. Товар или
  корзина от клиента — карточкой (у корзины — «Показать состав»).
- **Интеграции → Мессенджеры → «Каталог WhatsApp»**: включить в чатах, текст и превью ссылки на каталог, подпись под
  карточкой (`{name}`, `{price}`), валюта новых товаров, можно ли отправлять скрытые.

## Ограничения

- Правки идут от имени «бизнес-персоны» номера через токен рекламного аккаунта WhatsApp. Если WhatsApp ответит
  `RecoveryRequired`, нужно подтвердить почту бизнеса в приложении WhatsApp Business — CRM покажет это текстом.
- doc_id операций взяты из сборки WhatsApp Web осени 2026; WhatsApp их меняет — тогда правки вернут ошибку GraphQL, а
  чтение и отправка карточек продолжат работать. Новые doc_id — в модулях `*_facebookRelayOperation` WhatsApp Web.
- Видео к товару из CRM не добавляется (только сохраняется при правке) — добавлять в приложении.
