/**
 * Деньги заказа для списков: полная цена книги, сколько получено и долг. Предоплата менеджеру по сделке входит и в цену,
 * и в оплаченное («к оплате» заказа её уже не включает). Заказ, оплаченный без записи платежа, — оплачен на «к оплате»
 * (как в «Финансах»). Без БД — покрыто тестами.
 */
export interface OrderMoneyInput {
  amount: number;
  prepaidAmount: number;
  receivedAmount: number;
  paidAt: Date | null;
  status: string;
}

export function orderMoney(o: OrderMoneyInput) {
  const price = o.amount + o.prepaidAmount;
  const onOrder = o.paidAt && o.status !== "cancelled" ? Math.max(o.receivedAmount, o.amount) : o.receivedAmount;
  const paid = o.prepaidAmount + onOrder;
  const debt = o.status === "cancelled" ? 0 : Math.max(0, price - paid);
  return { price, paid, debt };
}
