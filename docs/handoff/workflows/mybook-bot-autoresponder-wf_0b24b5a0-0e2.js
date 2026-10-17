export const meta = {
  name: 'mybook-bot-autoresponder',
  description: 'Автоответчик (бот-квалификатор) MyBook: аудит на коде и данных прода, улучшения, независимая проверка',
  phases: [
    { title: 'Audit', detail: 'код бота, настройки и реальные диалоги на проде (только чтение)' },
    { title: 'Build', detail: 'улучшения в своём worktree' },
    { title: 'Verify', detail: 'независимая проверка и исправления' },
  ],
}

const BASE = '8362b40'
const MAIN_WT = '/Users/sanjuniperodee/MyBook/.claude/worktrees/funny-tesla-gsqj79'
const SSH = 'ssh -i ~/.ssh/bilimland-prod/ssh-key-1778196525864 -o BatchMode=yes -l sanjuniperodee 5.35.105.111'

const CONTEXT = `Проект MyBook (персональные книги-подарки, Казахстан, клиенты пишут в WhatsApp на русском и казахском). В CRM есть автоответчик — бот-квалификатор: src/modules/messaging/domain/botConfig.ts (приветствие, вопросы → свои поля сделки, финал, разбор дат и вариантов), класс QualifierBot в src/modules/messaging/application/services.ts (запускается на входящее сообщение, режимы off | always | off_hours, останавливается, когда отвечает менеджер), настройки — src/modules/messaging/infrastructure/adapters.ts (crmBotSettings: bot.mode, bot.config), форма в админке — src/app/admin/settings/crm/BotForm.tsx и actions.ts. Рядом: модуль assistant (src/modules/assistant — AI-провайдеры для помощника менеджера), цены и тарифы (админка «Цены и тарифы», src/config/site), график работы (workspace), свои поля сделки, задачи и уведомления менеджеру, распределение заявок по кругу (docs/features/lead-routing.md), проверка исходящих на номера/карты (защита от «левака»).
Владелец просит: «сделай улучшения автоответчика бота максимально». Параллельно в этой же ветке готовятся новые режимы книги «Автобиография» (theme=autobiography) и «Вручную — своя книга с нуля» (theme=blank) — бот должен знать про них как про варианты «для кого книга».`

const AUDIT = `${CONTEXT}

Этап: АУДИТ, только чтение. Ничего не меняй ни локально, ни на проде.
1. Код: прочитай всё про бота и путь входящего сообщения (${MAIN_WT}): кто и когда запускает бота, как хранится шаг (botStep, advanceBot), что пишется в сделку, что видит менеджер, как бот ведёт себя с голосовыми, фото, стикерами, повторными клиентами, клиентами с заказами, в нерабочее время, при ответе менеджера, при нескольких сообщениях подряд, на казахском. Тесты бота в tests/.
2. Прод (разрешено владельцем, только SELECT): ${SSH} 'sudo -u postgres psql -At mybook -c "<SELECT>"'. Посмотри: значения bot.mode и bot.config в crm_settings; сколько диалогов прошёл бот за 60 дней, на каком шаге клиенты бросают, сколько ответов не распознано (дата, варианты), как быстро потом отвечает менеджер, что клиенты пишут первым сообщением (частые намерения: цена, сроки, как это работает, пример, доставка, казахский язык, голосовые), какие вопросы клиенты задают боту вместо ответа. Данные клиентов в отчёт — только обезличенно: без телефонов и имён, цитаты сокращай и маскируй.
3. Найди слабые места и предложи улучшения по приоритету. Ориентиры (проверь по данным, добавь свои): язык клиента (kk/ru) — бот отвечает на нём; разбор первого сообщения и пропуск уже отвеченных вопросов («книгу маме на юбилей 15 ноября»); свободные ответы, «не знаю», «пропустить», переспросить один раз; мгновенные ответы на частые вопросы (цена — только из настроек тарифов, сроки, как это работает, оплата, доставка) с продолжением квалификации; «позовите менеджера / позвоните» — бот замолкает и срочно зовёт ответственного; голосовые и фото — вежливое подтверждение; нерабочее время — когда ответит менеджер; не дёргать повторных клиентов и клиентов с заказом тем же сценарием; ссылка начать книгу на сайте с нужной темой (/books/new?theme=… или /register?theme=…); варианты «для кого» с новыми режимами (о себе — автобиография; своя книга с нуля); итог менеджеру с распознанными полями; тест-режим в админке (прогнать диалог без отправки); метрики бота в админке; использование AI-провайдера (если настроен) для разбора намерений с детерминированным запасным путём, без выдуманных цен и обещаний.
Верни подробный отчёт: как устроено сейчас (с путями и строками), факты с прода (цифры), проблемы с доказательствами, и план улучшений по приоритету с описанием поведения и затрагиваемых файлов.`

const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    current: { type: 'string' },
    prodFacts: { type: 'string' },
    problems: { type: 'array', items: { type: 'string' } },
    plan: {
      type: 'array',
      items: {
        type: 'object',
        properties: { title: { type: 'string' }, priority: { type: 'string' }, behavior: { type: 'string' }, files: { type: 'string' } },
        required: ['title', 'priority', 'behavior', 'files'],
      },
    },
  },
  required: ['current', 'prodFacts', 'problems', 'plan'],
}

const RESULT = {
  type: 'object',
  properties: {
    branch: { type: 'string' },
    commit: { type: 'string' },
    summary: { type: 'string' },
    files: { type: 'array', items: { type: 'string' } },
    checks: { type: 'string' },
    deviations: { type: 'string' },
    followUps: { type: 'array', items: { type: 'string' } },
  },
  required: ['branch', 'commit', 'summary', 'files', 'checks', 'deviations', 'followUps'],
}

const RULES = `Правила проекта: Next.js с изменёнными API (AGENTS.md — читай node_modules/next/dist/docs при работе со страницами и server actions); модули src/modules/* не импортируют друг друга, связи — портами в src/server/container.ts; тексты для клиента — в словарях или в настройках бота на ru и kk (tests/i18n.test.ts ловит кириллицу вне словарей; CRM-строки — по исключениям этого теста); вход действий — zod, права — assertStaff, audit; казахский — грамотный и естественный. Комментарии и коммиты — по-русски в стиле репозитория, в конце коммита: Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>. Миграции: если нужна новая — npm run db:generate (номер будет после 0034; параллельно другая работа добавит 0035 — назови свою осмысленно, при слиянии номер поправят). Не пушь, не деплой, на проде ничего не меняй и не отправляй сообщений.
Подготовка worktree: убедись, что ты не в ${MAIN_WT}; git merge-base --is-ancestor ${BASE} HEAD || git reset --hard ${BASE}; нет node_modules — ln -s ${MAIN_WT}/node_modules node_modules; база для интеграционных тестов: export DATABASE_URL=$(grep -o 'DATABASE_URL=[^ ]*' ${MAIN_WT}/.env | cut -d= -f2-).
Проверки перед коммитом: npx tsc --noEmit -p . ; npx eslint . ; npx vitest run — зелёные.`

phase('Audit')
const audit = await agent(AUDIT, { label: 'Аудит бота', phase: 'Audit', schema: PLAN_SCHEMA })
if (!audit) return { failed: 'audit' }

phase('Build')
const build = await agent(`${CONTEXT}

${RULES}
Ветка: git checkout -b bot/autoresponder. В конце: git add -A && git commit, затем git branch -f bot-done/autoresponder HEAD.

Этап: РЕАЛИЗАЦИЯ. Аудит (JSON):
${JSON.stringify(audit)}

Сделай улучшения из плана — максимально полно, начиная с высокого приоритета; каждое — до конца: поведение, тексты ru/kk, настройки в админке (BotForm), обратная совместимость с сохранённым bot.config на проде (старый формат должен читаться), тесты (юнит на разбор и сценарии диалога с двойниками, включая гонки: ответ менеджера посреди сценария, два сообщения подряд, повторная доставка вебхука). Бот не должен: спамить, отвечать после ответа менеджера, обещать цены и сроки не из настроек, отправлять номера/карты, ломать распределение заявок. Если что-то из плана сознательно не делаешь — объясни в deviations.
Верни branch, commit (полный sha), summary, files, checks, deviations, followUps.`, { label: 'Улучшения бота', phase: 'Build', isolation: 'worktree', schema: RESULT })
if (!build) return { audit, failed: 'build' }

phase('Verify')
const verify = await agent(`${CONTEXT}

${RULES}
Этап: НЕЗАВИСИМАЯ ПРОВЕРКА. Другой исполнитель сделал улучшения в ветке ${build.branch} (коммит ${build.commit}; копия ссылки bot-done/autoresponder). Создай свою ветку от его коммита: git checkout -b bot/autoresponder-verified ${build.commit}.
Его отчёт: ${JSON.stringify(build)}
План аудита: ${JSON.stringify(audit.plan)}
Проверь придирчиво, пытаясь сломать: сценарии диалога на ru и kk (по шагам, с реальными формулировками клиентов из аудита), гонки с ответом менеджера и повторными вебхуками, режимы off/always/off_hours, нерабочее время, повторные клиенты и клиенты с заказом, голосовые/фото, «позовите менеджера», FAQ-ответы (цены только из настроек), чтение старого bot.config с прода (формат из аудита), админку (форма, тест-режим, права), отсутствие кириллицы вне словарей, архитектурные правила, покрытие тестами. Найденное — исправь и допиши тесты. Прогони все проверки. Закоммить (git add -A && git commit), затем git branch -f bot-done/autoresponder-verified HEAD.
Верни branch, commit (полный sha), summary (что нашёл и исправил), files, checks, deviations, followUps.`, { label: 'Проверка бота', phase: 'Verify', isolation: 'worktree', schema: RESULT })

return { audit, build, verify }
