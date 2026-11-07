/**
 * Режим боковой панели CRM: auto — полная от 1280 px, уже — рейка значков; full и rail — выбор человека.
 * Хранится в cookie: читается на сервере (layout), поэтому при загрузке ширина не прыгает.
 */
export const NAV_RAIL_COOKIE = "crm-nav";
export type NavMode = "auto" | "full" | "rail";
export const navMode = (value: string | undefined): NavMode => (value === "rail" || value === "full" ? value : "auto");
