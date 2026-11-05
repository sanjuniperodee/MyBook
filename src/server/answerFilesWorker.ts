import "server-only";
import { answerFilesWorker } from "@/modules/authoring";
// Каталог для квоты минут подставляет обёртка answerFiles — подключаем её до первого прохода очереди.
import "@/server/answerFiles";

/** Очередь обработки своих видео и аудио (ffmpeg) — обёртка над модулем authoring (infrastructure/answerFilesWorker.ts). */
export const { probe, transcode, kickAnswerFiles } = answerFilesWorker;
