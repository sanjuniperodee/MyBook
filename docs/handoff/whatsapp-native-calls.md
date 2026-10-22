# Звонки WhatsApp из CRM — передача работы (WIP)

Ветка `wa-calls-wip`, в master не вливалась. Цель: **нативный звонок внутри CRM** (без ссылки wa.me и без Meta Cloud API).

## Что нашли
Обычный GOWA v9.6.0 (WhatsApp Web) исходящих звонков и звука не умеет — только `call.offer` и `/call/reject`. Решение есть в
открытом PR **aldinokemal/go-whatsapp-web-multidevice#892** (бета, не влит, голова `474275a`, на библиотеке
[purpshell/meowcaller](https://github.com/purpshell/meowcaller), MIT; требует Go 1.26, **собирается**, проверено локально ~80 с).
Не официальный API: протокол реверс-инжиниринг, ломается при обновлениях WhatsApp, нарушает ToS WhatsApp — возможна блокировка номера.

Протокол шлюза (включается `WHATSAPP_BETA_CALL_ENABLED=true`, тогда `WHATSAPP_AUTO_REJECT_CALL` игнорируется):
- `POST /call/start {"target","audio_file_path"?,"record_path"?}` → `{"call_id","target"}`;
  `POST /call/answer {"call_id"}`; `POST /call/hangup {"call_id"}`; `POST /call/reject {CallerJID, CallID}`.
- `GET /call/audio?device_id=<id>&call_id=<id>` — WebSocket: бинарные кадры **s16le, 16 кГц, моно, 960 сэмплов** в обе стороны
  (микрофон браузера → собеседнику, звук собеседника → браузеру); текстовый кадр `call ended` и закрытие сокета — конец звонка.
  Браузер не может задать заголовки handshake — устройство берётся из `?device_id=`.
- Входящие: вебхук `call.incoming` (как `call.offer`: `payload.call_id`, `payload.from`, `from_lid`) **в дополнение** к `call.offer`.
  События «ответил/завершил» вебхуком нет — только WS дашборда (`CALL_ENDED`) и текстовый кадр в аудио-сокете.

## План (не сделано)
1. **Шлюз**: `deploy/sidecars.sh` — вариант `GOWA_BETA_CALL=1`: `git fetch origin refs/pull/892/head`, сборка `go build` (нужен Go ≥1.26,
   `GOTOOLCHAIN=auto` докачает), бинарь вместо релизного, в `.env` — `WHATSAPP_BETA_CALL_ENABLED=true`.
2. **Прокси аудио-сокета**: Next не умеет WS-upgrade → nginx `location = /wa-call/audio` с `auth_request` на CRM
   (проверка сессии + `calls.make`, ответ с заголовком `X-Gw-Authorization: Basic …` из настройки `gowa.basicAuth`,
   `auth_request_set` → `proxy_set_header Authorization`), `proxy_pass http://127.0.0.1:3020/call/audio?device_id=mybooks&call_id=$arg_call_id`
   с Upgrade/Connection. Секреты остаются в CRM, не в nginx.
3. **GowaClient**: `callStart/callAnswer/callHangup/callReject`; события вебхука `call.incoming` (+ `WEBHOOK_EVENTS`); при включённой бете
   `call.offer` игнорировать (иначе звонок сразу закроется «пропущенным»).
4. **Журнал**: исходящий — запись после ответа `/call/start` (`externalId = call_id`); входящий `call.incoming` → `ringing`
   (живая карточка с «Ответить/Отклонить» в `IncomingCall`); `answer`/`end` с длительностью от браузера; устаревшие `ringing`
   (>90 с) закрывать как пропущенные (в `scheduler.ts`).
5. **Браузер**: глобальная панель звонка (`AudioContext({sampleRate:16000})` + AudioWorklet из `/public`, буфер 960 сэмплов,
   очередь воспроизведения), таймер, mute, «Завершить»; «ответил» — по первым кадрам звука собеседника (эвристика, дать
   исправить итог вручную). Нужен https/localhost для микрофона.
6. Тест аудио-пайплайна: Playwright с `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream` против заглушки WS-шлюза.

## Что уже в ветке (сделано до смены подхода)
- Входящие `call.offer` → журнал звонков (`parseGowaCall`, `provider=whatsapp`, пропущенный, заявка, уведомление, правила), тесты.
- `CallEvent.staffId`, `CallsService.startWhatsapp/finishWhatsapp`, `DrizzleCallQueries.pendingWhatsapp`.
- **Подход «ссылка wa.me + плашка итога»** (`WhatsappCallButton`, `WhatsappCallFollowUp`, `whatsappCallAction`/`finishWhatsappCallAction`) —
  пользователь от него отказался; при переходе на нативные звонки заменить (кнопка и панель остаются, логика другая).
- Подпись звонков WhatsApp в журнале, исключение исходящих WhatsApp из живой карточки.
- Состояние: `tsc`/lint/тесты на момент остановки не прогонялись целиком (telephony/gowa тесты проходили).
