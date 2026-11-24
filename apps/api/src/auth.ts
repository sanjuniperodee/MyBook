import { apiStaff, apiUser } from "@/server/api";
import type { Authenticator } from "./app";

/** Вход и права — те же функции, что у маршрутов сайта: сессия по cookie mb_session или Bearer, Origin, роль сотрудника. */
export const siteAuthenticator: Authenticator = {
  user: (req) => apiUser(req),
  async staff(req) {
    await apiStaff(req);
    return apiUser(req);
  },
};
