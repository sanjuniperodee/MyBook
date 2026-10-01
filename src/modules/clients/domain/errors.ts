import { contextError } from "@/shared/domain";

/** forbidden — действие не разрешено правами (страница отвечает как на чужую запись). */
export const ClientsError = contextError<"forbidden" | "staffNotFound" | "taskNotFound">("clients", "ClientsError");
export type ClientsError = InstanceType<typeof ClientsError>;
