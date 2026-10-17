/** Счёт из чата: страница оплаты /pay/<token> и сообщение клиенту. */
export const pay = {
  meta: "Оплата книги",
  eyebrow: (label: string) => `Счёт ${label}`,
  title: "Персональная книга",
  purpose: {
    prepayment: "предоплата",
    remainder: "остаток",
    full: "полная оплата",
    custom: "оплата",
  } as Record<"prepayment" | "remainder" | "full" | "custom", string>,
  /** Назначение платежа: «Персональная книга: Твёрдая обложка, предоплата». */
  purposeLine: (plan: string, purpose: string) => `Персональная книга: ${plan}, ${purpose}`,
  summary: (plan: string, purpose: string, agreed: string) => `${plan}, ${purpose}. Цена книги по договорённости — ${agreed}.`,
  until: (date: string) => `Счёт действует до ${date}.`,
  toPay: "К оплате",
  amountPaid: "Оплачено",
  amount: "Сумма счёта",
  paidTitle: "Оплата получена",
  paidAccess: "Доступ в личный кабинет отправили вам в WhatsApp: там вы напишете книгу.",
  paidManager: "Спасибо! Менеджер свяжется с вами и пришлёт доступ в кабинет.",
  paidAlready: "Спасибо! Доступ в личный кабинет у вас уже есть — войдите, как обычно.",
  login: "Войти в кабинет",
  closedTitle: "Счёт закрыт",
  cancelled: "Этот счёт больше не действует. Напишите нам в WhatsApp — пришлём актуальную ссылку.",
  expired: "Срок этого счёта истёк. Напишите нам в WhatsApp — пришлём новую ссылку.",
  ordered: "По этой книге уже оформлен заказ — оплата идёт в нём, в личном кабинете.",
  writeUs: "Написать в WhatsApp",
  help: "Вопросы по оплате — пишите нам в WhatsApp.",
  payment: {
    title: "Оплата",
    toPay: "К оплате:",
    loading: "Платёжный модуль ещё загружается, попробуйте через секунду.",
    description: (n: number) => `Персональная книга, счёт P${n}`,
    failed: "Оплата не прошла",
    failedReason: (r: string) => `Оплата не прошла: ${r}`,
    card: "Оплатить картой",
    sum: "Сумма:",
    commentLabel: "комментарий:",
    commentValue: (n: number) => `P${n}`,
    claimed: "Спасибо! Менеджер проверит поступление и пришлёт доступ в кабинет — обычно в течение часа в рабочее время.",
    claim: "Я оплатил(а)",
  },
  /** Перевод по номеру: без шага «номер заказа» — сумму и комментарий P<n> блок оплаты добавляет сам. */
  transferSteps: (phone: string, name: string) => ["Откройте Kaspi.kz → Платежи → Переводы → По номеру телефона", `Номер получателя: ${phone}${name ? ` (${name})` : ""}`],
  /** Подсказки блока Kaspi на странице счёта. */
  kaspi: {
    note: (org: string | null, comment: string) => (org ? `Получатель — ${org}, комментарий к платежу — «${comment}».` : `Комментарий к платежу — «${comment}».`),
    phoneHint: (masked: string) => `Оставьте поле пустым — счёт придёт в Kaspi на номер ${masked}. Или укажите другой номер.`,
    paid: "Оплата получена! Обновляем страницу…",
  },
  /** Сообщение со счётом в WhatsApp. */
  message: (i: { name: string; label: string; plan: string; purpose: string; amount: string; link: string; until: string; kaspiPhone: string | null; kaspiOrg: string | null }) =>
    [
      `Здравствуйте${i.name ? `, ${i.name}` : ""}! Счёт ${i.label} на оплату: персональная книга (${i.plan}), ${i.purpose} — ${i.amount}.`,
      `Оплатить: ${i.link}`,
      i.kaspiPhone ? `Счёт также пришёл в приложение Kaspi на номер ${i.kaspiPhone}${i.kaspiOrg ? ` — получатель ${i.kaspiOrg}` : ""}.` : null,
      `Действует до ${i.until}.`,
    ]
      .filter(Boolean)
      .join("\n"),
};
