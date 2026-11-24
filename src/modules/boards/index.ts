import type { Clock, LiveFeed, StoredFile, StoredFileRequest } from "@/shared/application";
import { deleteFile, openStoredFile, putFile } from "@/shared/infrastructure/storage";
import { BoardsService, CalendarService, CardsService, type BoardsNotifier } from "./application";
import { GoogleSync, type GoogleConfig } from "./application/GoogleSync";
import { googleHttp } from "./infrastructure/google";
import { drizzleGoogle } from "./infrastructure/googleStore";
import { signValue, verifySigned } from "@/shared/crypto";
import { drizzleFeeds, staffAccount } from "./infrastructure/calendar";
import { drizzleBoards } from "./infrastructure/store";
import type { BoardViewer } from "./domain";

export { BoardsError, boardsErrorStatus, activityText, parseFilter, matchesFilter, canSeeBoard, canManageBoard, type BoardViewer, type CardFilter } from "./domain";
export type { BoardSummary, BoardView, CardSummary, CardDetail, CardLink, BulkAction, CardCreateInput, CardUpdateInput } from "./application";
export { DONE_DAYS } from "./application";
export type { GoogleConfig } from "./application/GoogleSync";

/** Права сотрудника по учётной записи (порт контекста Access). */
export type StaffContextOf = (account: { id: string; role: string; staffDisabled: boolean; crmRoleId: string | null; twoFactorEnabled: boolean }) => Promise<{ scope: string; can(p: string): boolean } | null>;

/**
 * Публичный фасад контекста «Доски задач»: доски отделов, личные и проектные, колонки с лимитами, карточки (задачи CRM) с
 * исполнителями, метками, чек-листами, комментариями и вложениями, правила досок, календарь, личная iCal-ссылка и Google Календарь сотрудника.
 */
export class BoardsModule {
  readonly boards: BoardsService;
  readonly cards: CardsService;
  readonly calendar: CalendarService;
  /** Google Календарь сотрудника: вход, свой календарь, двусторонняя синхронизация. */
  readonly google: GoogleSync;

  /** Файл вложения потоком из хранилища (Range, ETag). Права проверяет cards.file. */
  openFile(key: string, req?: StoredFileRequest): Promise<StoredFile | null> {
    return openStoredFile(key, req);
  }

  /** Уведомления и упоминания — порт рабочего пространства; живое обновление — LiveFeed; права сотрудника по учётной записи — Access. */
  constructor(deps: { clock: Clock; notifier: BoardsNotifier; live: LiveFeed; staffContext: StaffContextOf; appUrl: string; googleConfig: () => Promise<GoogleConfig | null> }) {
    const live = { boardChanged: (boardId: string) => deps.live.publish({ type: "board", boardId }) };
    this.boards = new BoardsService(drizzleBoards, live, deps.clock);
    this.cards = new CardsService(drizzleBoards, this.boards, deps.notifier, { put: (key, data) => putFile(key, data), remove: (key) => deleteFile(key) }, deps.clock);
    const viewerOf = async (userId: string): Promise<BoardViewer | null> => {
      const u = await staffAccount(userId);
      const ctx = u ? await deps.staffContext({ id: u.id, role: u.role, staffDisabled: u.staffDisabled, crmRoleId: u.crmRoleId, twoFactorEnabled: false }) : null;
      return u && ctx ? { userId: u.id, name: u.name, seesAll: ctx.scope === "all", allTasks: ctx.can("tasks.all"), manageBoards: ctx.can("boards.manage") } : null;
    };
    this.calendar = new CalendarService(drizzleBoards, drizzleFeeds, viewerOf, deps.clock, deps.appUrl);
    this.google = new GoogleSync(googleHttp, drizzleGoogle, deps.googleConfig, { sign: signValue, verify: verifySigned }, this.cards, this.boards, viewerOf, deps.clock, deps.appUrl);
  }
}
