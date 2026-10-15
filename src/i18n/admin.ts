/**
 * Тексты ошибок для сотрудников CRM. Админка работает только на русском, поэтому словаря kk здесь нет и в Messages
 * этот файл не входит: сотрудник видит русский текст при любом языке сайта в cookie.
 * Ключи не пересекаются с api (tests/i18n.test.ts): вместе они — ключи HttpError, роут отвечает ими.
 */
export const admin = {
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
  invalidTransition: "Такой переход статуса невозможен",
  staffNotFound: "Ответственным может быть только сотрудник CRM",
  promoExists: "Такой промокод уже есть",
};
