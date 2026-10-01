import { contextError } from "@/shared/domain";

/** message — текст для сотрудника (CRM работает на русском). */
export type SalesErrorCode = "dealNotFound" | "stageNotFound" | "noPipeline" | "noOpenStage" | "mergeSelf" | "lostReasonRequired" | "stageProtected" | "lastOpenStage" | "stageHasDeals" | "pipelineProtected" | "pipelineHasDeals" | "notUnsorted";

export const SalesError = contextError<SalesErrorCode>("sales", "SalesError");
export type SalesError = InstanceType<typeof SalesError>;
