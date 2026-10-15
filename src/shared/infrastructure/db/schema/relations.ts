/** Связи для реляционных запросов db.query (with: …): в SQL и миграциях не участвуют. */
import { relations } from "drizzle-orm";
import { bookLetters, bookQuestions, books, photos } from "./authoring";
import { users } from "./identity";
import { crmConversations, crmMessages } from "./messaging";
import { giftCards, orderEvents, orders, promoCodes } from "./ordering";
import { crmDeals, crmPipelines, crmStages } from "./sales";

export const giftCardsRelations = relations(giftCards, ({ one }) => ({
  promo: one(promoCodes, { fields: [giftCards.promoCodeId], references: [promoCodes.id] }),
}));

export const crmStagesRelations = relations(crmStages, ({ one }) => ({
  pipeline: one(crmPipelines, { fields: [crmStages.pipelineId], references: [crmPipelines.id] }),
}));

export const crmDealsRelations = relations(crmDeals, ({ one }) => ({
  stage: one(crmStages, { fields: [crmDeals.stageId], references: [crmStages.id] }),
  client: one(users, { fields: [crmDeals.clientId], references: [users.id], relationName: "dealClient" }),
  assignee: one(users, { fields: [crmDeals.assigneeId], references: [users.id], relationName: "dealAssignee" }),
  order: one(orders, { fields: [crmDeals.orderId], references: [orders.id] }),
}));

export const crmConversationsRelations = relations(crmConversations, ({ one, many }) => ({
  client: one(users, { fields: [crmConversations.clientId], references: [users.id], relationName: "convClient" }),
  assignee: one(users, { fields: [crmConversations.assigneeId], references: [users.id], relationName: "convAssignee" }),
  deal: one(crmDeals, { fields: [crmConversations.dealId], references: [crmDeals.id] }),
  messages: many(crmMessages),
}));

export const crmMessagesRelations = relations(crmMessages, ({ one }) => ({
  conversation: one(crmConversations, { fields: [crmMessages.conversationId], references: [crmConversations.id] }),
}));

export const usersRelations = relations(users, ({ many }) => ({
  books: many(books),
  orders: many(orders, { relationName: "customer" }),
  assignedOrders: many(orders, { relationName: "assignee" }),
}));

export const booksRelations = relations(books, ({ one, many }) => ({
  user: one(users, { fields: [books.userId], references: [users.id] }),
  questions: many(bookQuestions),
  photos: many(photos),
  letters: many(bookLetters),
  orders: many(orders),
}));

export const bookQuestionsRelations = relations(bookQuestions, ({ one }) => ({
  book: one(books, { fields: [bookQuestions.bookId], references: [books.id] }),
}));

export const bookLettersRelations = relations(bookLetters, ({ one }) => ({
  book: one(books, { fields: [bookLetters.bookId], references: [books.id] }),
}));

export const photosRelations = relations(photos, ({ one }) => ({
  book: one(books, { fields: [photos.bookId], references: [books.id] }),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  user: one(users, { fields: [orders.userId], references: [users.id], relationName: "customer" }),
  assignee: one(users, { fields: [orders.assigneeId], references: [users.id], relationName: "assignee" }),
  book: one(books, { fields: [orders.bookId], references: [books.id] }),
  events: many(orderEvents),
}));

export const orderEventsRelations = relations(orderEvents, ({ one }) => ({
  order: one(orders, { fields: [orderEvents.orderId], references: [orders.id] }),
}));
