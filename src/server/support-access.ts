import "server-only";
import { can, type Staff } from "@/server/access";

/** Все обращения видит и ведёт тот, у кого есть «Настройки CRM» (руководитель, разработчик); менеджер — свои. */
export const seesAllTickets = (staff: Staff) => can(staff, "settings.manage");

export const canOpenTicket = (staff: Staff, t: { createdBy: string | null }) => seesAllTickets(staff) || (!!t.createdBy && t.createdBy === staff.user.id);
