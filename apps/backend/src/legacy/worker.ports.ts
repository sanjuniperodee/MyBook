import type { Provider } from "@nestjs/common";
import { prepareWorker, startWorkerJobs, waitForMigrations } from "@/worker/run";
import { WORKER_PORTS, type WorkerPorts } from "../worker/worker.tokens";

/** Адаптер порта воркера к общей работе процесса mybook-worker (src/worker/run.ts). */
export const legacyWorkerPorts: Provider<WorkerPorts> = {
  provide: WORKER_PORTS,
  useFactory: (): WorkerPorts => ({ prepare: prepareWorker, waitForMigrations, start: startWorkerJobs }),
};
