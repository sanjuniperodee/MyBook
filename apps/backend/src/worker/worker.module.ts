import { Module } from "@nestjs/common";
import { legacyWorkerPorts } from "../legacy/worker.ports";
import { BackgroundRunner } from "./background.runner";

/**
 * Процесс-воркер на Nest (ADR 0014, шаг 6): standalone-приложение без HTTP. Работа — та же, что у прежнего
 * mybook-worker (src/worker/run.ts, через порт WORKER_PORTS); вёрстка PDF остаётся дочерним процессом pdf-worker.
 */
@Module({ providers: [legacyWorkerPorts, BackgroundRunner] })
export class WorkerModule {}
