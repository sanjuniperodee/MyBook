import { SalesError, type StageMilestone } from "../domain";

/** Хранилище воронок и этапов (настройки CRM). */
export interface PipelineRepository {
  stage(id: string): Promise<{ id: string; pipelineId: string; name: string; kind: "open" | "won" | "lost"; position: number } | null>;
  stages(pipelineId: string): Promise<{ id: string; kind: "open" | "won" | "lost"; position: number }[]>;
  dealsOnStage(stageId: string): Promise<number>;
  dealsInPipeline(pipelineId: string): Promise<number>;
  /** Одно событие — один этап в воронке: снять событие с остальных этапов. */
  releaseMilestone(pipelineId: string, milestone: StageMilestone, exceptStageId: string | null): Promise<void>;
  updateStage(id: string, patch: { name: string; color: string; milestone: StageMilestone | null }): Promise<void>;
  /** Новый открытый этап — перед закрывающими (успех/отказ). */
  insertOpenStage(pipelineId: string, stage: { name: string; color: string; milestone: StageMilestone | null }): Promise<void>;
  swapPositions(a: { id: string; position: number }, b: { id: string; position: number }): Promise<void>;
  deleteStage(id: string): Promise<void>;
  createPipeline(name: string, stages: { name: string; color: string; kind: "open" | "won" | "lost" }[]): Promise<{ id: string; name: string }>;
  renamePipeline(id: string, name: string): Promise<void>;
  deletePipeline(id: string): Promise<void>;
}

/** Настройка воронок: этапы «успех» и «отказ» обязательны, в работе остаётся хотя бы один этап. */
export class PipelinesService {
  constructor(
    private readonly repo: PipelineRepository,
    private readonly defaultPipelineId: () => Promise<string>,
  ) {}

  async saveStage(input: { id: string | null; pipelineId: string | null; name: string; color: string; milestone: StageMilestone | null }) {
    const existing = input.id ? await this.repo.stage(input.id) : null;
    if (input.id && !existing) throw new SalesError("stageNotFound", "Этап не найден");
    const pipelineId = existing?.pipelineId ?? input.pipelineId ?? (await this.defaultPipelineId());
    if (input.milestone) await this.repo.releaseMilestone(pipelineId, input.milestone, input.id);
    const patch = { name: input.name, color: input.color, milestone: input.milestone };
    if (existing) await this.repo.updateStage(existing.id, patch);
    else await this.repo.insertOpenStage(pipelineId, patch);
  }

  /** Сдвинуть этап «в работе» на одну позицию; закрывающие этапы остаются в конце. */
  async moveStage(id: string, dir: -1 | 1) {
    const self = await this.repo.stage(id);
    if (!self) return;
    const stages = await this.repo.stages(self.pipelineId);
    const i = stages.findIndex((s) => s.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= stages.length || stages[i].kind !== "open" || stages[j].kind !== "open") return;
    await this.repo.swapPositions(stages[i], stages[j]);
  }

  async deleteStage(id: string) {
    const stage = await this.repo.stage(id);
    if (!stage) return null;
    if (stage.kind !== "open") throw new SalesError("stageProtected", "Этапы «успех» и «отказ» нужны воронке — их можно только переименовать");
    const open = (await this.repo.stages(stage.pipelineId)).filter((s) => s.kind === "open").length;
    if (open <= 1) throw new SalesError("lastOpenStage", "В воронке должен остаться хотя бы один этап в работе");
    const deals = await this.repo.dealsOnStage(stage.id);
    if (deals) throw new SalesError("stageHasDeals", `На этапе ${deals} сделок — сначала перенесите их`);
    await this.repo.deleteStage(stage.id);
    return stage;
  }

  /** Новая воронка сразу с минимальным набором этапов: в работе, успех, отказ. */
  createPipeline(name: string) {
    return this.repo.createPipeline(name, [
      { name: "Новая заявка", color: "#6b8fb5", kind: "open" },
      { name: "В работе", color: "#d09a45", kind: "open" },
      { name: "Успех", color: "#4f9a7e", kind: "won" },
      { name: "Отказ", color: "#b45a5a", kind: "lost" },
    ]);
  }

  renamePipeline(id: string, name: string) {
    return this.repo.renamePipeline(id, name);
  }

  async deletePipeline(id: string) {
    if (id === (await this.defaultPipelineId())) throw new SalesError("pipelineProtected", "Основную воронку удалить нельзя — в неё приходят заявки с сайта, из чатов и звонков");
    const n = await this.repo.dealsInPipeline(id);
    if (n) throw new SalesError("pipelineHasDeals", `В воронке ${n} сделок — сначала перенесите их`);
    await this.repo.deletePipeline(id);
  }
}
