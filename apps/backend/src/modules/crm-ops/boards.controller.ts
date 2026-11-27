import { Controller, Inject } from "@nestjs/common";
import type { Output, Parsed } from "@mybook/contracts";
import { staffOptions } from "@/modules/access/ui";
import { activityText, BoardsError, boardsErrorStatus } from "@/modules/boards";
import type { StaffMember } from "../../core/auth/staff";
import { CurrentStaff } from "../../core/auth/staff.decorators";
import { Input } from "../../core/http/decorators";
import { Endpoint } from "../../core/http/endpoint";
import { boardViewerOf, columnOut, CRM_OPS_PORTS, toCard, type CrmOpsPorts } from "./crm-ops.tokens";

/** Ошибка модуля досок — ответ `{ error, code }` со статусом `boardsErrorStatus` и `no-store` (паритет с apps/api). */
async function guardBoards<T>(fn: () => Promise<T>): Promise<T | Response> {
  try {
    return await fn();
  } catch (err) {
    if (BoardsError.is(err)) {
      return Response.json(
        { error: err.message, code: err.code },
        { status: boardsErrorStatus(err.code), headers: { "cache-control": "no-store" } },
      );
    }
    throw err;
  }
}

/**
 * Доски задач CRM в API v1 (19 маршрутов): доски, карточки, чек-листы, комментарии, вложения и календарь.
 * Права на доску и карточку проверяет сам домен досок по `BoardViewer`.
 */
@Controller()
export class BoardsController {
  constructor(@Inject(CRM_OPS_PORTS) private readonly ports: CrmOpsPorts) {}

  @Endpoint("boardsList")
  list(@CurrentStaff() staff: StaffMember): Promise<Output<"boardsList"> | Response> {
    return guardBoards(async () => ({
      boards: (await this.ports.listBoards(boardViewerOf(staff))).map((b) => ({
        id: b.id,
        name: b.name,
        description: b.description,
        kind: b.kind,
        color: b.color,
        visibility: b.visibility,
        isDefault: b.isDefault,
        canManage: b.canManage,
        openCards: b.openCards,
      })),
    }));
  }

  @Endpoint("boardDetail")
  detail(@CurrentStaff() staff: StaffMember, @Input() input: Parsed<"boardDetail">): Promise<Output<"boardDetail"> | Response> {
    return guardBoards(async () => {
      const v = boardViewerOf(staff);
      const [view, admins] = await Promise.all([this.ports.viewBoard(v, input.boardId, { done: input.done === "1" }), this.ports.allStaff()]);
      const b = view.board;
      return {
        board: {
          id: b.id,
          name: b.name,
          description: b.description,
          kind: b.kind,
          color: b.color,
          visibility: b.visibility,
          isDefault: b.isDefault,
          canManage: b.canManage,
        },
        columns: view.columns.map(columnOut),
        labels: view.labels,
        cards: view.cards.map(toCard),
        staff: staffOptions(admins),
        doneDays: view.doneDays,
      };
    });
  }

  @Endpoint("cardCreate")
  createCard(@CurrentStaff() staff: StaffMember, @Input() input: Parsed<"cardCreate">): Promise<Output<"cardCreate"> | Response> {
    return guardBoards(async () => {
      const v = boardViewerOf(staff);
      const id = await this.ports.createCard(v, input.body);
      return { id, card: toCard(await this.ports.cardSummary(v, id)) };
    });
  }

  @Endpoint("cardDetail")
  cardDetail(@CurrentStaff() staff: StaffMember, @Input() input: Parsed<"cardDetail">): Promise<Output<"cardDetail"> | Response> {
    return guardBoards(async () => {
      const d = await this.ports.cardDetail(boardViewerOf(staff), input.cardId);
      const labels = new Map(d.labels.map((l) => [l.id, l.name]));
      return {
        card: toCard(d),
        description: d.description,
        createdById: d.createdById,
        createdAt: d.createdAt,
        remindBeforeMin: d.remindBeforeMin,
        result: d.result,
        estimateMin: d.estimateMin,
        spentMin: d.spentMin,
        board: d.board,
        columns: d.columns.map(columnOut),
        labels: d.labels,
        checklists: d.checklists.map((l) => ({
          id: l.id,
          title: l.title,
          items: l.items.map((i) => ({ id: i.id, text: i.text, done: i.done, assigneeId: i.assigneeId, dueAt: i.dueAt })),
        })),
        comments: d.commentList,
        files: d.files.map((f) => ({
          id: f.id,
          name: f.name,
          mime: f.mime,
          size: f.size,
          url: f.url,
          isImage: f.isImage,
          createdAt: f.createdAt,
        })),
        activity: d.activity.map((a) => ({
          id: a.id,
          actorId: a.actorId,
          kind: a.kind,
          text: activityText(a.kind, a.data, labels),
          createdAt: a.createdAt,
        })),
      };
    });
  }

  @Endpoint("cardUpdate")
  updateCard(@CurrentStaff() staff: StaffMember, @Input() input: Parsed<"cardUpdate">): Promise<Output<"cardUpdate"> | Response> {
    return guardBoards(async () => {
      const v = boardViewerOf(staff);
      await this.ports.updateCard(v, input.cardId, input.body);
      return { card: toCard(await this.ports.cardSummary(v, input.cardId)) };
    });
  }

  @Endpoint("cardDelete")
  deleteCard(@CurrentStaff() staff: StaffMember, @Input() input: Parsed<"cardDelete">): Promise<Output<"cardDelete"> | Response> {
    return guardBoards(async () => {
      await this.ports.removeCard(boardViewerOf(staff), input.cardId);
      return { ok: true as const };
    });
  }

  @Endpoint("cardMove")
  moveCard(@CurrentStaff() staff: StaffMember, @Input() input: Parsed<"cardMove">): Promise<Output<"cardMove"> | Response> {
    return guardBoards(async () => {
      const v = boardViewerOf(staff);
      await this.ports.moveCard(v, input.cardId, input.body);
      return { card: toCard(await this.ports.cardSummary(v, input.cardId)) };
    });
  }

  @Endpoint("cardDone")
  doneCard(@CurrentStaff() staff: StaffMember, @Input() input: Parsed<"cardDone">): Promise<Output<"cardDone"> | Response> {
    return guardBoards(async () => {
      const v = boardViewerOf(staff);
      await this.ports.setCardDone(v, input.cardId, input.body.done, input.body.result);
      return { card: toCard(await this.ports.cardSummary(v, input.cardId)) };
    });
  }

  @Endpoint("cardArchive")
  archiveCard(@CurrentStaff() staff: StaffMember, @Input() input: Parsed<"cardArchive">): Promise<Output<"cardArchive"> | Response> {
    return guardBoards(async () => {
      await this.ports.archiveCard(boardViewerOf(staff), input.cardId, input.body.archived);
      return { ok: true as const };
    });
  }

  @Endpoint("cardAssignees")
  assigneesCard(@CurrentStaff() staff: StaffMember, @Input() input: Parsed<"cardAssignees">): Promise<Output<"cardAssignees"> | Response> {
    return guardBoards(async () => {
      const v = boardViewerOf(staff);
      await this.ports.setCardAssignees(v, input.cardId, input.body.userIds);
      return { card: toCard(await this.ports.cardSummary(v, input.cardId)) };
    });
  }

  @Endpoint("cardWatch")
  watchCard(@CurrentStaff() staff: StaffMember, @Input() input: Parsed<"cardWatch">): Promise<Output<"cardWatch"> | Response> {
    return guardBoards(async () => {
      const v = boardViewerOf(staff);
      await this.ports.setCardWatching(v, input.cardId, v.userId, input.body.on);
      return { ok: true as const };
    });
  }

  @Endpoint("cardLabel")
  labelCard(@CurrentStaff() staff: StaffMember, @Input() input: Parsed<"cardLabel">): Promise<Output<"cardLabel"> | Response> {
    return guardBoards(async () => {
      const v = boardViewerOf(staff);
      await this.ports.setCardLabel(v, input.cardId, input.labelId, input.body.on);
      return { card: toCard(await this.ports.cardSummary(v, input.cardId)) };
    });
  }

  @Endpoint("cardChecklistCreate")
  createChecklist(@CurrentStaff() staff: StaffMember, @Input() input: Parsed<"cardChecklistCreate">): Promise<Output<"cardChecklistCreate"> | Response> {
    return guardBoards(async () => ({
      id: await this.ports.addChecklist(boardViewerOf(staff), input.cardId, input.body.title, input.body.items ?? []),
    }));
  }

  @Endpoint("checklistItemCreate")
  createChecklistItem(@CurrentStaff() staff: StaffMember, @Input() input: Parsed<"checklistItemCreate">): Promise<Output<"checklistItemCreate"> | Response> {
    return guardBoards(async () => ({
      id: await this.ports.addChecklistItem(boardViewerOf(staff), input.checklistId, input.body.text),
    }));
  }

  @Endpoint("checklistItemUpdate")
  updateChecklistItem(@CurrentStaff() staff: StaffMember, @Input() input: Parsed<"checklistItemUpdate">): Promise<Output<"checklistItemUpdate"> | Response> {
    return guardBoards(async () => {
      await this.ports.updateChecklistItem(boardViewerOf(staff), input.itemId, input.body);
      return { ok: true as const };
    });
  }

  @Endpoint("checklistItemDelete")
  deleteChecklistItem(@CurrentStaff() staff: StaffMember, @Input() input: Parsed<"checklistItemDelete">): Promise<Output<"checklistItemDelete"> | Response> {
    return guardBoards(async () => {
      await this.ports.deleteChecklistItem(boardViewerOf(staff), input.itemId);
      return { ok: true as const };
    });
  }

  @Endpoint("cardCommentCreate")
  commentCard(@CurrentStaff() staff: StaffMember, @Input() input: Parsed<"cardCommentCreate">): Promise<Output<"cardCommentCreate"> | Response> {
    return guardBoards(async () => ({
      id: await this.ports.commentCard(boardViewerOf(staff), input.cardId, input.body.text),
    }));
  }

  @Endpoint("cardFileUpload")
  uploadFile(@CurrentStaff() staff: StaffMember, @Input() input: Parsed<"cardFileUpload">): Promise<Output<"cardFileUpload"> | Response> {
    return guardBoards(async () => {
      const v = boardViewerOf(staff);
      const file = input.files[0];
      if (!file) throw new BoardsError("invalid", "Выберите файл");
      return {
        id: await this.ports.attachCardFile(v, input.cardId, {
          name: file.name,
          type: file.type,
          data: new Uint8Array(await file.arrayBuffer()),
        }),
      };
    });
  }

  @Endpoint("tasksCalendar")
  calendar(@CurrentStaff() staff: StaffMember, @Input() input: Parsed<"tasksCalendar">): Promise<Output<"tasksCalendar"> | Response> {
    return guardBoards(async () => ({
      cards: (
        await this.ports.calendarRange(boardViewerOf(staff), new Date(input.from), new Date(input.to), {
          boardId: input.boardId ?? null,
          mine: input.mine === "1",
        })
      ).map(toCard),
    }));
  }
}
