import "server-only";
import { can, type Staff } from "./access";

/** Обращения: все видит сотрудник с правом «Настройки», остальные — свои (как src/server/support-access.ts бэкенда). */
export const seesAllTickets = (staff: Staff) => can(staff, "settings.manage");

export const canOpenTicket = (staff: Staff, t: { createdBy: string | null }) => seesAllTickets(staff) || (!!t.createdBy && t.createdBy === staff.user.id);
