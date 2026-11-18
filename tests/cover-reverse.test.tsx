import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { renderCover, withReverseMarks } from "@/modules/production/infrastructure/pdf/render";
import type { Book } from "@/shared/infrastructure/db/schema";
import { hasTool } from "./pdf-inspect";

// 18.11.2026: типография просит печатать на обороте листа обложки разметку — куда класть картон крышек и корешка.
const now = new Date();
const book = { id: "00000000-0000-0000-0000-000000000001", userId: "00000000-0000-0000-0000-000000000002", theme: "love", status: "ordered", title: "Махаббатымыздың тарихы", subtitle: "", authorName: "Нурлыбек", authorGender: "m", recordedBy: "", recipientName: "Гаухар", recipientGender: "f", hideRecipientOnCover: false, namesOnCover: "", coverTemplate: "peony", coverPhotoId: null, coverPhotoExtra: [], backText: "", backLayout: "quote", backPhotoId: null, backPhotoExtra: [], photoFrames: {}, dedication: "", interior: "classic", interiorStyle: {}, coverDesign: null, coverBack: null, format: "a5", photoPlacement: "chapters", showToc: true, tocMode: "chapters", tocLines: {}, layoutRev: 2, paginationRev: 1, inviteToken: null, inviteText: "", occasion: null, occasionDate: null, language: "ru", createdAt: now, updatedAt: now } as unknown as Book;

describe("оборот листа обложки", () => {
  it.skipIf(!hasTool("pdftotext"))("вторая страница cover.pdf — разметка крышек и корешка с номером заказа, того же размера", async () => {
    const bundle = { book, questions: [], chapters: [], photos: [] };
    const cover = await renderCover(bundle, 196, "preview");
    const pdf = await withReverseMarks(bundle, cover, 196, { number: 82 });
    const file = path.join(mkdtempSync(path.join(tmpdir(), "cover-rev-")), "cover.pdf");
    writeFileSync(file, pdf);
    const info = execFileSync("pdfinfo", ["-f", "1", "-l", "2", file]).toString();
    expect(info).toMatch(/Pages:\s+2/);
    const sizes = [...info.matchAll(/Page\s+\d size:\s+([\d.]+) x ([\d.]+)/g)].map((m) => `${m[1]}x${m[2]}`);
    expect(sizes[0]).toBe(sizes[1]);
    // Подписи набраны с разрядкой: pdftotext вставляет пробелы между буквами — сравниваем без пробелов.
    const text = execFileSync("pdftotext", ["-f", "2", "-l", "2", file, "-"]).toString().replace(/\s+/g, "");
    for (const s of ["ЛИЦЕВАЯКРЫШКА", "ЗАДНЯЯКРЫШКА", "КОРЕШОК", "Заказ№82", "Махаббатымыздыңтарихы"]) expect(text).toContain(s);
  });
});
