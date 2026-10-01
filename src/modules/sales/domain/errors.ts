import { contextError } from "@/shared/domain";

export type SalesErrorCode = "dealNotFound" | "stageNotFound" | "noPipeline" | "noOpenStage" | "mergeSelf";

export const SalesError = contextError<SalesErrorCode>("sales", "SalesError");
export type SalesError = InstanceType<typeof SalesError>;
