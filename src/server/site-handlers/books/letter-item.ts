import "server-only";
import { LetterPatch } from "@mybook/contracts";
import { NextResponse } from "next/server";
import { api, apiViewer } from "@/server/api";
import { container } from "@/server/container";
import { idParams } from "@/server/input";

type Ctx = { params: Promise<{ id: string; lid: string }> };

/** Схема — из контракта API v1 (LetterPatch): та же, что у PATCH /api/v1/books/{id}/letters/{id}. */
const schema = LetterPatch;

export const PATCH = api(async (req, { params }: Ctx) => {
  const { id, lid } = idParams(await params, "id", "lid");
  const { viewer } = await apiViewer(req, id);
  const authoring = container().authoring;
  await authoring.letters.edit(id, viewer, lid, schema.parse(await req.json()));
  return NextResponse.json({ letter: (await authoring.queries.letters(id)).find((l) => l.id === lid) });
});

export const DELETE = api(async (req, { params }: Ctx) => {
  const { id, lid } = idParams(await params, "id", "lid");
  const { viewer } = await apiViewer(req, id);
  await container().authoring.letters.delete(id, viewer, lid);
  return NextResponse.json({ ok: true });
});
