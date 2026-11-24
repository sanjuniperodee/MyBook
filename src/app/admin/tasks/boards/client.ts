"use client";

import { apiFetch } from "@/lib/client-api";
import type { BoardSummary, BoardView, BulkAction, CardCreateInput, CardDetail, CardSummary, CardUpdateInput } from "@/modules/boards";

export type { BoardSummary, BoardView, CardDetail, CardSummary };
export type Staff = { id: string; label: string };

const base = "/api/admin/boards";
const j = <T>(url: string, method: string, json?: unknown) => apiFetch<T>(url, { method, ...(json === undefined ? {} : { json }) });

/** Клиент JSON API досок (server/boards-api.ts) для экранов CRM. */
export const boardsApi = {
  list: (archived = false) => apiFetch<{ boards: BoardSummary[]; templates: { key: string; name: string; description: string; kind: string; color: string; columns: string[] }[] }>(`${base}${archived ? "?archived=1" : ""}`, { cache: "no-store" }),
  create: (input: { name: string; template?: string | null; from?: string | null; kind?: string; visibility?: "all" | "members"; description?: string | null; color?: string | null }) => j<{ id: string }>(base, "POST", input),
  board: (id: string, opts: { done?: boolean; archived?: boolean } = {}) => apiFetch<BoardView>(`${base}/${id}?${new URLSearchParams({ ...(opts.done ? { done: "1" } : {}), ...(opts.archived ? { archived: "1" } : {}) })}`, { cache: "no-store" }),
  updateBoard: (id: string, patch: { name?: string; description?: string | null; color?: string; visibility?: "all" | "members"; archived?: boolean }) => j(`${base}/${id}`, "PATCH", patch),
  reorderBoards: (ids: string[]) => j(`${base}/reorder`, "POST", { ids }),
  addColumn: (boardId: string, input: { name: string; done?: boolean; wipLimit?: number | null; afterId?: string | null }) => j<{ id: string }>(`${base}/${boardId}/columns`, "POST", input),
  updateColumn: (id: string, patch: { name?: string; done?: boolean; wipLimit?: number | null; color?: string | null; beforeId?: string | null; afterId?: string | null }) => j(`${base}/columns/${id}`, "PATCH", patch),
  deleteColumn: (id: string) => j(`${base}/columns/${id}`, "DELETE"),
  addLabel: (boardId: string, input: { name: string; color: string }) => j<{ id: string }>(`${base}/${boardId}/labels`, "POST", input),
  updateLabel: (boardId: string, id: string, patch: { name?: string; color?: string }) => j(`${base}/${boardId}/labels/${id}`, "PATCH", patch),
  deleteLabel: (boardId: string, id: string) => j(`${base}/${boardId}/labels/${id}`, "DELETE"),
  setMember: (boardId: string, userId: string, role: "admin" | "member" | null) => j(`${base}/${boardId}/members/${userId}`, "PUT", { role }),
  addRule: (boardId: string, input: { name: string; trigger: unknown; actions: unknown }) => j<{ id: string }>(`${base}/${boardId}/rules`, "POST", input),
  updateRule: (id: string, patch: { name?: string; trigger?: unknown; actions?: unknown; enabled?: boolean }) => j(`${base}/rules/${id}`, "PATCH", patch),
  deleteRule: (id: string) => j(`${base}/rules/${id}`, "DELETE"),
  views: (boardId: string | null) => apiFetch<{ views: { id: string; name: string; query: string; shared: boolean; mine: boolean }[] }>(`${base}/views${boardId ? `?boardId=${boardId}` : ""}`, { cache: "no-store" }),
  saveView: (input: { boardId: string | null; name: string; query: string; shared?: boolean }) => j<{ id: string }>(`${base}/views`, "POST", input),
  deleteView: (id: string) => j(`${base}/views/${id}`, "DELETE"),

  createCard: (input: CardCreateInput) => j<{ id: string; card: CardSummary }>(`${base}/cards`, "POST", input),
  card: (id: string) => apiFetch<CardDetail>(`${base}/cards/${id}`, { cache: "no-store" }),
  updateCard: (id: string, patch: CardUpdateInput) => j<{ card: CardSummary }>(`${base}/cards/${id}`, "PATCH", patch),
  deleteCard: (id: string) => j(`${base}/cards/${id}`, "DELETE"),
  move: (id: string, to: { boardId?: string | null; columnId: string; beforeId?: string | null; afterId?: string | null }) => j<{ card: CardSummary }>(`${base}/cards/${id}/move`, "POST", to),
  done: (id: string, done: boolean, result?: string | null) => j<{ card: CardSummary }>(`${base}/cards/${id}/done`, "POST", { done, result }),
  archive: (id: string, archived: boolean) => j(`${base}/cards/${id}/archive`, "POST", { archived }),
  duplicate: (id: string) => j<{ id: string }>(`${base}/cards/${id}/duplicate`, "POST", {}),
  assignees: (id: string, userIds: string[]) => j<{ card: CardSummary }>(`${base}/cards/${id}/assignees`, "PUT", { userIds }),
  watch: (id: string, on: boolean, userId?: string) => j(`${base}/cards/${id}/watch`, "PUT", { on, userId }),
  label: (id: string, labelId: string, on: boolean) => j<{ card: CardSummary }>(`${base}/cards/${id}/labels/${labelId}`, "PUT", { on }),
  addChecklist: (id: string, title: string, items: string[] = []) => j<{ id: string }>(`${base}/cards/${id}/checklists`, "POST", { title, items }),
  renameChecklist: (id: string, title: string) => j(`${base}/checklists/${id}`, "PATCH", { title }),
  deleteChecklist: (id: string) => j(`${base}/checklists/${id}`, "DELETE"),
  addItem: (checklistId: string, text: string) => j<{ id: string }>(`${base}/checklists/${checklistId}/items`, "POST", { text }),
  updateItem: (id: string, patch: { text?: string; done?: boolean; assigneeId?: string | null; dueAt?: string | null }) => j(`${base}/items/${id}`, "PATCH", patch),
  deleteItem: (id: string) => j(`${base}/items/${id}`, "DELETE"),
  comment: (id: string, text: string) => j<{ id: string }>(`${base}/cards/${id}/comments`, "POST", { text }),
  editComment: (id: string, text: string) => j(`${base}/comments/${id}`, "PATCH", { text }),
  deleteComment: (id: string) => j(`${base}/comments/${id}`, "DELETE"),
  async upload(id: string, file: File) {
    const form = new FormData();
    form.append("file", file);
    return apiFetch<{ id: string }>(`${base}/cards/${id}/files`, { method: "POST", body: form });
  },
  deleteFile: (id: string, fileId: string) => j(`${base}/cards/${id}/files/${fileId}`, "DELETE"),
  bulk: (ids: string[], action: BulkAction) => j<{ done: number; failed: number }>(`${base}/cards/bulk`, "POST", { ids, action }),
  calendar: (from: Date, to: Date, opts: { boardId?: string | null; mine?: boolean } = {}) =>
    apiFetch<{ cards: CardSummary[] }>(`${base}/calendar?${new URLSearchParams({ from: from.toISOString(), to: to.toISOString(), ...(opts.boardId ? { boardId: opts.boardId } : {}), ...(opts.mine ? { mine: "1" } : {}) })}`, { cache: "no-store" }),
  feed: () => apiFetch<{ active: boolean; createdAt: string | null; lastUsedAt: string | null }>(`${base}/calendar/feed`, { cache: "no-store" }),
  issueFeed: () => j<{ url: string }>(`${base}/calendar/feed`, "POST", {}),
  revokeFeed: () => j(`${base}/calendar/feed`, "DELETE"),
  google: () => apiFetch<{ configured: boolean; connected: boolean; email: string | null; lastPushAt: string | null; lastPullAt: string | null; error: string | null; push: boolean }>(`${base}/calendar/google`, { cache: "no-store" }),
  googleSync: () => j<{ changes: number }>(`${base}/calendar/google`, "POST", {}),
  googleDisconnect: () => j(`${base}/calendar/google`, "DELETE"),
};

/** Подписка на живые события досок (SSE CRM → window «crm:live»): доска или карточка изменилась. */
export function onBoardEvent(fn: (e: { boardId: string | null; taskId: string | null }) => void) {
  const handler = (ev: Event) => {
    const d = (ev as CustomEvent).detail as { type?: string; boardId?: string | null; taskId?: string | null; conversationId?: string | null } | undefined;
    // Переподключение SSE шлёт «chat» без диалога: за время обрыва события могли пропасть — перечитать всё.
    if (d?.type === "board") fn({ boardId: d.boardId ?? null, taskId: d.taskId ?? null });
    else if (d?.type === "chat" && d.conversationId === null) fn({ boardId: null, taskId: null });
  };
  window.addEventListener("crm:live", handler);
  return () => window.removeEventListener("crm:live", handler);
}
