import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from "@nestjs/common";
import { WORKER_PORTS, type WorkerPorts } from "./worker.tokens";

/**
 * Фон процесса-воркера в жизненном цикле Nest: при старте — подготовка, ожидание миграций, запуск проходов; при
 * остановке (SIGTERM от PM2) — отпускаем процесс через 2 с: текущий проход дописывается, PM2 добьёт по kill_timeout.
 */
@Injectable()
export class BackgroundRunner implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly log = new Logger("worker");
  /** Таймеры фона сделаны unref — процесс держим сами, пока его не остановят. */
  private keepAlive: ReturnType<typeof setInterval> | null = null;

  constructor(@Inject(WORKER_PORTS) private readonly ports: WorkerPorts) {}

  async onApplicationBootstrap() {
    this.keepAlive = setInterval(() => {}, 1 << 30);
    await this.ports.prepare();
    await this.ports.waitForMigrations();
    await this.ports.start();
    this.log.log(`background jobs started (pid ${process.pid}, nest)`);
  }

  onApplicationShutdown(signal?: string) {
    this.log.log(`${signal ?? "shutdown"}, stopping`);
    if (this.keepAlive) clearInterval(this.keepAlive);
    this.keepAlive = null;
    setTimeout(() => process.exit(0), 2_000).unref();
  }
}
