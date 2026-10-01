import "server-only";
import { notify } from "@/modules/workspace";
import type { StaffNotifier } from "../application";

export const crmNotifier: StaffNotifier = { notify: (userIds, n) => notify(userIds, n) };
