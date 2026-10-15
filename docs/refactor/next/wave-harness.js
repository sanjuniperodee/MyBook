export const meta = {
  name: 'refactor-phase4-wave',
  description: 'Фаза 4 рефакторинга MyBook: шаги плана по дорожкам — исполнитель, состязательный ревьюер, исправления',
  whenToUse: 'Волна шагов фазы 4: args = { base, tracks: [[{id, branch, title, prompt}]] }',
  phases: [
    { title: 'Шаги', detail: 'исполнитель шага в своём worktree' },
    { title: 'Ревью', detail: 'состязательный ревьюер диффа шага' },
    { title: 'Исправления', detail: 'исправление блокирующих замечаний' },
  ],
}

const COMMON = `Ты работаешь в репозитории MyBook (Next.js 16 — читай node_modules/next/dist/docs/ перед правками API Next; React 19; TypeScript; vitest; drizzle) в отдельном git worktree — это твой текущий каталог. Основной репозиторий /home/user/MyBook не трогай (ни файлов, ни веток, кроме своей).
Контекст: «ультрарефакторинг» по docs/refactor/plan.md (прочитай «Решения», фазу 4 и свой шаг) и docs/refactor/audit.md (номера строк в аудите — на момент аудита, ищи по смыслу). Фаза 3 (страховочная сетка) готова: tests/architecture.test.ts (храповик границ, baseline tests/architecture-baseline.json — только убывает: если нарушение исчезло, удали строку), характеристические тесты tests/characterization/*, тесты сервисов и адаптеров, tests/pdf-critical.test.ts, визуальная сверка scripts/visual (tests/visual/README.md).
Критерии «готово» проекта: поведение не меняется (кроме согласованных решений и багов — отдельными коммитами «Исправление: …»); tsc, eslint, vitest, next build без ошибок и предупреждений; ни одного прямого импорта между модулями (к концу фазы); тонкий app/; чистый домен; одно место на каждую формулу и правило; файлы ≤ ~300 строк, функции ≤ ~60; единый словарь (книга Book, глава Chapter, вопрос Question, ответ в вёрстке Entry, блок набора AnswerBlock, полоса Page, разворот Spread, лист Leaf, оформление InteriorDesign/design, id — interiorId, обложка Cover); без мёртвого кода; ошибки — HttpError/коды словаря; права в каждом роуте и действии; zod на все входы; без секретов в логах; без новых зависимостей.

Подготовка (первым делом — worktree создан от старого коммита):
1. \`git checkout -B BRANCH START\` и проверь \`git log --oneline -3\`.
2. Если нет node_modules — \`cp -al /home/user/MyBook/node_modules node_modules\` (копия на жёстких ссылках: с симлинком Turbopack отказывается собирать — «out of the filesystem root»). Shell между вызовами может сбрасывать текущий каталог — проверяй \`pwd\`, работай в своём worktree.

Правила:
- Не меняй без указания в шаге: схему БД (кроме аддитивных миграций), публичные URL, форматы хранения, ключи настроек, тексты интерфейса, вид PDF и обложек. Тексты переносить можно дословно.
- Не переписывай с нуля — переноси и своди существующий код; сохраняй комментарии, которые объясняют «почему».
- Стиль: комментарии по-русски, коротко, плотность как в окружающем коде; имена по словарю.
- Не ослабляй линтер, типы, тесты: не удаляй проверки, не переписывай снимки без причины. Если снимок характеристического теста меняется — это изменение поведения: допустимо только когда шаг явно его требует; перечисли каждое.
- После каждого логического шага (и перед каждым коммитом): \`npx tsc --noEmit -p .\`, \`npx eslint --max-warnings 0 .\`, полный \`npx vitest run\` — всё зелёное. Если шаг трогает вёрстку книги, обложки, 3D или превью — визуальная сверка: \`bash scripts/visual/check.sh START <флаги из README; минимум --quick>\` → 0 отличий (иначе — объясни и исправь, либо это согласованное изменение шага). В конце работы — \`npx next build\` без ошибок и предупреждений (долго: запусти один раз в конце; если шаг не трогает app/ и components/ — можно пропустить и написать почему).
- Атомарные коммиты (один шаг плана — один или несколько коммитов, после каждого всё зелёное), сообщение по-русски в стиле \`git log\`; в конце две строки:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TCkKVGKZxLstnqVKdU8qnm
- Не пушь, ничего не деплой, ничего не запускай против продакшена.
- Верни структурированный результат: ветка, SHA коммитов, что сделано по пунктам шага, что сознательно не сделано и почему, изменения поведения (если есть — каждое), итоги проверок с числами, метрики (сколько нарушений границ, файлов > 300 строк в затронутой области — до/после), заметки для следующих шагов.`

const RESULT = {
  type: 'object',
  properties: {
    branch: { type: 'string' },
    worktree: { type: 'string', description: 'абсолютный путь worktree, где лежит ветка (pwd)' },
    commits: { type: 'array', items: { type: 'string' } },
    done: { type: 'string' },
    notDone: { type: 'string' },
    behaviorChanges: { type: 'string' },
    checks: { type: 'string' },
    notes: { type: 'string' },
  },
  required: ['branch', 'worktree', 'commits', 'done', 'notDone', 'behaviorChanges', 'checks', 'notes'],
}

const REVIEW = {
  type: 'object',
  properties: {
    blocking: { type: 'array', items: { type: 'object', properties: { file: { type: 'string' }, issue: { type: 'string' }, fix: { type: 'string' } }, required: ['file', 'issue', 'fix'] } },
    nits: { type: 'array', items: { type: 'string' } },
    verdict: { type: 'string' },
  },
  required: ['blocking', 'nits', 'verdict'],
}

const stepPrompt = (step, start) => `${COMMON.replace('BRANCH', step.branch).replace(/START/g, start)}\n\nВетка: ${step.branch}, от ${start}.\n\nШаг ${step.id}: ${step.title}\n${step.prompt}`

const reviewPrompt = (step, start, result) => `Ты — состязательный ревьюер шага рефакторинга MyBook (/home/user/MyBook). Ничего не меняй в основном дереве и чужих ветках. Для проверок создай временный worktree: \`git worktree add /tmp/review-${step.branch.replace(/\//g, '-')} ${step.branch}\`, в нём \`cp -al /home/user/MyBook/node_modules node_modules\`, и удали его в конце (\`git worktree remove --force\`).
Шаг ${step.id} «${step.title}», дифф: \`git diff ${start}..${step.branch}\`. Задание шага:
${step.prompt}
Отчёт исполнителя:
${JSON.stringify(result, null, 1)}
Прочитай docs/refactor/plan.md («Решения», фаза 4) и критерии в нём. Ищи, исходя из того, что ошибки есть:
- изменения поведения, не требуемые шагом (тексты, URL, статусы, порядок, обработка ошибок, вид PDF/HTML, SQL);
- нарушенные инварианты и граничные случаи при переносе кода (потерянная ветка условия, иной порядок побочных эффектов, другой часовой пояс, другое округление);
- ослабленные проверки: удалённые утверждения, переписанные снимки без причины, eslint-disable, any, @ts-ignore;
- новые нарушения границ модулей; дубли, которые шаг должен был свести, но оставил; новый мёртвый код; файлы > ~300 строк и функции > ~60 в затронутом коде; имена вне словаря;
- что из задания шага не сделано.
Запусти tsc, eslint, полный vitest; для шагов, трогающих вёрстку — визуальную сверку scripts/visual/check.sh ${start} --quick. Блокирующие — только реальные проблемы с конкретным исправлением; мелочи — в nits.`

const fixPrompt = (step, start, review) => `${COMMON.replace('BRANCH', step.branch).replace(/START/g, start).replace(`\`git checkout -B ${step.branch} ${start}\``, `\`git checkout ${step.branch}\``)}\n\nВетка: ${step.branch} (уже существует, продолжи её; база шага — ${start}).\n\nШаг ${step.id}: ${step.title}\n${step.prompt}\n\nРевьюер нашёл блокирующие проблемы — исправь каждую (или обоснуй, почему это не проблема) отдельными коммитами и прогони все проверки:\n${JSON.stringify(review, null, 1)}`

const inDir = (dir) => `Работай В СУЩЕСТВУЮЩЕМ worktree ${dir} (ветка уже выбрана там; новую ветку и новый worktree не создавай). Shell между вызовами сбрасывает каталог — каждую команду выполняй как \`cd ${dir} && …\` или с абсолютными путями.`

const resumePrompt = (step, start) => `${stepPrompt(step, start).replace(/Подготовка \(первым делом[^]*?Правила:/, 'Правила:')}\n\nПРОДОЛЖЕНИЕ: предыдущий исполнитель этого шага остановился из-за лимита сессии. ${inDir(step.resumeDir)} Посмотри \`git -C ${step.resumeDir} log --oneline ${start}..HEAD\`, \`git -C ${step.resumeDir} status\` и \`git -C ${step.resumeDir} diff\`: закоммиченное — готово (проверь бегло), незакоммиченное — начатая работа: проверь, доведи и закоммить, затем сделай оставшиеся пункты шага.`

async function runTrack(track, trackIndex) {
  let start = track[0].start || args.base
  const out = []
  for (const step of track) {
    let result
    if (step.existing) result = { branch: step.branch, worktree: step.resumeDir || '', commits: [], done: 'шаг уже выполнен — см. git log', notDone: '', behaviorChanges: '', checks: '', notes: step.notes || '' }
    else if (step.resumeDir) result = await agent(resumePrompt(step, start), { model: 'sonnet', label: `${step.id} ${step.title} (продолжение)`, phase: 'Шаги', schema: RESULT })
    else result = await agent(stepPrompt(step, start), { model: 'sonnet', label: `${step.id} ${step.title}`, phase: 'Шаги', schema: RESULT, isolation: 'worktree' })
    if (!result) { log(`${step.id}: исполнитель не вернул результат — дорожка ${trackIndex + 1} остановлена`); out.push({ step: step.id, result: null }); break }
    const review = await agent(reviewPrompt(step, start, result), { model: 'sonnet', label: `ревью ${step.id}`, phase: 'Ревью', schema: REVIEW })
    if (!review) { log(`${step.id}: ревью не вернуло результат — дорожка ${trackIndex + 1} остановлена`); out.push({ step: step.id, result, review: null }); break }
    let fix = null
    if (review.blocking.length) {
      log(`${step.id}: ревьюер — ${review.blocking.length} блокирующих`)
      const dir = result.worktree
      fix = dir
        ? await agent(`${fixPrompt(step, start, review)}\n\n${inDir(dir)}`, { model: 'sonnet', label: `исправления ${step.id}`, phase: 'Исправления', schema: RESULT })
        : await agent(fixPrompt(step, start, review), { model: 'sonnet', label: `исправления ${step.id}`, phase: 'Исправления', schema: RESULT, isolation: 'worktree' })
      if (!fix) { log(`${step.id}: исправления не вернули результат — дорожка ${trackIndex + 1} остановлена`); out.push({ step: step.id, result, review, fix: null }); break }
    }
    out.push({ step: step.id, result, review, fix })
    start = step.branch
  }
  return out
}

const reviewOnly = (args.reviews || []).map((r) => () => agent(reviewPrompt(r, r.start, r.result || {}), { model: 'sonnet', label: `ревью ${r.id}`, phase: 'Ревью', schema: REVIEW }).then((review) => ({ step: r.id, review })))
const all = await parallel([...reviewOnly, ...args.tracks.map((t, i) => () => runTrack(t, i))])
return { reviews: all.slice(0, reviewOnly.length), tracks: all.slice(reviewOnly.length) }
