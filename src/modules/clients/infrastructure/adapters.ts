import "server-only";
import { notify } from "@/lib/crm/notify";
import type { StaffNotifier } from "../application";

export const crmNotifier: StaffNotifier = { notify: (userIds, n) => notify(userIds, n) };
