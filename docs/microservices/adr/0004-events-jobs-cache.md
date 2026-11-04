# ADR 0004. События, очереди и кэш: outbox + NATS + Redis/BullMQ

**Статус:** предложено · **Дата:** 2026-11-05

## Контекст

Сейчас:

- доменные события идут через `outbox_events` (Postgres, `FOR UPDATE SKIP LOCKED`), доставка —
  in-process `InProcessEventBus` после COMMIT;
- Redis опционален: лимиты и TOTP-шаги;
- фоновые задачи — `setInterval` + advisory locks в одном процессе;
- PDF-очередь — in-process.

При нескольких сервисах in-process шина перестаёт работать: событие, опубликованное в `core`, не
увидят `publishing`/`conversations`. Нужен транспорт.

## Решение

1. **Outbox остаётся источником истины.** Событие пишется в БД владельца в той же транзакции.
2. **Relay** публикует событие в **NATS JetStream** после COMMIT; повтор — из outbox.
3. **Потребители** имеют inbox-таблицу `(event_id, consumer)`; обработка идемпотентна.
4. **Очереди задач** — **BullMQ 6 + Redis**: PDF, фото, письма, исходящие сообщения, push, AI-batch.
5. **Redis** — обязательный компонент: лимиты, идемпотентность, прогресс, presence, кэш настроек.
6. **Kafka и RabbitMQ не используем.**

## Почему NATS JetStream

- Один бинарник, ~50–128 МБ, без JVM/Erlang.
- Durable streams, at-least-once, consumer groups, replay, DLQ.
- Достаточно для тысяч событий в сутки и для будущего роста.
- Проще в эксплуатации, чем RabbitMQ/Kafka, на одном VPS.

## Почему BullMQ, а не pg-boss

- Redis всё равно нужен для лимитов/идемпотентности.
- BullMQ даёт ретраи, backoff, DLQ, прогресс, несколько worker'ов, UI (Bull Board).
- pg-boss привязал бы очереди к одной БД и добавил нагрузку на Postgres; при разделении БД это
  неудобно.
- Если Redis станет узким местом — можно вернуться к pg-boss/NATS work queues, но это не сейчас.

## Почему не Kafka

- Тысячи событий в сутки; Kafka рассчитана на миллионы в секунду.
- JVM, KRaft/ZooKeeper, тюнинг, отдельная команда эксплуатации.
- Outbox + NATS закрывает потребность с запасом.

## Почему не RabbitMQ

- Erlang-рантайм, management UI, сложные routing topologies — избыточно.
- NATS легче и достаточно для pub/sub + durable streams.

## Последствия

- +2 компонента (NATS, Redis) и +1 библиотека (BullMQ).
- Нужны: relay, inbox, DLQ, мониторинг lag/очередей, replay.
- События становятся публичным контрактом между сервисами: версионирование, схема, совместимость.
- На волне 1 NATS ещё не нужен: web и api — один релиз, события можно оставить in-process. NATS
  включается на волне 2, когда появляется publishing.
