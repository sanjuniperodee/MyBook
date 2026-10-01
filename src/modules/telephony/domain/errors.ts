import { contextError } from "@/shared/domain";

/** Ошибка АТС или её настройки; message — понятный текст для сотрудника. */
export const TelephonyError = contextError<"provider" | "notConfigured">("telephony", "TelephonyError");
export type TelephonyError = InstanceType<typeof TelephonyError>;
