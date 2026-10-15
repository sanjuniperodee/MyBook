/**
 * Сборная схема БД: её читают drizzle-kit (drizzle.config.ts), `db` (реляционные запросы db.query), отчёты и типы строк в lib.
 * Таблицы лежат по владельцам в schema/<модуль>.ts, связи для db.query — в schema/relations.ts.
 *
 * Схема — общее ядро, а не часть модулей: одна БД, внешние ключи идут через границы контекстов (заказ → клиент и книга,
 * сделка → заказ), а отчёты читают таблицы всех. Поэтому файлы лежат в shared и не импортируют модули: значения колонок
 * (статусы, типы полей) объявлены в shared/domain. Ссылки внешних ключей ленивые (() => таблица.id), так что взаимные
 * импорты файлов (users ↔ crmRoles) безопасны.
 */
export * from "./schema/access";
export * from "./schema/authoring";
export * from "./schema/automation";
export * from "./schema/clients";
export * from "./schema/feedback";
export * from "./schema/identity";
export * from "./schema/marketing";
export * from "./schema/messaging";
export * from "./schema/notifications";
export * from "./schema/ordering";
export * from "./schema/outbox";
export * from "./schema/referrals";
export * from "./schema/relations";
export * from "./schema/sales";
export * from "./schema/telephony";
export * from "./schema/workspace";
