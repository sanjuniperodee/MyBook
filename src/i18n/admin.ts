/**
 * Тексты ошибок для сотрудников CRM. Админка работает только на русском, поэтому словаря kk здесь нет и в Messages
 * этот файл не входит: сотрудник видит русский текст при любом языке сайта в cookie.
 * Ключи не пересекаются с api (tests/i18n.test.ts): вместе они — ключи HttpError, роут отвечает ими.
 */
export const admin = {
  /** Форму подменили: файл вместо текста или поле не того вида. */
  badForm: "Проверьте введённые данные",
  dealNotFound: "Сделка не найдена",
  dealHasOrder: "По сделке уже оформлен заказ: оплату принимайте в карточке заказа",
  paymentNotFound: "Платёж не найден",
  amountInvalid: "Проверьте сумму",
  paymentDateInvalid: "Проверьте дату платежа",
  paymentDateFuture: "Дата не может быть в будущем",
  refundNoReason: "Укажите причину возврата",
  refundTooBig: "Нельзя вернуть больше, чем принято",
  receiptRequired: "Приложите чек: платёж без чека не принимается",
  receiptPick: "Выберите файл чека",
  receiptNotSaved: "Не удалось сохранить чек",
  receiptEmpty: "Файл пустой",
  receiptTooBig: (mb: number) => `Файл больше ${mb} МБ`,
  receiptType: "Нужен файл JPG, PNG, WEBP или PDF",
  twoFactorAlreadyOn: "2FA уже включена",
  staffEmailExists: "Этот e-mail уже зарегистрирован",
  invalidTransition: "Такой переход статуса невозможен",
  staffNotFound: "Ответственным может быть только сотрудник CRM",
  promoExists: "Такой промокод уже есть",
  sellerNameInvalid: "Юр. название — до 120 знаков",
  sellerBinInvalid: "БИН — 12 цифр, не нули",
  sellerPhoneInvalid: "Телефон — 10–15 цифр в международном формате, не заглушка +7 700 000 00 00",
  sellerWhatsappInvalid: "WhatsApp — номер в международном формате, например 77001234567, не заглушка",
};
