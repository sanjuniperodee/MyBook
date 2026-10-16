import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { generateDrizzleJson, generateMigration, type DrizzleSnapshotJSON } from "drizzle-kit/api";
import { getTableName, is } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import * as schema from "@/shared/infrastructure/db/schema";

const tablesOf = (exports: Record<string, unknown>) => Object.values(exports).filter((v): v is PgTable => is(v, PgTable));

describe("схема БД", () => {
  it("сборный файл отдаёт все таблицы из schema/*.ts, и каждая объявлена один раз", async () => {
    // Файлы схемы по владельцам: schema/<модуль>.ts. Вспомогательные columns и relations таблиц не объявляют.
    const dir = path.join(__dirname, "..", "src", "shared", "infrastructure", "db", "schema");
    const parts = await Promise.all(readdirSync(dir).filter((f) => f.endsWith(".ts")).map((f): Promise<Record<string, unknown>> => import(path.join(dir, f))));
    const declared = parts.flatMap(tablesOf).map(getTableName);
    expect(declared.length).toBeGreaterThan(30);
    expect(new Set(declared).size).toBe(declared.length);
    expect(tablesOf(schema).map(getTableName).sort()).toEqual([...declared].sort());
  });

  it("совпадает с последней миграцией: drizzle-kit generate → «No schema changes»", async () => {
    const meta = path.join(__dirname, "..", "drizzle", "meta");
    const journal = JSON.parse(readFileSync(path.join(meta, "_journal.json"), "utf8")) as { entries: { idx: number }[] };
    const last = Math.max(...journal.entries.map((e) => e.idx));
    const snapshot = JSON.parse(readFileSync(path.join(meta, `${String(last).padStart(4, "0")}_snapshot.json`), "utf8")) as DrizzleSnapshotJSON;
    expect(await generateMigration(snapshot, generateDrizzleJson(schema))).toEqual([]);
  });

  it("связи для db.query собираются без ошибок и лежат у своих таблиц", () => {
    const rel = drizzle.mock({ schema })._.schema;
    if (!rel) throw new Error("реляционная конфигурация не собралась");
    const keys = (r: object) => Object.keys(r).sort();
    expect(keys(rel.orders.relations)).toEqual(["assignee", "book", "events", "user"]);
    expect(keys(rel.books.relations)).toEqual(["letters", "orders", "photos", "questions", "user"]);
    expect(keys(rel.giftCards.relations)).toEqual(["promo"]);
    expect(keys(rel.crmDeals.relations)).toEqual(["assignee", "client", "order", "stage"]);
    expect(keys(rel.crmConversations.relations)).toEqual(["assignee", "client", "deal", "messages"]);
  });
});
