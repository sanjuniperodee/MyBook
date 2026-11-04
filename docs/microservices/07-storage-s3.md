# 07. Объектное хранилище: Yandex Object Storage (S3)

> Решение: внешний S3-совместимый бакет **Yandex Object Storage**, бакет `mybooks`.
> Локальные ключи доступа лежат **вне репозитория** — см. «Где хранятся ключи».

## 1. Почему так

- Локальный том `storage/` — общий диск для веба и PDF; при нескольких сервисах это скрытая связь
  и точка отказа.
- MinIO на том же VPS съедает 200–300 МБ RAM, которой и так впритык (8 ГБ, общий сервер).
- Yandex Object Storage уже создан, даёт S3 API, versioning/lifecycle и не занимает память на VPS.
- Бакет нужен publishing/медиа: фото книг, PDF, превью, вложения, чеки.

## 2. Параметры

| Параметр | Значение |
|---|---|
| Провайдер | Yandex Cloud Object Storage |
| Endpoint | `https://storage.yandexcloud.net` |
| Region | `ru-central1` |
| Bucket | `mybooks` |
| Профиль AWS CLI | `yc-storage` |
| Стиль адресации | virtual-hosted (`https://mybooks.storage.yandexcloud.net/...`); path-style не нужен |
| Публичный доступ | **закрыт**; только подписанные URL / серверные credentials |

## 3. Где хранятся ключи

**В репозитории ключей нет и не будет.** Они лежат в двух локальных местах с правами `600`:

1. `~/.aws/credentials` — профиль `yc-storage` для AWS CLI и SDK.
2. `.env.local` в корне репозитория — переменные `S3_*` для приложения (файл в `.gitignore`).

Если ключ попал в чат/лог/коммит — считайте его скомпрометированным: перевыпустите в Yandex Cloud
и обновите оба места. В документации и `.env.example` — только имена переменных.

### Переменные для сервисов

```sh
S3_ENDPOINT=https://storage.yandexcloud.net
S3_REGION=ru-central1
S3_BUCKET=mybooks
S3_ACCESS_KEY_ID=…
S3_SECRET_ACCESS_KEY=…
S3_FORCE_PATH_STYLE=false
```

Для AWS CLI:

```sh
aws configure --profile yc-storage
# Access Key ID, Secret Access Key, region ru-central1, output json
```

Или без интерактива (ключи не печатать в терминал):

```sh
aws configure set aws_access_key_id "$S3_ACCESS_KEY_ID" --profile yc-storage
aws configure set aws_secret_access_key "$S3_SECRET_ACCESS_KEY" --profile yc-storage
aws configure set region ru-central1 --profile yc-storage
aws configure set output json --profile yc-storage
chmod 600 ~/.aws/credentials ~/.aws/config
```

## 4. Проверка доступа

```sh
aws --profile yc-storage \
  --endpoint-url https://storage.yandexcloud.net \
  s3 ls "s3://mybooks/" --recursive

aws --profile yc-storage \
  --endpoint-url https://storage.yandexcloud.net \
  s3api head-bucket --bucket mybooks
```

Пустой бакет — это нормально: команда `s3 ls` завершится без вывода.

### Статус проверки (2026-11-05)

Профиль `yc-storage` создан, ключи лежат локально с правами `600`. Проверка доступа вернула:

- `head-bucket` → `403 Forbidden`;
- `list-buckets` / `s3 ls` → `403 SignatureDoesNotMatch`.

Подпись не сходится: это неверный секрет/ключ, опечатка или ключ от другого аккаунта. До проверки
и перевыпуска ключей publishing/медиа на S3 не переключать. Профиль и документы при этом готовы:
после замены ключей достаточно повторить команды из раздела 4.

## 5. Ключи объектов

Сохраняем текущую схему, чтобы миграция была копированием, а не переписыванием ссылок:

```
photos/<bookId>/<photoId>.<ext>
photos/<bookId>/<photoId>-thumb.<ext>
pdf/<bookId>/<version>/block.pdf
pdf/<bookId>/<version>/cover.pdf
pdf/<bookId>/<version>/package.zip
receipts/<paymentId>/<file>
publish/<orderId>/<file>
bot-media/<...>
```

Правила:

- Ключ — только из доверенных ID, не из пользовательского имени файла.
- Оригинал и производные (thumb, preview) — отдельные ключи; версия — в ключе или метаданных.
- Никаких публичных ACL; доступ — подписанный URL с TTL 5–15 минут или серверный поток.
- Для больших PDF/видео — multipart upload; для отдачи — range requests.

## 6. Код (когда дойдём до publishing)

Пакеты: `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`.

```ts
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3 = new S3Client({
  region: process.env.S3_REGION,
  endpoint: process.env.S3_ENDPOINT,
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
  },
});
```

Требования:

- Таймауты и retry (SDK v3 умеет; задать `maxAttempts`).
- Не логировать ключи/подписанные URL.
- Не отдавать `ListBucket` клиенту.
- Для локальных тестов — MinIO в `infra/compose` (тот же S3 API), но прод — Yandex.

## 7. Миграция с локального тома

1. Включить versioning на бакете.
2. Скопировать `storage/` в бакет с сохранением ключей:
   `aws s3 sync storage/ s3://mybooks/ --profile yc-storage --endpoint-url ...`.
3. Сверить количество/размеры (`s3 ls --recursive` vs `find storage -type f`).
4. Переключить чтение на S3 за флагом; старый том оставить read-only на один релиз.
5. После стабилизации — отключить запись в том.

## 8. Бэкапы и жизненный цикл

- Versioning: включён; старые версии — 30–90 дней.
- Lifecycle: превью/временные — 7–30 дней; оригиналы и печатные PDF — по политике.
- Ежедневный список объектов + ежемесячная проверка восстановления одного файла.
- Не полагаться на «бакет = бэкап»: БД и бакет бэкапятся отдельно, но согласованно (ID книги/заказа).

## 9. Безопасность

- Бакет приватный; публичных объектов нет.
- Ключи — только в env/профиле; ротация при утечке.
- Подписанные URL — короткий TTL, только на конкретный объект.
- CORS — только если браузер грузит файлы напрямую; иначе отдаём через сервер.
- PII: фото/письма клиентов — персональные данные; доступ только владельцу/сотруднику с правом.
- Логи S3 (access logs) — включить, если доступно в тарифе.

## 10. Открытые вопросы

| # | Вопрос | Когда |
|---|---|---|
| S1 | Нужен ли CDN перед бакетом для фото/PDF? | после волны 2, по метрикам |
| S2 | Где держать бэкап бакета (второй бакет/регион)? | до волны 2 |
| S3 | Кто и как ротирует ключи? | до продакшена publishing |
| S4 | Нужен ли отдельный бакет для бэкапов/логов? | до волны 2 |
