import { contextError } from "@/shared/domain";
import type { ReceiptProblem } from "./receipt";

/** message — текст для сотрудника (CRM работает на русском); код без message — текст из словаря admin по коду (mergeClosed, mergeIntoClosed). */
export type SalesErrorCode = "dealNotFound" | "stageNotFound" | "noPipeline" | "noOpenStage" | "mergeSelf" | "mergeClosed" | "mergeIntoClosed" | "lostReasonRequired" | "stageProtected" | "lastOpenStage" | "stageHasDeals" | "pipelineProtected" | "pipelineHasDeals" | "notUnsorted" | "dealHasPayments" | "dealHasInvoice";

export const SalesError = contextError<SalesErrorCode>("sales", "SalesError");
export type SalesError = InstanceType<typeof SalesError>;

/** Платёж не принят: сумма вне пределов, дата из будущего, возврат больше принятого. */
export const PaymentError = contextError<"amount" | "date" | "refundTooBig">("payments", "PaymentError");
export type PaymentError = InstanceType<typeof PaymentError>;

/** Файл не годится в чек; код — причина из receiptProblem. */
export const ReceiptError = contextError<ReceiptProblem>("receipts", "ReceiptError");
export type ReceiptError = InstanceType<typeof ReceiptError>;
